# BRASPACE — Optional pgvector metadata search (P1, isolated)

The core NASA MoonProof mission engine does **not** depend on pgvector. Go/Rust numerical geometry, comparison, timestamps, source hashes, and PostgreSQL ingestion stay deterministic and keep their established API semantics.

This optional extension is for *metadata search only* (NASA dataset descriptions, source citations and educational notes); it **cannot verify a lunar fact** and must never rank actual landing safety.

## Configuration

- Default: `BRASPACE_VECTOR_ENABLED=0`, no database extension required and `GET /api/vector/status` announces `enabled:false`.
- Opt in with a PostgreSQL installation that supports pgvector, after separately reviewing the image and applying `api/db/optional-vector.sql`. This SQL is intentionally *not* in mandatory migrations.
- Set `BRASPACE_VECTOR_ENABLED=1`, `BRASPACE_VECTOR_MODEL_ID=<pinned-compatible-model>`, `VECTOR_DATABASE_URL=postgres://...`. Search requires exactly 384 finite numeric dimensions, model ID equality and a nonzero norm.
- The server returns source_ref, title, HTTPS source URL, SHA-256 and similarity for existing index entries. It does **not** generate embeddings; provisioning must be done by an explicit, independently reviewed ingestion process with model/version/license recorded.
- Empty index returns an honest empty list. Disabled or absent vector DB returns 503; the MoonProof frontend and all other APIs must continue operating.

## API

`GET /api/vector/status` returns enabled, available, dimensions and model identifier.

`POST /api/vector/search`: `{"model_id":"<configured-model>","vector":[384 finite numbers],"limit":5}`

The response always includes `scientifically_validated:false` and limitations; never feed similarity scores into sunlight, landing, slope, oxygen, communications or risk calculations.

## Hard gates before any deployment

1. Verified pgvector image tag/digest and independent security review (the example overlay uses the `pg16` tag for CI only).
2. Source permissions and licensing, 384-dimensional model provenance, index cardinality and performance benchmark; never commit embedding API keys.
3. Real pgvector PostgreSQL integration test against the optional SQL, including two deterministic synthetic metadata vectors; standard Postgres regression remains green.
4. Work with Heloísa/JV on a separate, clearly labelled **source search UI** only after the final mission demo and NASA submission gates pass.

References: #107 and completed evaluation #24.
