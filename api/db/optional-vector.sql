-- OPTIONAL: run only in a database image that has pgvector installed.
-- This file is deliberately OUTSIDE db/migrations/*.sql so ordinary
-- postgres:16-alpine and embedded no-DB mode remain fully supported.
-- All embeddings must be real versioned model outputs, NEVER geometry.
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.source_semantic_ingest_runs (
    manifest_sha256        char(64) PRIMARY KEY CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    source_registry_sha256 char(64) NOT NULL CHECK (source_registry_sha256 ~ '^[0-9a-f]{64}$'),
    model_id               text NOT NULL CHECK (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'),
    model_revision         text NOT NULL CHECK (length(btrim(model_revision)) BETWEEN 1 AND 200),
    model_license          text NOT NULL CHECK (length(btrim(model_license)) BETWEEN 1 AND 200),
    entry_count            integer NOT NULL CHECK (entry_count > 0),
    ingested_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.source_semantic_index (
    source_ref  text NOT NULL,
    title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
    source_url  text NOT NULL CHECK (source_url LIKE 'https://%'),
    sha256      char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    model_id    text NOT NULL CHECK (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$'),
    embedding   public.vector(384) NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    ingest_manifest_sha256 char(64) REFERENCES public.source_semantic_ingest_runs(manifest_sha256),
    PRIMARY KEY (source_ref, model_id),
    CONSTRAINT source_semantic_embedding_nonzero CHECK (public.vector_norm(embedding) > 0)
);

-- Existing optional installations keep their legacy rows (NULL audit origin)
-- until an operator imports a reviewed, manifest-bearing model output.
ALTER TABLE public.source_semantic_index
    ADD COLUMN IF NOT EXISTS ingest_manifest_sha256 char(64)
    REFERENCES public.source_semantic_ingest_runs(manifest_sha256);

-- Upgrade the previous source_ref-only key in-place; never delete or overwrite
-- existing vectors. Unexpected keys and constraint violations abort atomically.
DO $$
DECLARE
    key_name text;
    key_columns text[];
BEGIN
    SELECT c.conname, array_agg(a.attname::text ORDER BY k.ordinality)
      INTO key_name, key_columns
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.conrelid='public.source_semantic_index'::regclass AND c.contype='p'
     GROUP BY c.conname;
    IF key_columns = ARRAY['source_ref']::text[] THEN
        EXECUTE format('ALTER TABLE public.source_semantic_index DROP CONSTRAINT %I, ADD PRIMARY KEY (source_ref, model_id)', key_name);
    ELSIF key_columns IS NULL THEN
        ALTER TABLE public.source_semantic_index ADD PRIMARY KEY (source_ref, model_id);
    ELSIF key_columns <> ARRAY['source_ref', 'model_id']::text[] THEN
        RAISE EXCEPTION 'unexpected source_semantic_index primary key: %', key_columns;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.source_semantic_index'::regclass
                   AND conname='source_semantic_embedding_nonzero') THEN
        ALTER TABLE public.source_semantic_index
            ADD CONSTRAINT source_semantic_embedding_nonzero CHECK (public.vector_norm(embedding) > 0);
    END IF;
END $$;

-- Safe initial B-tree filter. Consider HNSW only with enough real data
-- and a measured query plan, not blindly during the hackathon.
CREATE INDEX IF NOT EXISTS idx_source_semantic_model ON public.source_semantic_index(model_id);
-- Audit lineage lookup (#331): the API serves only rows of the model's current
-- audited manifest; rows with NULL or another manifest are quarantined, never deleted.
-- Rollback of the audit link (keeps every row): db/optional-vector.down.sql.
CREATE INDEX IF NOT EXISTS idx_source_semantic_model_manifest
    ON public.source_semantic_index(model_id, ingest_manifest_sha256);
COMMIT;
