# Runbook: pgvector audit lineage (2026-11-15)

Change: `api/db/optional-vector.sql` has `source_semantic_ingest_runs` and the
nullable column `source_semantic_index.ingest_manifest_sha256` (FK), plus the
lookup index `idx_source_semantic_model_manifest`. Additive, idempotent
(`IF NOT EXISTS`, one `BEGIN/COMMIT`), applied by `api vector-ingest` (no flags =
pinned lexical manifest, #363) before the audited rows are upserted in one
transaction. No row is deleted.

## Quarantine rule
Search serves only rows whose `ingest_manifest_sha256` equals the model's most
recently applied audited manifest (latest `updated_at` among rows whose manifest
is in the ledger for that model; replays included, since the ledger insert is
`ON CONFLICT DO NOTHING`). Rows with NULL or stale manifest (e.g. legacy
`site-synthetic-demo-*` rows from the pre-#279 seed) stay in the table and are
counted as `legacy_unverified_count` in `GET /api/vector/status`.

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
It runs in its own transient database (`vectorTestDatabase`).
`scripts/ci-local.sh` runs it in a disposable `pgvector/pgvector:pg17`
container of its own project and fails if it is skipped.
