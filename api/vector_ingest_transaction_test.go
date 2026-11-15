package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestVectorIngestAtomicAndIdempotent(t *testing.T) {
	uri := os.Getenv("TEST_VECTOR_DATABASE_URL")
	if uri == "" {
		t.Skip("requires a disposable pgvector database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := openPool(ctx, uri)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	// Start with a real schema and force the second seed row to fail.
	if _, err := pool.Exec(ctx, optionalVectorSQL); err != nil {
		t.Fatal(err)
	}
	const reject = `ALTER TABLE source_semantic_index ADD CONSTRAINT qa_reject_pgda_model CHECK (source_ref <> 'pgda-69-avgvisib-85s-60m' OR model_id <> '` + vectorLexicalModelID + `') NOT VALID`
	if _, err := pool.Exec(ctx, reject); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, "ALTER TABLE source_semantic_index DROP CONSTRAINT IF EXISTS qa_reject_pgda_model")
	}()
	defer func() {
		_, _ = pool.Exec(ctx, "DELETE FROM source_semantic_index WHERE model_id=$1", vectorLexicalModelID)
	}()
	const first = "SELECT updated_at FROM source_semantic_index WHERE source_ref='nasa-lro-lola-ldem-80s-80m' AND model_id=$1"
	var stamp, replay time.Time
	if _, err := ingestVectorMetadata(ctx, pool, embeddedFS(t)); err == nil {
		t.Fatal("expected the second seed row to be rejected")
	}
	if err := pool.QueryRow(ctx, first, vectorLexicalModelID).Scan(&stamp); err != pgx.ErrNoRows {
		t.Fatalf("failed ingest left a committed first row, read error: %v", err)
	}
	if _, err := pool.Exec(ctx, "ALTER TABLE source_semantic_index DROP CONSTRAINT qa_reject_pgda_model"); err != nil {
		t.Fatal(err)
	}

	if _, err := ingestVectorMetadata(ctx, pool, embeddedFS(t)); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, first, vectorLexicalModelID).Scan(&stamp); err != nil {
		t.Fatal(err)
	}
	if _, err := ingestVectorMetadata(ctx, pool, embeddedFS(t)); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, first, vectorLexicalModelID).Scan(&replay); err != nil {
		t.Fatal(err)
	}
	if !stamp.Equal(replay) {
		t.Fatalf("identical seed rewrote the row: %s -> %s", stamp, replay)
	}
}
