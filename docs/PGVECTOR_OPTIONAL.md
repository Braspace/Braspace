# BRASPACE — optional pgvector metadata search

The core MoonProof mission engine does **not** depend on pgvector. Search is
informational retrieval of reviewed source metadata, never scientific validation,
landing safety, ephemerides or numerical input to mission simulation.

## Provisioning and ingestion

- Default: `BRASPACE_VECTOR_ENABLED=0`; regular PostgreSQL migrations have no
  vector extension dependency. Only opt in to an independently reviewed vector DB.
- Apply `api/db/optional-vector.sql` to that database as an authorized operator.
  The migration is idempotent, retains old rows and versions entries by model ID.
- Generate a manifest and a same-model query by following [VECTOR_EMBEDDINGS.md](VECTOR_EMBEDDINGS.md).
  The local pinned MiniLM model uses 384 dimensions and Apache-2.0 licensing.
  Review the manifest and exact source registry before ingestion.
- Build the Go API from the repository, then run the CLI from the repository root:

```bash
(cd api && go build -o /tmp/braspace-api .)
/tmp/braspace-api vector-ingest -input /tmp/braspace-source-embeddings.json
# Explicit operator configuration, never commit a connection string:
export BRASPACE_VECTOR_MODEL_ID=sentence-transformers/all-MiniLM-L6-v2:1110a243fdf4706b3f48f1d95db1a4f5529b4d41
# Set VECTOR_DATABASE_URL securely before applying.
/tmp/braspace-api vector-ingest -input /tmp/braspace-source-embeddings.json -apply
```

The first invocation validates only (no DB writes). Apply validates exact registry
and per-source provenance, normalizes embeddings, records manifest and model
revision/license in the audit table, and upserts atomically. Repeating the same
manifest is idempotent. Legacy rows without an audit manifest remain readable;
do not treat their provenance as equivalent to an audited ingest.

## API and UI

Set `BRASPACE_VECTOR_ENABLED=1`, `BRASPACE_VECTOR_MODEL_ID` and
`VECTOR_DATABASE_URL` on the Go service only after provisioning. The status route
reports backend readiness, model and dimensionality. POST `/api/vector/search`
accepts the reviewed query JSON (`model_id`, 384 finite numeric `vector` components,
optional `limit` from 1 to 20). The result includes source reference, title,
HTTPS source URL, SHA-256 and cosine similarity. It always reports
`scientifically_validated:false`. Empty index returns an honest empty list;
disabled/unavailable search returns 503 and leaves mission features operational.

The Evidence surfaces expose the optional source search with explicit disabled,
unavailable, ready, empty, error and result states. They accept the same-model
query JSON produced by the local utility; no invented vectors, browser secrets,
external inference requests or unaudited natural-language embedding endpoint.

## Validation and release gates

- Local isolated PostgreSQL 17.12 + pgvector 0.8.0: 26 top-level Go DB/vector
  tests and 37 subtests passed under `-race` without skips. Concurrent migration,
  rollback, model mismatch, audit integrity and snapshot consistency were tested.
- Four real metadata embeddings from the reviewed layer registry were imported
  twice; exactly four rows and one audit record remained. Actual Go HTTP and
  web proxy produced identical source rankings; the example LOLA query returned
  `data/manifest.json` first. This is not a scientific validation of the DEM.
- CI must run the optional real database/API/proxy lane, ordinary PostgreSQL
  regressions, web regressions and browser smoke checks. The independent model
  test requires verified assets; see [VECTOR_EMBEDDINGS.md](VECTOR_EMBEDDINGS.md).
- Before enabling in production, review the exact image digest, permissions,
  model/source licensing and performance, and obtain the deployment review.
  Keep the optional service disabled if those gates or the mission demo fail.

References: #107, #24.
