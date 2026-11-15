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

// Invalid flag combinations still fail loudly with the required invocation.
func TestVectorIngestCLIUsageIsExplicit(t *testing.T) {
	for _, args := range [][]string{{"-lexical", "-input", "x.json"}, {"-apply"}, {"stray"}} {
		r, w, err := os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		old := os.Stderr
		os.Stderr = w
		code := runVectorIngestCLI(args)
		w.Close()
		os.Stderr = old
		msg, _ := io.ReadAll(r)
		if code != 2 || !strings.Contains(string(msg), "-lexical") || !strings.Contains(string(msg), "-input") {
			t.Fatalf("%v: exit %d, stderr %q", args, code, msg)
		}
	}
}

// Production compose runs `/app/bin/api vector-ingest` with NO flags and gates the API on exit 0
// (MAC, 15/11). No flags must stay the production path: apply optional-vector.sql, ingest the pinned
// lexical projection idempotently, exit 0. A different pinned model must refuse, never relabel.
func TestVectorIngestNoFlagsIsProductionCompatible(t *testing.T) {
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
	// Fresh database: the command itself must create the optional schema.
	if _, err = pool.Exec(ctx, "DROP TABLE IF EXISTS public.source_semantic_index; DROP TABLE IF EXISTS public.source_semantic_ingest_runs"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("VECTOR_DATABASE_URL", "")
	t.Setenv("DATABASE_URL", uri) // legacy fallback used by the old seed command
	t.Setenv("BRASPACE_VECTOR_MODEL_ID", "")
	// run executes the CLI with stdout discarded and returns its exit code and stderr.
	run := func() (int, string) {
		oldOut, oldErr := os.Stdout, os.Stderr
		devnull, _ := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
		er, ew, _ := os.Pipe()
		os.Stdout, os.Stderr = devnull, ew
		code := runVectorIngestCLI(nil)
		ew.Close()
		os.Stdout, os.Stderr = oldOut, oldErr
		devnull.Close()
		msg, _ := io.ReadAll(er)
		return code, string(msg)
	}
	for i := 0; i < 2; i++ {
		if code, msg := run(); code != 0 {
			t.Fatalf("run %d: exit %d, stderr %q", i+1, code, msg)
		}
	}
	c, sha, err := vectorLayerRegistry()
	if err != nil {
		t.Fatal(err)
	}
	lex, err := lexicalVectorManifest(c, sha)
	if err != nil {
		t.Fatal(err)
	}
	want, _, err := validateVectorManifest(lex, c, sha)
	if err != nil {
		t.Fatal(err)
	}
	var n, runs int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM public.source_semantic_index WHERE model_id=$1", vectorLexicalModelID).Scan(&n); err != nil || n != want.Entries || n == 0 {
		t.Fatalf("lexical rows %d (manifest %d), err %v", n, want.Entries, err)
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM public.source_semantic_ingest_runs WHERE model_id=$1", vectorLexicalModelID).Scan(&runs); err != nil || runs != 1 {
		t.Fatalf("ingest audit runs %d (want 1, idempotent), err %v", runs, err)
	}
	t.Setenv("BRASPACE_VECTOR_MODEL_ID", "all-MiniLM-L6-v2")
	if code, _ := run(); code == 0 {
		t.Fatal("a non-lexical pinned model must refuse the lexical ingest")
	}
}
