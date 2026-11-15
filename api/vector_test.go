package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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
	for _, scale := range []float64{math.SmallestNonzeroFloat64, 1e-300, 1e-100, 1e6} {
		v := vectorFixture()
		v[0] = scale
		got, err := vectorLiteral(v)
		if err != nil || got != ok {
			t.Fatalf("cosine-equivalent vector at %g changed: %s %v", scale, got, err)
		}
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
	if req, _, err := parseVectorRequest(request(strings.Replace(body, `,"limit":3`, ``, 1), "application/json")); err != nil || req.Limit != 5 {
		t.Fatalf("omitted limit must default: %v %+v", err, req)
	}
	for _, tc := range []struct{ name, body, ct, code string }{
		{"bad model", vectorRequest("../key", vectorFixture(), 3), "application/json", "INVALID_MODEL"},
		{"huge limit", vectorRequest("model", vectorFixture(), 99), "application/json", "INVALID_LIMIT"},
		{"zero limit", vectorRequest("model", vectorFixture(), 0), "application/json", "INVALID_LIMIT"},
		{"null limit", strings.Replace(body, `"limit":3`, `"limit":null`, 1), "application/json", "INVALID_LIMIT"},
		{"fractional limit", strings.Replace(body, `"limit":3`, `"limit":3.2`, 1), "application/json", "INVALID_LIMIT"},
		{"string limit", strings.Replace(body, `"limit":3`, `"limit":"3"`, 1), "application/json", "INVALID_LIMIT"},
		{"null element", strings.Replace(body, `[1,0,`, `[1,null,`, 1), "application/json", "INVALID_VECTOR"},
		{"null vector", `{"model_id":"model","vector":null}`, "application/json", "INVALID_VECTOR"},
		{"missing vector", `{"model_id":"model"}`, "application/json", "INVALID_VECTOR"},
		{"zero vector", vectorRequest("model", make([]float64, vectorDimensions), 3), "application/json", "INVALID_VECTOR"},
		{"wrong content", body, "text/plain", "UNSUPPORTED_MEDIA_TYPE"},
		{"trailing document", body + "{}", "application/json", "INVALID_JSON"},
		{"unknown key", strings.Replace(body, `"model_id":`, `"unknown":1,"model_id":`, 1), "application/json", "INVALID_JSON"},
		{"duplicate key", strings.Replace(body, `"model_id":`, `"model_id":"first","model_id":`, 1), "application/json", "INVALID_JSON"},
		{"case variant", strings.Replace(body, `"model_id":`, `"MODEL_ID":`, 1), "application/json", "INVALID_JSON"},
		{"null document", `null`, "application/json", "INVALID_JSON"},
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

func TestVectorHitValidation(t *testing.T) {
	good := vectorHit{"nasa-source", "NASA source", "https://science.nasa.gov/moon/", strings.Repeat("a", 64), -1}
	if !validVectorHit(good) {
		t.Fatal("valid metadata rejected")
	}
	for name, mutate := range map[string]func(*vectorHit){
		"bad hash":        func(h *vectorHit) { h.SHA256 = strings.Repeat("g", 64) },
		"blank ref":       func(h *vectorHit) { h.SourceRef = " " },
		"blank title":     func(h *vectorHit) { h.Title = "  " },
		"missing host":    func(h *vectorHit) { h.SourceURL = "https:///not-a-host" },
		"relative":        func(h *vectorHit) { h.SourceURL = "/wrong" },
		"credentials":     func(h *vectorHit) { h.SourceURL = "https://nasa.gov@evil.test/" },
		"similarity high": func(h *vectorHit) { h.Similarity = 1.05 },
		"similarity nan":  func(h *vectorHit) { h.Similarity = math.NaN() },
	} {
		t.Run(name, func(t *testing.T) {
			bad := good
			mutate(&bad)
			if validVectorHit(bad) {
				t.Fatal("accepted malformed metadata")
			}
		})
	}
}

func TestVectorRoutesDisabledByDefault(t *testing.T) {
	t.Setenv("BRASPACE_VECTOR_ENABLED", "0")
	h := http.NewServeMux()
	registerVectorAPI(h)
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

func TestVectorEnabledMisconfigured(t *testing.T) {
	t.Setenv("BRASPACE_VECTOR_ENABLED", "1")
	t.Setenv("BRASPACE_VECTOR_MODEL_ID", "invalid model with secrets")
	t.Setenv("VECTOR_DATABASE_URL", "")
	t.Setenv("DATABASE_URL", "")
	h := http.NewServeMux()
	registerVectorAPI(h)
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/api/vector/status", nil))
	var s map[string]any
	if err := json.Unmarshal(r.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	if r.Code != 200 || s["enabled"] != true || s["available"] != false || s["model_id"] != "" {
		t.Fatalf("misconfigured status: %d %v", r.Code, s)
	}
	r = httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("POST", "/api/vector/search", nil))
	if r.Code != 503 {
		t.Fatalf("unconfigured search %d", r.Code)
	}
}

// Tests deliberately create an ephemeral database instead of altering or
// deleting rows in the operator-supplied database. CI's dedicated test
// role must have CREATEDB and the extension installation privileges.
func vectorTestDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	uri := os.Getenv("TEST_VECTOR_DATABASE_URL")
	if uri == "" {
		t.Skip("requires real pgvector test service")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, uri)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("qa_braspace_vector_%d", time.Now().UnixNano())
	ident := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+ident); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		defer admin.Close()
		if _, err := admin.Exec(ctx, "DROP DATABASE "+ident); err != nil {
			t.Errorf("clean transient test DB: %v", err)
		}
	})
	cfg, err := pgxpool.ParseConfig(uri)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestVectorPostgresOptionalIntegration(t *testing.T) {
	ctx := context.Background()
	pool := vectorTestDatabase(t)
	model := "qa-synthetic-384"
	api := &vectorAPI{enabled: true, modelID: model, pool: pool}
	if api.ready(ctx) {
		t.Fatal("fresh database should not advertise vector readiness")
	}
	if _, err := pool.Exec(ctx, `CREATE EXTENSION vector WITH SCHEMA public;
		CREATE TABLE public.source_semantic_index (source_ref text PRIMARY KEY, title text NOT NULL, source_url text NOT NULL,
		sha256 char(64) NOT NULL, model_id text NOT NULL, embedding public.vector(3) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		t.Fatal(err)
	}
	if api.ready(ctx) {
		t.Fatal("wrong dimensions advertised ready")
	}
	// Restore the exact former 384D schema before upgrading; this is an empty,
	// disposable database created above, not the operator's existing DB.
	if _, err := pool.Exec(ctx, `ALTER TABLE public.source_semantic_index ALTER COLUMN embedding TYPE public.vector(384)`); err != nil {
		t.Fatal(err)
	}
	v1 := vectorFixture()
	v2 := make([]float64, vectorDimensions)
	v2[1] = 1
	v3 := make([]float64, vectorDimensions)
	v3[0] = -1
	literal1, _ := vectorLiteral(v1)
	literal2, _ := vectorLiteral(v2)
	literal3, _ := vectorLiteral(v3)
	insert := func(id, title, url, model, vec string) error {
		_, err := pool.Exec(ctx, `INSERT INTO public.source_semantic_index(source_ref,title,source_url,sha256,model_id,embedding)
			VALUES ($1,$2,$3,$4,$5,$6::public.vector)`, id, title, url, strings.Repeat("a", 64), model, vec)
		return err
	}
	if err := insert("qa-braspace-source-a", "Legacy source A", "https://example.org/qa-a", "qa-previous-model", literal1); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("db", "optional-vector.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for attempt := 0; attempt < 2; attempt++ {
		if _, err := pool.Exec(ctx, string(raw)); err != nil {
			t.Fatalf("optional schema apply #%d: %v", attempt+1, err)
		}
	}
	if !api.ready(ctx) {
		t.Fatal("pgvector extension and schema should be ready")
	}
	var legacyModel, legacyTitle string
	if err := pool.QueryRow(ctx, `SELECT model_id,title FROM public.source_semantic_index WHERE source_ref='qa-braspace-source-a'`).Scan(&legacyModel, &legacyTitle); err != nil || legacyModel != "qa-previous-model" || legacyTitle != "Legacy source A" {
		t.Fatalf("legacy row lost or overwritten: %s %s %v", legacyModel, legacyTitle, err)
	}
	request := func(requestBody, contentType string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/api/vector/search", bytes.NewBufferString(requestBody))
		req.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		api.search(w, req)
		return w
	}
	w := request(vectorRequest(model, v1, 2), "application/json")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"results":[]`) {
		t.Fatalf("valid empty model index: HTTP %d %s", w.Code, w.Body)
	}
	for _, entry := range []struct{ id, title, vec string }{
		{"qa-braspace-source-c", "Tie C", literal1},
		{"qa-braspace-source-b", "Orthogonal B", literal2},
		{"qa-braspace-source-a", "Current source A", literal1},
		{"qa-braspace-source-d", "Opposite D", literal3},
	} {
		if err := insert(entry.id, entry.title, "https://example.org/qa", model, entry.vec); err != nil {
			t.Fatal(err)
		}
	}
	if err := insert("qa-braspace-source-a", "Duplicate", "https://example.org/qa", model, literal1); err == nil {
		t.Fatal("duplicate source+model unexpectedly accepted")
	}
	var duplicateModelCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.source_semantic_index WHERE source_ref='qa-braspace-source-a'`).Scan(&duplicateModelCount); err != nil || duplicateModelCount != 2 {
		t.Fatalf("model versions not preserved: %d %v", duplicateModelCount, err)
	}
	zeroLiteral := "[" + strings.Repeat("0,", vectorDimensions-1) + "0]"
	if err := insert("qa-zero", "Zero vector", "https://example.org/qa", model, zeroLiteral); err == nil {
		t.Fatal("schema accepted zero vector")
	}
	if _, err := pool.Exec(ctx, `UPDATE public.source_semantic_index SET ingest_manifest_sha256=$1 WHERE source_ref='qa-braspace-source-a' AND model_id=$2`, strings.Repeat("b", 64), model); err == nil {
		t.Fatal("schema accepted absent audit manifest")
	}
	for i := 0; i < 3; i++ {
		w = request(vectorRequest(model, v1, 5), "application/json")
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
		if len(res.Results) != 4 || res.ScientificallyValidated {
			t.Fatalf("bad result counts/provenance: %+v", res)
		}
		want := []string{"qa-braspace-source-a", "qa-braspace-source-c", "qa-braspace-source-b", "qa-braspace-source-d"}
		for j, ref := range want {
			if res.Results[j].SourceRef != ref {
				t.Fatalf("unstable or wrong ranking: %+v", res)
			}
		}
		if res.Results[0].Similarity < 0.99 || math.Abs(res.Results[2].Similarity) > 1e-6 || res.Results[3].Similarity > -0.99 {
			t.Fatalf("wrong cosine similarities: %+v", res)
		}
	}
	w = request(vectorRequest("some-other-model", v1, 2), "application/json")
	if w.Code != 422 || !strings.Contains(w.Body.String(), `"code":"MODEL_MISMATCH"`) {
		t.Fatalf("model mismatch must be 422, got %d %s", w.Code, w.Body)
	}
	w = request(strings.Replace(vectorRequest(model, v1, 2), `[1,0,`, `[1,null,`, 1), "application/json")
	if w.Code != 422 || !strings.Contains(w.Body.String(), `"code":"INVALID_VECTOR"`) {
		t.Fatalf("null vector must be 422, got %d %s", w.Code, w.Body)
	}
	// SQL retains basic legacy constraints; malformed HTTPS syntax and blank
	// metadata must still be rejected before any response reaches the UI.
	if err := insert("qa-braspace-malformed", "Malformed URL", "https://nasa.gov@evil.test", model, literal1); err != nil {
		t.Fatal(err)
	}
	w = request(vectorRequest(model, v1, 10), "application/json")
	if w.Code != 503 || !strings.Contains(w.Body.String(), `"code":"VECTOR_UNAVAILABLE"`) {
		t.Fatalf("malformed stored metadata leaked: %d %s", w.Code, w.Body)
	}
}

func TestVectorSchemaMigrationAtomicRollback(t *testing.T) {
	ctx := context.Background()
	pool := vectorTestDatabase(t)
	if _, err := pool.Exec(ctx, `CREATE EXTENSION vector WITH SCHEMA public;
		CREATE TABLE public.source_semantic_index (source_ref text PRIMARY KEY, title text NOT NULL, source_url text NOT NULL,
		sha256 char(64) NOT NULL, model_id text NOT NULL, embedding public.vector(384) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		t.Fatal(err)
	}
	zeroLiteral := "[" + strings.Repeat("0,", vectorDimensions-1) + "0]"
	if _, err := pool.Exec(ctx, `INSERT INTO public.source_semantic_index(source_ref,title,source_url,sha256,model_id,embedding)
		VALUES ('legacy-zero','Legacy zero','https://example.org/legacy',$1,'legacy-model',$2::public.vector)`, strings.Repeat("a", 64), zeroLiteral); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("db", "optional-vector.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(raw)); err == nil {
		t.Fatal("corrupt legacy vector should block migration")
	}
	var rowCount int
	var singleKey, auditAbsent bool
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.source_semantic_index WHERE source_ref='legacy-zero'`).Scan(&rowCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT cardinality(conkey)=1 FROM pg_constraint WHERE contype='p' AND conrelid='public.source_semantic_index'::regclass`).Scan(&singleKey); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.source_semantic_ingest_runs') IS NULL`).Scan(&auditAbsent); err != nil {
		t.Fatal(err)
	}
	if rowCount != 1 || !singleKey || !auditAbsent {
		t.Fatalf("partial migration changed legacy state: count=%d key=%v auditAbsent=%v", rowCount, singleKey, auditAbsent)
	}
}

func TestVectorReadinessChecksPermissions(t *testing.T) {
	ctx := context.Background()
	admin := vectorTestDatabase(t)
	raw, err := os.ReadFile(filepath.Join("db", "optional-vector.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec(ctx, string(raw)); err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("qa_vector_role_%d", time.Now().UnixNano())
	ident := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE ROLE "+ident+" NOLOGIN"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if _, err := admin.Exec(ctx, "DROP OWNED BY "+ident); err != nil {
			t.Errorf("clean role grants: %v", err)
		}
		if _, err := admin.Exec(ctx, "DROP ROLE "+ident); err != nil {
			t.Errorf("clean role: %v", err)
		}
	})
	cfg := admin.Config()
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE "+ident)
		return err
	}
	readonly, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(readonly.Close)
	api := &vectorAPI{enabled: true, modelID: "qa-model", pool: readonly}
	if api.ready(ctx) {
		t.Fatal("role without SELECT advertised readiness")
	}
	if _, err := admin.Exec(ctx, "GRANT SELECT ON TABLE public.source_semantic_index TO "+ident); err != nil {
		t.Fatal(err)
	}
	if !api.ready(ctx) {
		t.Fatal("role with SELECT should be ready")
	}
}
