# BRASPACE MoonProof — Integration checkpoint 2026-11-14

**Goal:** connect the NASA Space Apps 2026 Lunar Landing Site Navigator challenge frontend, Go API, Rust geometry engine, PostgreSQL and optional pgvector with reproducible scientific provenance; finish a public, accessible demo before the registered 2026-11-15 23:59 local submission deadline.

## Verified main history in this cycle

| PR | Change | Status |
| --- | --- | --- |
| #97 | Typed read-only terrain horizon + Sun/Earth look angle API | Merged; only sites with stored series return computed values |
| #100 | Separate functional UI tabs, honest risk-threshold prose | Merged; Go and web CI green |
| #101 | Extensive Go/Rust/LOLA/Node regression matrix and end-to-end Web→Go→Rust | Merged; CI 6/6 + original Docker/Postgres 2/2 |
| #113 | Optional vector-metadata search using pgvector | Merged; 384D model-pinned vector API, separate schema/image, disabled by default |

Earlier #45, #53, #70–#74, #78, #83, #87–#88 are in the main history (check final commit SHA when releasing).

## Frontend teams, sources and boundaries

- **Heloísa (lisanogueira):** original [PR #102](https://github.com/Braspace/Braspace/pull/102) contains extensive Polar Landing Lab science/assets/frontend. Its branch is divergent and the PR initially had merge conflicts. This [integration PR #108](https://github.com/Braspace/Braspace/pull/108) preserves **54 exact original file blobs** (including binaries), then adds a conflict-safe current-main merge, same-origin static allowlist, navigation and runtime API bridge. It DOES NOT erase or force-push her original branch or claim authorship of her science.
- **João Victor/Jotavê:** `jotave` branch had 0 exclusive commits and 17 behind main at audit; the specific latest frontend source has not been supplied in a reviewable branch. Do not infer no local work. Track #105.
- **Screenshot:** a provided Shackleton cockpit screenshot displays a badge saying `Dados validados` next to numbers (71% Sun, 63% Earth, 46h shadow, 38h blackout, altitude 1832m, slope 4.6°). A screenshot alone cannot attest provenance. The exact code used for that screenshot is not yet linked to a commit; track #106.
- **Backend bridge:** lab exposes actual Go/Rust/Postgres status/catalog/sky, vector status, typed comparison calls and a visibly **synthetic-only** Go onboard risk demonstration. NASA-derived static 2025–2028 products remain a separate preliminary source; the bridge never replaces missing real sites with synthetic Go values.

## Automated QA evidence

- [Chromium desktop/mobile on a running Go/Rust backend](https://github.com/Braspace/Braspace/actions/runs/43627634824) initially PASS; screenshots archived for seven days.
- [Fullstack matrix 6/6](https://github.com/Braspace/Braspace/actions/runs/43627634757) and [Docker/PostgreSQL 2/2](https://github.com/Braspace/Braspace/actions/runs/43627634715) PASS on original integrated branch checkpoint.
- [Polar Lab scientific asset integrity](https://github.com/Braspace/Braspace/actions/runs/43629183759) PASS; independent NASA scientific certification still **NOT** established.
- [Real pgvector test service](https://github.com/Braspace/Braspace/actions/runs/43628492745) PASS with standard PostgreSQL migrations unchanged.
- These are previous run references. **Verify final head SHA and all checks again after the last patch; never extrapolate PASS to newer commits.**

## Known scientific debt: hard guardrails

- The Heloísa 2025–2028 series report `PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED`. This must remain visible on charts and landing screens.
- Independent PGDA snapshot shows **Peak Near Shackleton 80.89% pipeline solar-disc vs 71.89% PGDA (+9.00 percentage points)**. Their averaging periods and definitions differ; neither a mere failure nor independent validation can be inferred. Solar resource claims should not be elevated before source/method review.
- Mons Mouton Earth-centre 81.03% versus PGDA any-disc 92.06% (-11.03 pp) likewise has definition differences.
- Horizons reference JSON records zero residuals at every sampled site and body, which requires independently reproducible Horizons source request/response and tolerances before claiming scientific validation.
- PGDA files in `web/data/region` are resampled visualization products. The legacy `sha256` fields under `layers.pgda_*` refer to original source product hashes, **not proven hashes of the derived 400m .bin files**; do not mislabel them as derived asset checksums.
- Numerical source hashes, frames, epochs and units must be independently reviewed by the human science owner.

## Open issue / board routing

| P0/P1 | Issue | Explicit acceptance |
| --- | --- | --- |
| P0 | #105 | Heloísa/JV exact source handoff and real frontend mission integration |
| P0 | #106 | Badge/percentage/terrain metrics independently evidenced |
| P1 | #107 | pgvector actual embedding model + configured metadata ingestion + source search frontend |
| P0 | #31 / #33 | Final science-honesty QA and CI signoff on release commit |
| P0 | #10 / #11 / #32 / #34 | Public app, 7-slide deck, anonymous URL check, NASA form receipt |
| P0 | #37 | Human team progress sync for all members |

Organization project boards: [2](https://github.com/orgs/Braspace/projects/2) · [4](https://github.com/orgs/Braspace/projects/4) · [5](https://github.com/orgs/Braspace/projects/5) · [6](https://github.com/orgs/Braspace/projects/6) · [7](https://github.com/orgs/Braspace/projects/7) · [8](https://github.com/orgs/Braspace/projects/8) · [9](https://github.com/orgs/Braspace/projects/9) · [10](https://github.com/orgs/Braspace/projects/10).

> GitHub issue/PR references can be linked from this document; it does not certify that any Project V2 status/field was updated.

**Do not close science/public submission/registration issues or claim a final merge until the corresponding code, CI, independent data validation, reviewer and portal evidence are actually confirmed.**
