package main

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

func testVectorManifest(t *testing.T) (*layerCatalog, string, vectorIngestManifest) {
	t.Helper()
	c, sha, err := vectorLayerRegistry()
	if err != nil {
		t.Fatal(err)
	}
	v := make([]*float64, vectorDimensions)
	for i := range v {
		n := float64(0)
		if i == 0 {
			n = 1
		}
		v[i] = &n
	}
	m := vectorIngestManifest{Schema: "braspace.vector-ingest.v1", ModelID: "qa-synthetic-384:deadbeef", ModelRevision: "deadbeef", ModelLicense: "QA-only",
		RegistrySHA256: sha, Entries: []vectorIngestEntry{{LayerID: c.Layers[0].ID, SourceSHA256: c.Layers[0].SHA256, Embedding: v}}}
	return c, sha, m
}
func TestVectorIngestManifestValidation(t *testing.T) {
	c, sha, m := testVectorManifest(t)
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	report, rows, err := validateVectorManifest(raw, c, sha)
	if err != nil || report.Applied || report.ScientificallyValidated || len(rows) != 1 || rows[0].SHA256 != c.Layers[0].SHA256 || len(report.ManifestSHA256) != 64 {
		t.Fatalf("manifest not verified: %+v %+v %v", report, rows, err)
	}
	for name, mutate := range map[string]func(*vectorIngestManifest){
		"model not pinned":  func(m *vectorIngestManifest) { m.ModelID = "qa" },
		"wrong registry":    func(m *vectorIngestManifest) { m.RegistrySHA256 = strings.Repeat("a", 64) },
		"unknown source":    func(m *vectorIngestManifest) { m.Entries[0].LayerID = "unknown" },
		"wrong source hash": func(m *vectorIngestManifest) { m.Entries[0].SourceSHA256 = strings.Repeat("b", 64) },
		"null component":    func(m *vectorIngestManifest) { m.Entries[0].Embedding[1] = nil },
		"duplicate source":  func(m *vectorIngestManifest) { m.Entries = append(m.Entries, m.Entries[0]) },
		"short vector":      func(m *vectorIngestManifest) { m.Entries[0].Embedding = m.Entries[0].Embedding[:383] },
	} {
		t.Run(name, func(t *testing.T) {
			_, _, x := testVectorManifest(t)
			mutate(&x)
			b, _ := json.Marshal(x)
			if _, _, err := validateVectorManifest(b, c, sha); err == nil {
				t.Fatal("accepted invalid operator input")
			}
		})
	}
}
func TestVectorIngestRealPostgres(t *testing.T) {
	uri := os.Getenv("TEST_VECTOR_DATABASE_URL")
	if uri == "" {
		t.Skip("requires isolated pgvector test database")
	}
	ctx := context.Background()
	pool, err := openPool(ctx, uri)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	sql, err := os.ReadFile("db/optional-vector.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	c, sha, m := testVectorManifest(t)
	m.ModelID = "qa-braspace-ingest:deadbeef"
	raw, _ := json.Marshal(m)
	rep, rows, err := validateVectorManifest(raw, c, sha)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM public.source_semantic_index WHERE model_id IN ('qa-braspace-ingest:deadbeef','qa-braspace-ingest:deadbeef2')")
		_, _ = pool.Exec(ctx, "DELETE FROM public.source_semantic_ingest_runs WHERE model_id IN ('qa-braspace-ingest:deadbeef','qa-braspace-ingest:deadbeef2')")
	}()
	for i := 0; i < 2; i++ {
		if err = applyVectorManifest(ctx, pool, rep, rows); err != nil {
			t.Fatal(err)
		}
	}
	var n int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM public.source_semantic_index WHERE model_id=$1", rep.ModelID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("not idempotent: %d %v", n, err)
	}
	var audit string
	if err = pool.QueryRow(ctx, `SELECT i.ingest_manifest_sha256 FROM public.source_semantic_index i JOIN public.source_semantic_ingest_runs r ON i.ingest_manifest_sha256=r.manifest_sha256 WHERE i.model_id=$1 AND r.entry_count=1`, rep.ModelID).Scan(&audit); err != nil || audit != rep.ManifestSHA256 {
		t.Fatalf("missing import provenance: %q %v", audit, err)
	}
	m.ModelID = "qa-braspace-ingest:deadbeef2"
	m.ModelRevision = "deadbeef2"
	raw, _ = json.Marshal(m)
	other, otherRows, err := validateVectorManifest(raw, c, sha)
	if err != nil {
		t.Fatal(err)
	}
	if err = applyVectorManifest(ctx, pool, other, otherRows); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM public.source_semantic_index WHERE source_ref=$1 AND model_id IN ($2,$3)", rows[0].Ref, rep.ModelID, other.ModelID).Scan(&n); err != nil || n != 2 {
		t.Fatalf("cross-model overwrite: %d %v", n, err)
	}
}

// Production compose (pre-#279) runs `api vector-ingest` with no flags. That
// must fail loudly with the required invocation, never a silent exit 2.
func TestVectorIngestCLIUsageIsExplicit(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stderr
	os.Stderr = w
	code := runVectorIngestCLI(nil)
	w.Close()
	os.Stderr = old
	msg, _ := io.ReadAll(r)
	if code != 2 || !strings.Contains(string(msg), "-lexical") || !strings.Contains(string(msg), "-input") {
		t.Fatalf("exit %d, stderr %q", code, msg)
	}
}
