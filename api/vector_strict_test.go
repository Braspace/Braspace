package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func vecJSON(mut func([]string)) string {
	p := make([]string, vectorDimensions)
	for i := range p {
		p[i] = "0"
	}
	p[0] = "1"
	if mut != nil {
		mut(p)
	}
	return "[" + strings.Join(p, ",") + "]"
}

func strictReq(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/vector/search", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	return r
}

// Audit 2026-11-15 §A: each of these returned 200 on the deployed API.
func TestVectorRequestStrictDecoding(t *testing.T) {
	v := vecJSON(nil)
	for _, tc := range []struct{ name, body, code string }{
		{"null element", `{"model_id":"m","vector":` + vecJSON(func(p []string) { p[1] = "null" }) + `}`, "INVALID_VECTOR"},
		{"null limit", `{"model_id":"m","vector":` + v + `,"limit":null}`, "INVALID_LIMIT"},
		{"limit zero", `{"model_id":"m","vector":` + v + `,"limit":0}`, "INVALID_LIMIT"},
		{"limit 11", `{"model_id":"m","vector":` + v + `,"limit":11}`, "INVALID_LIMIT"},
		{"limit fraction", `{"model_id":"m","vector":` + v + `,"limit":2.5}`, "INVALID_LIMIT"},
		{"uppercase keys", `{"MODEL_ID":"m","VECTOR":` + v + `,"LIMIT":1}`, "INVALID_JSON"},
		{"duplicate key", `{"model_id":"m","vector":` + v + `,"limit":1,"limit":2}`, "INVALID_JSON"},
		{"383 dims", `{"model_id":"m","vector":[` + strings.Repeat("1,", 382) + `1]}`, "INVALID_VECTOR"},
		{"385 dims", `{"model_id":"m","vector":[` + strings.Repeat("1,", 384) + `1]}`, "INVALID_VECTOR"},
		{"zero vector", `{"model_id":"m","vector":` + vecJSON(func(p []string) { p[0] = "0" }) + `}`, "INVALID_VECTOR"},
		{"overflow number", `{"model_id":"m","vector":` + vecJSON(func(p []string) { p[2] = "1e400" }) + `}`, "INVALID_VECTOR"},
		{"vector null", `{"model_id":"m","vector":null}`, "INVALID_VECTOR"},
		{"model number", `{"model_id":7,"vector":` + v + `}`, "INVALID_MODEL"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, code, err := parseVectorRequest(strictReq(tc.body))
			if err == nil || code != tc.code {
				t.Fatalf("got %q %v, want %s", code, err, tc.code)
			}
		})
	}
	req, lit, err := parseVectorRequest(strictReq(`{"model_id":"m","vector":` + v + `}`))
	if err != nil || req.Limit != 5 || !strings.HasPrefix(lit, "[1,0,") {
		t.Fatalf("omitted limit must default to 5: %+v %v %.20s", req, err, lit)
	}
}

// 1e-100 components underflowed to zero in float32 pgvector; scale first.
func TestVectorLiteralScalesTinyMagnitudes(t *testing.T) {
	v := make([]float64, vectorDimensions)
	for i := range v {
		v[i] = 1e-100
	}
	lit, err := vectorLiteral(v)
	if err != nil || strings.Contains(lit, "e-100") || strings.HasPrefix(lit, "[0,") {
		t.Fatalf("tiny vector must normalize, got %v %.40s", err, lit)
	}
}

func TestVectorStatusDisabledState(t *testing.T) {
	w := httptest.NewRecorder()
	(&vectorAPI{}).status(w, httptest.NewRequest("GET", "/api/vector/status", nil))
	var s map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &s)
	if s["state"] != "disabled" || s["available"] != false {
		t.Fatalf("got %v", s)
	}
	w = httptest.NewRecorder()
	(&vectorAPI{enabled: true, modelID: "m"}).status(w, httptest.NewRequest("GET", "/api/vector/status", nil))
	_ = json.Unmarshal(w.Body.Bytes(), &s)
	if s["state"] != "db_down" {
		t.Fatalf("nil pool must be db_down, got %v", s)
	}
}

// Real pgvector: upgrade from the old schema with legacy rows, quarantine,
// every readiness state, rollback and re-apply. TEST_VECTOR_DATABASE_URL must
// point at a disposable database (ci-local creates one).
func TestVectorDBQuarantineAndStates(t *testing.T) {
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
	reset := func() {
		if _, err := pool.Exec(ctx, `DROP TABLE IF EXISTS source_semantic_index; DROP TABLE IF EXISTS source_semantic_ingest_runs`); err != nil {
			t.Fatal(err)
		}
	}
	reset()
	defer reset()
	model := vectorLexicalModelID
	api := &vectorAPI{enabled: true, modelID: model, pool: pool}
	state := func() map[string]any {
		w := httptest.NewRecorder()
		api.status(w, httptest.NewRequest("GET", "/api/vector/status", nil))
		var s map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &s)
		return s
	}
	if s := state(); s["state"] != "schema_unavailable" {
		t.Fatalf("no table: %v", s)
	}
	// Old (main 62bf446) schema + legacy synthetic row with the production model id.
	if _, err := pool.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE source_semantic_index (source_ref text PRIMARY KEY, title text NOT NULL, source_url text NOT NULL,
 sha256 char(64) NOT NULL, model_id text NOT NULL, embedding vector(384) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "schema_unavailable" {
		t.Fatalf("old schema lacks audit columns: %v", s)
	}
	if _, err := pool.Exec(ctx, optionalVectorSQL); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "empty" {
		t.Fatalf("empty: %v", s)
	}
	lit, _ := vectorLiteral(vectorFixture())
	ins := `INSERT INTO source_semantic_index(source_ref,title,source_url,sha256,model_id,embedding) VALUES ($1,'t','https://example.org/x',$2,$3,$4::vector)`
	if _, err := pool.Exec(ctx, ins, "other-model-row", strings.Repeat("b", 64), "other-model", lit); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "model_mismatch" {
		t.Fatalf("model_mismatch: %v", s)
	}
	if _, err := pool.Exec(ctx, ins, "site-synthetic-demo-b", strings.Repeat("a", 64), model, lit); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "legacy_unverified" || s["legacy_unverified_count"] != float64(1) {
		t.Fatalf("legacy_unverified: %v", s)
	}
	w := httptest.NewRecorder()
	api.search(w, strictReq(`{"model_id":"`+model+`","vector":`+vecJSON(nil)+`}`))
	if w.Code != 503 {
		t.Fatalf("legacy-only index must not serve results: %d %s", w.Code, w.Body)
	}
	fsys := os.DirFS("sitedata")
	for i := 0; i < 2; i++ { // idempotent
		if _, err := ingestVectorMetadata(ctx, pool, fsys); err != nil {
			t.Fatal(err)
		}
	}
	s := state()
	if s["state"] != "index_ready" || s["available"] != true || s["legacy_unverified_count"] != float64(1) {
		t.Fatalf("index_ready: %v", s)
	}
	var runs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM source_semantic_ingest_runs`).Scan(&runs)
	if runs != 1 {
		t.Fatalf("idempotent ingest must record one manifest, got %d", runs)
	}
	q, _ := embedProvenanceText("synthetic-demo-b synthetic test fixture")
	qb, _ := json.Marshal(map[string]any{"model_id": model, "vector": q, "limit": 10})
	w = httptest.NewRecorder()
	api.search(w, strictReq(string(qb)))
	if w.Code != 200 {
		t.Fatalf("search %d %s", w.Code, w.Body)
	}
	var res struct{ Results []vectorHit }
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if len(res.Results) == 0 {
		t.Fatal("no audited results")
	}
	for _, h := range res.Results {
		if strings.Contains(h.SourceRef, "synthetic") || h.SourceRef == "other-model-row" {
			t.Fatalf("unaudited row leaked: %s", h.SourceRef)
		}
	}
	var legacy int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM source_semantic_index WHERE source_ref IN ('site-synthetic-demo-b','other-model-row')`).Scan(&legacy)
	if legacy != 2 {
		t.Fatalf("legacy rows must be preserved, have %d", legacy)
	}
	// Rollback keeps every row; re-apply restores the audited index.
	down, err := os.ReadFile("db/optional-vector.down.sql")
	if err != nil {
		t.Fatal(err)
	}
	var before, after int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM source_semantic_index`).Scan(&before)
	if _, err := pool.Exec(ctx, string(down)); err != nil {
		t.Fatal(err)
	}
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM source_semantic_index`).Scan(&after)
	if before != after || state()["state"] != "schema_unavailable" {
		t.Fatalf("rollback lost rows %d->%d or state wrong", before, after)
	}
	if _, err := ingestVectorMetadata(ctx, pool, fsys); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "index_ready" {
		t.Fatalf("re-apply: %v", s)
	}
}
