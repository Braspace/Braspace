# ADR-0003: No pgvector for the MVP; deterministic queries for science data

**Status:** proposed (BS-024) · **Date:** 2026-11-14 · **Owner:** @gfreiresjrp

## Context

BS-024 asks whether semantic retrieval (pgvector embeddings) has a place next to
deterministic SQL for NASA metadata. What the API actually stores and serves:

| Data | Shape | How it is queried |
|---|---|---|
| Site catalog | 13 regions + fixtures, cited coordinates | by id, by great-circle distance |
| Horizon profile | ≤1440 (azimuth, elevation) pairs per site | whole profile per site |
| Sun/Earth series | fixed time grid per site | by site and time range |
| Provenance | dataset id, version, SHA-256, frame, generator | exact match, displayed verbatim |

Every request is "site X between t0 and t1" or "sites nearest to X". All of these
have exact answers.

## Options

1. **Deterministic only.** Embedded JSON now; if the series range grows, Postgres
   with plain numeric columns and an index on `(site_id, epoch_utc)` (BS-020).
2. **Add pgvector** for free-text search over dataset descriptions and site notes.
3. **Embeddings over the numeric data** (horizon or illumination profiles as vectors
   for "find similar sites").

## Decision

Option 1.

- Option 3 is rejected. Nearest-neighbour similarity on embedded profiles gives an
  approximate, model-dependent answer to a question the engine answers exactly, and
  "similar embedding" can be read as "similar illumination" when it is not. A
  vector similarity score must never appear next to, or in place of, a computed
  metric.
- Option 2 is not needed for the MVP. The catalog has 13 entries and the source
  inventory a handful of datasets; a list and exact filters cover it. pgvector would
  add an embedding model, an extension, a migration and a non-reproducible ranking
  without changing the demo.

## Consequences

- No embedding model, vector extension or external AI service in the data path.
  Same request ⇒ same response stays true (it is tested).
- BS-020: Postgres is only worth adding when the stored series outgrow embedded JSON.
  Rough guide: hourly samples for 13 sites over 5 years is about 570k rows, too large
  for files in the binary but trivial for an indexed table. Until then the loader
  already rejects malformed data and carries dataset IDs and checksums.
- If text search is revisited after the hackathon, it is limited to descriptive
  text (dataset abstracts, site notes) and must record:
  - embedding model name and exact version,
  - vector dimension and distance metric,
  - the `pgvector` extension version,
  - a versioned table, so re-embedding never silently changes old results,
  - results labelled as "search suggestions", never as scientific output.

## Not decided here

Whether the hackathon build needs Postgres at all (BS-020). This ADR only rules out
vectors for quantitative data and defers text search.
