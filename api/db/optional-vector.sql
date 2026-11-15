-- OPTIONAL: run only in a database image that has pgvector installed.
-- This file is deliberately OUTSIDE db/migrations/*.sql so ordinary
-- postgres:16-alpine and embedded no-DB mode remain fully supported.
-- All embeddings must be real versioned model outputs, NEVER geometry.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS source_semantic_index (
    source_ref  text PRIMARY KEY,
    title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    source_url  text NOT NULL CHECK (source_url LIKE 'https://%'),
    sha256      char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    model_id    text NOT NULL CHECK (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'),
    embedding   vector(384) NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Safe initial B-tree filter. Consider HNSW only with enough real data
-- and a measured query plan, not blindly during the hackathon.
CREATE INDEX IF NOT EXISTS idx_source_semantic_model ON source_semantic_index(model_id);

-- Audit lineage (2026-11-15). Additive and idempotent: safe on the old schema
-- with legacy rows. Rows are never deleted; rows whose ingest_manifest_sha256
-- is NULL or not the model's current manifest are quarantined by the API.
-- Rollback: db/optional-vector.down.sql (keeps every row).
CREATE TABLE IF NOT EXISTS source_semantic_ingest_runs (
    manifest_sha256 char(64) PRIMARY KEY CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    model_id        text NOT NULL CHECK (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'),
    entry_count     integer NOT NULL CHECK (entry_count > 0),
    first_applied_at timestamptz NOT NULL DEFAULT now(),
    last_applied_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE source_semantic_index
    ADD COLUMN IF NOT EXISTS ingest_manifest_sha256 char(64)
    REFERENCES source_semantic_ingest_runs(manifest_sha256);
CREATE INDEX IF NOT EXISTS idx_source_semantic_model_manifest
    ON source_semantic_index(model_id, ingest_manifest_sha256);
