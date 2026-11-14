package main

import (
	"context"
	"io/fs"
	"strings"
	"testing"
	"testing/fstest"
)

// BR101: Postgres migration, idempotency and integrity tests. Skipped only
// when TEST_DATABASE_URL is unset (as the other TestDB* tests).

func TestDBBR101MigrationsFromEmptyApplyAll(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	applied, err := migrate(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(applied, ",") != "001_init.sql,002_preliminary_status.sql,003_no_validated_status.sql" {
		t.Fatalf("applied = %v", applied)
	}
	for _, tbl := range []string{"source_manifest", "ingest_runs", "sites", "site_nearby", "site_series", "horizon_samples", "ephemeris_samples", "schema_migrations"} {
		var ok bool
		if err := db.QueryRow(ctx, `SELECT to_regclass(current_schema() || '.' || $1) IS NOT NULL`, tbl).Scan(&ok); err != nil || !ok {
			t.Errorf("table %s missing after migrate (%v)", tbl, err)
		}
	}
}

func TestDBBR101MigrationFrom001To002KeepsEveryRow(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	m001, err := migrationFiles.ReadFile("db/migrations/001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, string(m001)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ('001_init.sql')`); err != nil {
		t.Fatal(err)
	}
	// Database is now exactly at 001: PRELIMINARY must be refused there.
	// Hand-written rows valid under 001 (real series are PRELIMINARY and need 002).
	seed := []string{
		`INSERT INTO ingest_runs (catalog_sha256, status) VALUES (repeat('a',64), 'ok')`,
		`INSERT INTO sites (id, ordinal, name, kind) VALUES ('s1', 1, 'S1', 'k'), ('s2', 2, 'S2', 'k')`,
		`INSERT INTO site_nearby (site_id, nearby_id, ordinal) VALUES ('s1', 's2', 0)`,
		`INSERT INTO site_series (site_id, schema, science_status, terrain_dataset_id, ephemeris_id, frame, generator, observer_height_m, start_utc, step_seconds, sample_count, source_file, file_sha256, content_sha256, ingest_run_id)
		 VALUES ('s1','braspace.site-series.v1','SYNTHETIC','T','E','MOON_ME','g',2,'2026-12-01T00:00:00Z',3600,2,'f',repeat('b',64),repeat('c',64),(SELECT max(id) FROM ingest_runs))`,
		`INSERT INTO horizon_samples (site_id, idx, azimuth_deg, elevation_deg) VALUES ('s1',0,0,1),('s1',1,90,2),('s1',2,180,3)`,
		`INSERT INTO ephemeris_samples (site_id, idx, epoch_utc, sun_azimuth_deg, sun_elevation_deg, earth_azimuth_deg, earth_elevation_deg)
		 VALUES ('s1',0,'2026-12-01T00:00:00Z',1,1,2,2),('s1',1,'2026-12-01T01:00:00Z',1,1,2,2)`,
	}
	for _, q := range seed {
		if _, err := db.Exec(ctx, q); err != nil {
			t.Fatalf("seed on 001: %v\n%s", err, q)
		}
	}
	tables := []string{"sites", "site_nearby", "site_series", "horizon_samples", "ephemeris_samples", "ingest_runs"}
	before := map[string]int{}
	for _, tb := range tables {
		var n int
		if err := db.QueryRow(ctx, "SELECT count(*) FROM "+tb).Scan(&n); err != nil {
			t.Fatal(err)
		}
		before[tb] = n
	}
	if before["ephemeris_samples"] != 2 || before["sites"] != 2 || before["horizon_samples"] != 3 {
		t.Fatalf("fixture is empty: %v", before)
	}
	if _, err := db.Exec(ctx, `UPDATE site_series SET science_status = 'PRELIMINARY'`); err == nil {
		t.Fatal("001 must refuse PRELIMINARY (that is why 002 exists)")
	}
	applied, err := migrate(ctx, db)
	if err != nil || strings.Join(applied, ",") != "002_preliminary_status.sql,003_no_validated_status.sql" {
		t.Fatalf("expected 002 and 003 to apply: %v %v", applied, err)
	}
	for _, tb := range tables {
		var n int
		if err := db.QueryRow(ctx, "SELECT count(*) FROM "+tb).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != before[tb] {
			t.Errorf("%s: %d rows before 002, %d after (row lost or created)", tb, before[tb], n)
		}
	}
	if _, err := db.Exec(ctx, `UPDATE site_series SET science_status = 'PRELIMINARY'`); err != nil {
		t.Fatalf("002 must allow PRELIMINARY: %v", err)
	}
}

func TestDBBR101IngestTwiceKeepsSameCounts(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	tables := []string{"sites", "site_nearby", "site_series", "horizon_samples", "ephemeris_samples", "source_manifest"}
	count := func() map[string]int {
		m := map[string]int{}
		for _, tb := range tables {
			var n int
			if err := db.QueryRow(ctx, "SELECT count(*) FROM "+tb).Scan(&n); err != nil {
				t.Fatal(err)
			}
			m[tb] = n
		}
		return m
	}
	first := count()
	if _, err := ingest(ctx, db, embeddedFS(t), []byte(testManifest)); err != nil {
		t.Fatal(err)
	}
	second := count()
	for _, tb := range tables {
		if first[tb] != second[tb] || first[tb] == 0 {
			t.Errorf("%s: first=%d second=%d (must be equal and non-empty)", tb, first[tb], second[tb])
		}
	}
	if rep, err := verifyReadback(ctx, db, embeddedFS(t), []byte(testManifest)); err != nil || !rep.OK {
		t.Fatalf("readback after double ingest: %+v %v", rep, err)
	}
}

func TestDBBR101SwappedSeriesHashIsRefused(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	// Give series A the content hash of series B: the store must refuse to load.
	if _, err := db.Exec(ctx, `UPDATE site_series SET content_sha256 = (SELECT content_sha256 FROM site_series WHERE site_id = 'synthetic-demo-b') WHERE site_id = 'synthetic-demo-a'`); err != nil {
		t.Fatal(err)
	}
	if _, err := loadStoreFromDB(ctx, db); err == nil || !strings.Contains(err.Error(), "hash") {
		t.Fatalf("swapped SHA must be refused with a hash error, got %v", err)
	}
	if rep, _ := verifyReadback(ctx, db, embeddedFS(t), nil); rep.OK {
		t.Fatal("verify must fail with a swapped SHA")
	}
}

// VALIDATED is refused by the schema (migration 003, #185), and still by the
// loader and the ingest if the CHECK were ever loosened again.
func TestDBBR101ValidatedIsRefusedByLoaderAndIngest(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	if _, err := db.Exec(ctx, `UPDATE site_series SET science_status = 'TRUST_ME' WHERE site_id = 'synthetic-demo-a'`); err == nil {
		t.Fatal("CHECK must refuse an unknown status")
	}
	if _, err := db.Exec(ctx, `UPDATE site_series SET science_status = 'VALIDATED' WHERE site_id = 'synthetic-demo-a'`); err == nil {
		t.Fatal("CHECK must refuse VALIDATED (migration 003)")
	}
	// Loosen the CHECK on this disposable schema to reach the loader's own rule.
	if _, err := db.Exec(ctx, `ALTER TABLE site_series DROP CONSTRAINT site_series_science_status_check`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE site_series SET science_status = 'VALIDATED' WHERE site_id = 'synthetic-demo-a'`); err != nil {
		t.Fatal(err)
	}
	if _, err := loadStoreFromDB(ctx, db); err == nil || !strings.Contains(err.Error(), "VALIDATED") {
		t.Fatalf("a VALIDATED label in the database must not load, got %v", err)
	}
	good, _ := embeddedSiteData.ReadFile("sitedata/series/synthetic-demo-a.json")
	if !strings.Contains(string(good), `"science_status":"SYNTHETIC"`) {
		t.Fatal("fixture no longer has the expected science_status text")
	}
	bad := fstest.MapFS{}
	_ = fs.WalkDir(embeddedFS(t), ".", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			data, _ := fs.ReadFile(embeddedFS(t), p)
			bad[p] = &fstest.MapFile{Data: data}
		}
		return nil
	})
	bad["series/synthetic-demo-a.json"] = &fstest.MapFile{Data: []byte(strings.Replace(string(good), `"science_status":"SYNTHETIC"`, `"science_status":"VALIDATED"`, 1))}
	// Edited series: refused (the catalog pins series_sha256, so the edit is
	// caught by the hash before the status rule; both are refusals).
	if _, err := ingest(ctx, db, bad, nil); err == nil {
		t.Fatal("ingest must refuse a series edited to VALIDATED")
	}
	var n int
	_ = db.QueryRow(ctx, `SELECT count(*) FROM site_series WHERE science_status = 'VALIDATED'`).Scan(&n)
	if n != 1 { // only the row this test set by hand; ingest must not have added any
		t.Fatalf("VALIDATED rows = %d, want 1 (the hand-edited one)", n)
	}
}

// A database that already holds a VALIDATED row must not pass migration 003
// silently: the migration fails and is not recorded as applied.
func TestDBBR101Migration003RefusesExistingValidatedRow(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	for _, q := range []string{
		`DELETE FROM schema_migrations WHERE name = '003_no_validated_status.sql'`,
		`ALTER TABLE site_series DROP CONSTRAINT site_series_science_status_check`,
		`UPDATE site_series SET science_status = 'VALIDATED' WHERE site_id = 'synthetic-demo-a'`,
	} {
		if _, err := db.Exec(ctx, q); err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
	}
	if _, err := migrate(ctx, db); err == nil {
		t.Fatal("migration 003 must fail while a VALIDATED row exists")
	}
	var done bool
	_ = db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '003_no_validated_status.sql')`).Scan(&done)
	if done {
		t.Fatal("a failed migration must not be recorded as applied")
	}
}
