-- Rollback of the 2026-11-15 audit-lineage additions. Keeps every row of
-- source_semantic_index (only the audit link is dropped); the pre-change API
-- (main 62bf446) works unchanged against the result.
ALTER TABLE source_semantic_index DROP COLUMN IF EXISTS ingest_manifest_sha256;
DROP TABLE IF EXISTS source_semantic_ingest_runs;
