# Runbook: pgvector audit lineage (2026-11-15)

Change: `api/db/optional-vector.sql` gains `source_semantic_ingest_runs` and the
nullable column `source_semantic_index.ingest_manifest_sha256` (FK). Additive,
idempotent (`IF NOT EXISTS`), applied by `api vector-ingest` inside one
transaction under `pg_advisory_xact_lock`. No row is deleted.

## Quarantine rule
Search serves only rows whose `ingest_manifest_sha256` equals the model's most
recently applied manifest (`last_applied_at`). Rows with NULL or stale manifest
(e.g. the legacy `site-synthetic-demo-*` rows) stay in the table and are counted
as `legacy_unverified_count` in `GET /api/vector/status`. Synthetic fixtures
(`kind=synthetic_test_fixture`) are no longer ingested.

## States (`GET /api/vector/status` → `state`)
`disabled`, `db_down`, `schema_unavailable`, `empty`, `model_mismatch`,
`legacy_unverified`, `index_ready`. `available` is true only for `index_ready`;
`POST /api/vector/search` returns 503 `VECTOR_UNAVAILABLE` with `state` otherwise.

## Upgrade (operator)
1. `pg_dump -Fc` of the database into `backup/` (keep it until verified).
2. Deploy the new image; the existing `vector-ingest` service (no flags) applies
   the DDL and the audited manifest, then the API starts.
3. Check: `curl .../api/vector/status` → `state=index_ready`,
   `audited_count>0`; `legacy_unverified_count` = pre-existing synthetic rows.

## Rollback
1. Previous image (`IMAGEM=<sha12>` + `docker compose up -d`). The old API
   ignores the new column and keeps working.
2. Optional schema rollback (keeps every row):
   `psql -f api/db/optional-vector.down.sql`.
3. Last resort: `pg_restore` from step 1.

## Proof
`TestVectorDBQuarantineAndStates` (real pgvector, `TEST_VECTOR_DATABASE_URL`)
covers: old schema with legacy rows → upgrade → every state → idempotent double
ingest → quarantine in search → rollback without row loss → re-apply.
`scripts/ci-local.sh` runs it in a disposable `pgvector/pgvector:pg17`
container of its own project and fails if it is skipped.
