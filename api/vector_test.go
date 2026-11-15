package main

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// A connection refusal at startup must not permanently disable the optional API.
// A fake socket does not speak PostgreSQL, so readiness stays fail-closed, but
// accepting a new TCP connection proves the existing registered pool retried.
func TestVectorRegistrationRetriesAfterStartupRefusal(t *testing.T) {
	reserved, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skipf("loopback listen unavailable: %v", err)
	}
	address := reserved.Addr().String()
	reserved.Close()
	t.Setenv("BRASPACE_VECTOR_ENABLED", "1")
	t.Setenv("BRASPACE_VECTOR_MODEL_ID", "qa-model")
	t.Setenv("VECTOR_DATABASE_URL", "postgres://qa:qa@"+address+"/qa?sslmode=disable")
	mux := http.NewServeMux()
	registerVectorAPI(mux)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	accepted := make(chan struct{})
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			conn.Close()
			close(accepted)
		}
	}()
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/vector/status", nil))
	var status map[string]any
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &status) != nil || status["available"] != false || status["enabled"] != true {
		t.Fatalf("must remain fail-closed: %d %s", w.Code, w.Body)
	}
	select {
	case <-accepted:
	case <-time.After(50 * time.Millisecond):
		t.Fatal("registered API did not retry post-startup connection")
	}
}

func vectorFixture() []float64 { v := make([]float64, vectorDimensions); v[0] = 1; return v }
func TestVectorLiteralBoundaries(t *testing.T) {
	ok, err := vectorLiteral(vectorFixture())
	if err != nil || !strings.HasPrefix(ok, "[1,0,") {
		t.Fatalf("valid: %s %v", ok, err)
	}
	for name, v := range map[string][]float64{
		"short": []float64{1}, "zero": make([]float64, 384),
		"nan":      func() []float64 { v := vectorFixture(); v[2] = math.NaN(); return v }(),
		"infinite": func() []float64 { v := vectorFixture(); v[3] = math.Inf(1); return v }(),
		"huge":     func() []float64 { v := vectorFixture(); v[3] = 2e6; return v }(),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := vectorLiteral(v); err == nil {
				t.Fatal("accepted unsafe vector")
			}
		})
	}
}
func vectorRequest(model string, vec []float64, limit int) string {
	body, _ := json.Marshal(vectorSearchRequest{ModelID: model, Vector: vec, Limit: limit})
	return string(body)
}
func TestVectorRequestJSONAndLimits(t *testing.T) {
	body := vectorRequest("qa-synthetic-384", vectorFixture(), 3)
	request := func(body, ct string) *http.Request {
		req := httptest.NewRequest(http.MethodPost, "/api/vector/search", strings.NewReader(body))
		req.Header.Set("Content-Type", ct)
		return req
	}
	if req, _, err := parseVectorRequest(request(body, "application/json; charset=utf-8")); err != nil || req.Limit != 3 {
		t.Fatalf("valid %v %+v", err, req)
	}
	for _, tc := range []struct{ name, body, ct, code string }{
		{"bad model", vectorRequest("../key", vectorFixture(), 3), "application/json", "INVALID_MODEL"},
		{"huge limit", vectorRequest("model", vectorFixture(), 99), "application/json", "INVALID_LIMIT"},
		{"wrong content", body, "text/plain", "UNSUPPORTED_MEDIA_TYPE"},
		{"trailing document", body + "{}", "application/json", "INVALID_JSON"},
		{"unknown key", strings.Replace(body, `"model_id":`, `"unknown":1,"model_id":`, 1), "application/json", "INVALID_JSON"},
		{"too big", strings.Repeat("x", vectorMaxRequestBytes+1), "application/json", "REQUEST_TOO_LARGE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, code, err := parseVectorRequest(request(tc.body, tc.ct))
			if err == nil || code != tc.code {
				t.Fatalf("got %s %v want %s", code, err, tc.code)
			}
		})
	}
}
func TestVectorRoutesDisabledByDefault(t *testing.T) {
	t.Setenv("BRASPACE_VECTOR_ENABLED", "0")
	h := routes("/nonexistent/engine")
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/api/vector/status", nil))
	if r.Code != 200 {
		t.Fatalf("status %d", r.Code)
	}
	var s map[string]any
	if err := json.Unmarshal(r.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if s["enabled"] != false || s["available"] != false || s["scientifically_validated"] != false {
		t.Fatalf("misleading metadata %v", s)
	}
	req := httptest.NewRequest("POST", "/api/vector/search", strings.NewReader(vectorRequest("qa-synthetic-384", vectorFixture(), 3)))
	req.Header.Set("Content-Type", "application/json")
	r = httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != 503 {
		t.Fatalf("must fail closed, got %d", r.Code)
	}
}
func TestVectorPostgresOptionalIntegration(t *testing.T) {
	uri := os.Getenv("TEST_VECTOR_DATABASE_URL")
	if uri == "" {
		t.Skip("requires real pgvector test service")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, uri)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	raw, err := os.ReadFile(filepath.Join("db", "optional-vector.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(raw)); err != nil {
		t.Fatalf("optional schema cannot initialize: %v", err)
	}
	model := "qa-synthetic-384"
	v1 := vectorFixture()
	v2 := make([]float64, vectorDimensions)
	v2[1] = 1
	literal1, _ := vectorLiteral(v1)
	literal2, _ := vectorLiteral(v2)
	for _, entry := range []struct{ id, title, url, vec string }{
		{"qa-braspace-source-a", "Synthetic test A", "https://example.org/qa-a", literal1},
		{"qa-braspace-source-b", "Synthetic test B", "https://example.org/qa-b", literal2},
	} {
		_, err := pool.Exec(ctx, `INSERT INTO source_semantic_index(source_ref,title,source_url,sha256,model_id,embedding)
  VALUES ($1,$2,$3,$4,$5,$6::vector) ON CONFLICT(source_ref) DO UPDATE SET embedding=EXCLUDED.embedding`,
			entry.id, entry.title, entry.url, strings.Repeat("a", 64), model, entry.vec)
		if err != nil {
			t.Fatal(err)
		}
	}
	defer pool.Exec(context.Background(), `DELETE FROM source_semantic_index WHERE source_ref LIKE 'qa-braspace-source-%'`)
	api := &vectorAPI{enabled: true, modelID: model, pool: pool}
	if !api.ready(ctx) {
		t.Fatal("pgvector extension and table should be ready")
	}
	req := httptest.NewRequest("POST", "/api/vector/search", bytes.NewBufferString(vectorRequest(model, v1, 2)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	api.search(w, req)
	if w.Code != 200 {
		t.Fatalf("HTTP %d: %s", w.Code, w.Body)
	}
	var res struct {
		Results                 []vectorHit `json:"results"`
		ScientificallyValidated bool        `json:"scientifically_validated"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Results) != 2 || res.Results[0].SourceRef != "qa-braspace-source-a" || res.ScientificallyValidated || res.Results[0].Similarity < 0.99 {
		t.Fatalf("misleading or incorrectly ranked metadata: %+v", res)
	}
	// A vector from a different model must be rejected, never silently projected.
	wrong := httptest.NewRequest("POST", "/api/vector/search", strings.NewReader(vectorRequest("some-other-model", v1, 2)))
	wrong.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	api.search(w, wrong)
	if w.Code != 422 {
		t.Fatalf("model mismatch must be 422, got %d", w.Code)
	}
}
