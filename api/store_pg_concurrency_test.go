package main

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// Separate workers may start the migration command concurrently during a deploy.
func TestDBMigrateConcurrentWorkers(t *testing.T) {
	db := testDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	const workers = 8
	type result struct {
		applied []string
		err     error
	}
	start := make(chan struct{})
	results := make(chan result, workers)
	for i := 0; i < workers; i++ {
		go func() {
			<-start
			applied, err := migrate(ctx, db)
			results <- result{applied, err}
		}()
	}
	close(start)
	seen := map[string]int{}
	for i := 0; i < workers; i++ {
		r := <-results
		if r.err != nil {
			t.Errorf("concurrent migration: %v", r.err)
		}
		for _, name := range r.applied {
			seen[name]++
		}
	}
	for _, name := range []string{"001_init.sql", "002_preliminary_status.sql", "003_no_validated_status.sql"} {
		if seen[name] != 1 {
			t.Errorf("migration %s applied %d times; expected once", name, seen[name])
		}
	}
	var n int
	if err := db.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&n); err != nil || n != 3 {
		t.Fatalf("expected 3 committed migrations, got %d: %v", n, err)
	}
}

// A live readback must never combine source hashes from different committed
// generations. Establish an old snapshot, change current rows in a distinct
// transaction, and verify exactly the bytes visible to the old snapshot.
func TestDBVerifyReadbackOneSnapshot(t *testing.T) {
	db := ingested(t)
	ctx := context.Background()
	data := embeddedFS(t)
	src, err := loadStore(data)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM sites`).Scan(&n); err != nil || n == 0 {
		t.Fatalf("establish read snapshot: count=%d err=%v", n, err)
	}
	if _, err := db.Exec(ctx, `UPDATE source_manifest SET manifest_sha256=repeat('b',64)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE site_series SET file_sha256=repeat('c',64) WHERE site_id='synthetic-demo-a'`); err != nil {
		t.Fatal(err)
	}
	rep, err := verifyReadbackSnapshot(ctx, tx, src, data, []byte(testManifest))
	if err != nil || !rep.OK {
		t.Fatalf("old snapshot must stay consistent: %+v %v", rep, err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	rep, err = verifyReadback(ctx, db, data, []byte(testManifest))
	if err != nil || rep.OK {
		t.Fatalf("new readback must reject changed hashes: %+v %v", rep, err)
	}
}
