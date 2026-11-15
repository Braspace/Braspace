package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// Ported from #331 (vector_strict_test.go) onto main's #363 strict parser and
// manifest-based vector-ingest. Where #331 and main disagree on an error code,
// main's existing contract wins (noted inline).

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
		{"overflow number", `{"model_id":"m","vector":` + vecJSON(func(p []string) { p[2] = "1e400" }) + `}`, "INVALID_JSON"}, // main: JSON type error
		{"vector null", `{"model_id":"m","vector":null}`, "INVALID_VECTOR"},
		{"model number", `{"model_id":7,"vector":` + v + `}`, "INVALID_JSON"}, // main: JSON type error
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
	ctx := context.Background()
	pool := vectorTestDatabase(t) // disposable database; skips without TEST_VECTOR_DATABASE_URL
	model := vectorLexicalModelID
	// main's production path: optional-vector.sql + pinned lexical manifest, applied in one transaction.
	catalog, registrySHA, err := vectorLayerRegistry()
	if err != nil {
		t.Fatal(err)
	}
	lexical, err := lexicalVectorManifest(catalog, registrySHA)
	if err != nil {
		t.Fatal(err)
	}
	report, manifestRows, err := validateVectorManifest(lexical, catalog, registrySHA)
	if err != nil {
		t.Fatal(err)
	}
	ingest := func() error {
		if _, err := pool.Exec(ctx, optionalVectorSQL); err != nil {
			return err
		}
		return applyVectorManifest(ctx, pool, report, manifestRows)
	}
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
	for i := 0; i < 2; i++ { // idempotent
		if err := ingest(); err != nil {
			t.Fatal(err)
		}
	}
	s := state()
	if s["state"] != "index_ready" || s["available"] != true || s["legacy_unverified_count"] != float64(1) ||
		s["audited_count"] != float64(report.Entries) || s["other_model_count"] != float64(1) || s["ingest_manifest_sha256"] != report.ManifestSHA256 {
		t.Fatalf("index_ready: %v (manifest %s, %d entries)", s, report.ManifestSHA256, report.Entries)
	}
	var runs int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM source_semantic_ingest_runs`).Scan(&runs)
	if runs != 1 {
		t.Fatalf("idempotent ingest must record one manifest, got %d", runs)
	}
	q, _ := embedProvenanceText(manifestRows[0].Title)
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
	audited := map[string]bool{}
	for _, r := range manifestRows {
		audited[r.Ref] = true
	}
	for _, h := range res.Results {
		if strings.Contains(h.SourceRef, "synthetic") || h.SourceRef == "other-model-row" || !audited[h.SourceRef] {
			t.Fatalf("unaudited row leaked: %s", h.SourceRef)
		}
	}
	// A row from an older (stale) audited manifest of the same model is also
	// quarantined: only the most recently APPLIED manifest is served, even when the
	// ledger holds a run with a later ingested_at (an older manifest replayed after it).
	stale := strings.Repeat("e", 64)
	if _, err := pool.Exec(ctx, `INSERT INTO source_semantic_ingest_runs(manifest_sha256,source_registry_sha256,model_id,model_revision,model_license,entry_count,ingested_at)
		VALUES ($1,$2,$3,'qa-stale','QA-only',1,now()+interval '1 hour')`, stale, registrySHA, model); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO source_semantic_index(source_ref,title,source_url,sha256,model_id,embedding,ingest_manifest_sha256,updated_at)
		VALUES ('qa-stale-row',$1,'https://example.org/stale',$2,$3,$4::vector,$5,now()-interval '1 day')`,
		manifestRows[0].Title, strings.Repeat("f", 64), model, manifestRows[0].Literal, stale); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "index_ready" || s["legacy_unverified_count"] != float64(2) || s["ingest_manifest_sha256"] != report.ManifestSHA256 {
		t.Fatalf("stale manifest must be legacy: %v", s)
	}
	w = httptest.NewRecorder()
	api.search(w, strictReq(string(qb)))
	if w.Code != 200 || strings.Contains(w.Body.String(), "qa-stale-row") {
		t.Fatalf("stale audited row leaked: %d %s", w.Code, w.Body)
	}
	// Replaying the current manifest keeps it current (ledger is ON CONFLICT DO NOTHING).
	if err := ingest(); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["ingest_manifest_sha256"] != report.ManifestSHA256 {
		t.Fatalf("replay changed the current manifest: %v", s)
	}
	var legacy int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM source_semantic_index WHERE source_ref IN ('site-synthetic-demo-b','other-model-row','qa-stale-row')`).Scan(&legacy)
	if legacy != 3 {
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
	if err := ingest(); err != nil {
		t.Fatal(err)
	}
	if s := state(); s["state"] != "index_ready" {
		t.Fatalf("re-apply: %v", s)
	}
}
