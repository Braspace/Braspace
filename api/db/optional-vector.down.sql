-- Rollback of the audit-lineage additions (#331). Keeps every row of
-- source_semantic_index: only the audit link and the ingest ledger are dropped.
-- The (source_ref, model_id) key and the nonzero-norm check are kept. Re-running
-- db/optional-vector.sql (or `api vector-ingest`) restores the audited index.
BEGIN;
DROP INDEX IF EXISTS public.idx_source_semantic_model_manifest;
ALTER TABLE IF EXISTS public.source_semantic_index DROP COLUMN IF EXISTS ingest_manifest_sha256;
DROP TABLE IF EXISTS public.source_semantic_ingest_runs;
COMMIT;
