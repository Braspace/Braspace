package main

import (
	"context"
	"fmt"
	"io/fs"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testDB returns a pool bound to a fresh schema. Tests are skipped unless
// TEST_DATABASE_URL points at a disposable PostgreSQL database.
func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := openPool(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("test_%d", rand.Int63())
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	db, err := openPool(ctx, url+sep+"search_path="+schema)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
	})
	return db
}

func embeddedFS(t *testing.T) fs.FS {
	t.Helper()
	fsys, err := fs.Sub(embeddedSiteData, "sitedata")
	if err != nil {
		t.Fatal(err)
	}
	return fsys
}

const testManifest = `{"dataset":{"product_file":"LDEM_80S_80M.IMG","pds_dataset_id":"LRO-L-LOLA-4-GDR-V1.0","product_version":"V2.0","raster":{"file_size_bytes":115520000}},
"source":{"image_url":"https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img"},
"verification":{"status":"verified","validated_at":"2026-11-14","sha256":"e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"}}`

func ingested(t *testing.T) *pgxpool.Pool {
	t.Helper()
	db := testDB(t)
	ctx := context.Background()
	if _, err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := ingest(ctx, db, embeddedFS(t), []byte(testManifest)); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestDBMigrateIsIdempotent(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	first, err := migrate(ctx, db)
	if err != nil || len(first) == 0 {
		t.Fatalf("first run: %v %v", first, err)
	}
	second, err := migrate(ctx, db)
	if err != nil || len(second) != 0 {
		t.Fatalf("second run should apply nothing: %v %v", second, err)
	}
}

func TestDBIngestReadbackAndManifest(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	rep, err := verifyReadback(ctx, db, embeddedFS(t), []byte(testManifest))
	if err != nil || !rep.OK {
		t.Fatalf("readback: %+v %v", rep, err)
	}
	if _, ok := rep.Checks["manifest:LRO-L-LOLA-4-GDR-V1.0/LDEM_80S_80M V2.0"]; !ok {
		t.Fatalf("manifest not verified: %+v", rep.Checks)
	}
	altered := strings.Replace(testManifest, "e6591eee", "00000000", 1)
	rep, _ = verifyReadback(ctx, db, embeddedFS(t), []byte(altered))
	if rep.OK {
		t.Fatal("a manifest with a different checksum must not verify")
	}
	// Re-ingest replaces rows instead of duplicating them.
	if _, err := ingest(ctx, db, embeddedFS(t), nil); err != nil {
		t.Fatal(err)
	}
	// Expected rows come from the source data, so adding real series keeps this valid.
	src, err := loadStore(embeddedFS(t))
	if err != nil {
		t.Fatal(err)
	}
	want := 0
	for _, ser := range src.series {
		want += len(ser.Samples)
	}
	var n int
	_ = db.QueryRow(ctx, `SELECT count(*) FROM ephemeris_samples`).Scan(&n)
	if n != want {
		t.Fatalf("ephemeris rows after re-ingest = %d, want %d (one row per source sample)", n, want)
	}
}

// TestDBServesSameAnswers checks that the API gives byte-identical responses
// whether the store comes from the embedded files or from PostgreSQL.
func TestDBServesSameAnswers(t *testing.T) {
	db := ingested(t)
	fromDB, err := loadStoreFromDB(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if fromDB.source != "postgres" {
		t.Fatalf("source = %q", fromDB.source)
	}
	embedded, _ := loadDefaultStore()
	serve := func(st *siteStore) http.Handler {
		mux := http.NewServeMux()
		(&missionAPI{store: st, engine: newEngineClient(testEngineBin)}).register(mux)
		return mux
	}
	for path, body := range map[string]string{"/api/compare": compareBody, "/api/scenarios/delay": scenarioBody} {
		a, b := do(serve(embedded), "POST", path, body), do(serve(fromDB), "POST", path, body)
		if a.Code != 200 || a.Body.String() != b.Body.String() {
			t.Errorf("%s: embedded and postgres responses differ", path)
		}
	}
}

func TestDBDetectsTamperingAndGaps(t *testing.T) {
	ctx := context.Background()

	db := ingested(t)
	if _, err := db.Exec(ctx, `UPDATE ephemeris_samples SET sun_elevation_deg = sun_elevation_deg + 0.001 WHERE site_id = 'synthetic-demo-a' AND idx = 10`); err != nil {
		t.Fatal(err)
	}
	if _, err := loadStoreFromDB(ctx, db); err == nil || !strings.Contains(err.Error(), "content hash mismatch") {
		t.Fatalf("tampered value must be rejected, got %v", err)
	}
	if rep, _ := verifyReadback(ctx, db, embeddedFS(t), nil); rep.OK {
		t.Fatal("verify must fail after tampering")
	}

	// Catalog fields are not covered by series hashes; verify must still catch them.
	db = ingested(t)
	if _, err := db.Exec(ctx, `UPDATE sites SET latitude_deg = -80 WHERE id = 'malapert-massif'`); err != nil {
		t.Fatal(err)
	}
	if rep, _ := verifyReadback(ctx, db, embeddedFS(t), nil); rep.OK || !strings.Contains(strings.Join(rep.Problems, " "), "catalog differs") {
		t.Fatalf("edited coordinate must fail verify: %+v", rep)
	}

	db = ingested(t)
	if _, err := db.Exec(ctx, `DELETE FROM ephemeris_samples WHERE site_id = 'synthetic-demo-b' AND idx = 500`); err != nil {
		t.Fatal(err)
	}
	if _, err := loadStoreFromDB(ctx, db); err == nil || !strings.Contains(err.Error(), "gap") {
		t.Fatalf("missing sample must be rejected as a gap, got %v", err)
	}
}

func TestDBConstraints(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	bad := []string{
		`INSERT INTO sites (id, ordinal, name, kind) VALUES ('x''; DROP TABLE sites;--', 99, 'x', 'k')`,
		`INSERT INTO sites (id, ordinal, name, kind, latitude_deg, longitude_deg) VALUES ('no-source', 98, 'x', 'k', -89, 0)`,
		`UPDATE site_series SET frame = 'J2000'`,
		`UPDATE site_series SET science_status = 'TRUST_ME'`,
		`UPDATE ephemeris_samples SET sun_elevation_deg = 120 WHERE idx = 0`,
	}
	for _, q := range bad {
		if _, err := db.Exec(ctx, q); err == nil {
			t.Errorf("constraint not enforced: %s", q)
		}
	}
}

func TestDBIngestRejectsInvalidSourceAtomically(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	good, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	catalog, _ := embeddedSiteData.ReadFile("sitedata/catalog.json")
	bad := fstest.MapFS{
		"catalog.json":                 {Data: catalog},
		"series/synthetic-demo-a.json": {Data: []byte(strings.Replace(string(good), `"MOON_ME"`, `"J2000"`, 1))},
		"series/synthetic-demo-b.json": {Data: good},
	}
	if _, err := ingest(ctx, db, bad, nil); err == nil {
		t.Fatal("invalid source must be rejected")
	}
	if rep, _ := verifyReadback(ctx, db, embeddedFS(t), nil); !rep.OK {
		t.Fatalf("previous data must be untouched: %+v", rep)
	}
}
