# P0 reconciliation of #279, #287 and #291 (2026-11-15)

Branch `integ/p0-reconcile-279-287-291`, based on `main` `cf45738`, then merged
with `main` `ddb4148`. This is the technical journal of that reconciliation:
what was merged, how each conflict was decided, what was fixed, and what
evidence backs each claim. Results belong to the commit named next to them.

## Decisions

| Conflict | Decision | Why |
|---|---|---|
| `api/vector.go` request parsing, readiness, ranking | Take #279 | Exact field names (no duplicate or case-variant keys), `null`-aware vectors and limits, scale-safe normalisation, readiness checks the real `vector(384)` column and SELECT privilege, deterministic tie order (`source_ref COLLATE "C"`). |
| `api/vector.go` pool construction | Keep #291 | #279 opened the pool with a startup ping, so a database that was down at boot left the API without a pool until restart. #291's lazy bounded pool lets the readiness probe recover. Verified in the browser run below. |
| `api/vector_ingest.go` | Take #279 (manifest pinned to the embedded layer registry SHA) | Lineage is derived from `sitedata/layers.json`, not hand-written. The #284 guard against invented hashes was ported to this design (`TestVectorSeedSHA256AreRegistered`). |
| `web/package.json`, `web/dev-server.mjs` (#287) | Union | #287's extra lint targets plus main's `build:ts`/`check:ts`; duplicate `/vector-embed.js` route removed. |
| `data.js`, `cockpit-model.js` and, after `ddb4148`, 8 screens | Port #279 into the `.ts/.tsx` sources, regenerate `.js` | Main made these files generated (`check:ts`). #279 edited the generated `.js` by hand; resolving on `.js` would have been overwritten by the next `build:ts`. |
| `examples/mission/scenario-delay-resources.response.json` | Regenerated | #279 makes constraint checks carry exact margins so a 0.9999999 h margin is never approved by rounding; metrics stay at 6 decimals. Investigated before `-update` (see commit `fc0f60c`). |

## Defects fixed here

1. **720 h mission evaluated as 480 h** (`2168de7`). Root cause:
   `onboard.MaxSamples = 480` while the mission contract, the UI and the onboard
   `step × samples ≤ 43200 min` bound all allow 720 h; the cockpit retried at
   480 h. Now 720; 721 h is refused with `INVALID_DURATION`. Red/green:
   `TestSiteOnboardFullThirtyDayWindow`. Browser: 721-point charge trace, D30.
2. **Silent exit of `vector-ingest` without flags** (`ab62574`). Prints the
   required invocation. Test: `TestVectorIngestCLIUsageIsExplicit`.

## Evidence

| Check | Commit | Result |
|---|---|---|
| `go vet`, `go test -race ./...` (macOS, Go 1.27.3) | `ab62574` | 4 packages ok |
| `npm test` / onboard tests / lint / `check:ts` | `eb22188` | 424/424, 71 pass + 1 skip, lint 0, 33/33 TS sources match |
| `cargo test --locked --all-targets` | `eb22188` | 24/24 |
| `python3 -m unittest discover -s science/tests` | `eb22188` | 34 OK |
| `scripts/ci-local.sh` on the harness (Docker + Compose Postgres) | `fc0f60c`, `2168de7`, `eb22188` | GREEN each time (Chromium step optional, not run) |
| Go tests against PostgreSQL 17.11 + pgvector 0.8.7 (disposable container) | `2168de7`, `eb22188` | 32/32 DB and vector tests pass, no leftover databases |
| `vector-ingest -lexical -apply` twice on real pgvector | `eb22188` | 4 rows, 4 refs, 1 model, 384 dims, same manifest SHA, 1 ingest run |
| Browser (built-in Chromium, live Go API + Rust engine) | `eb22188` | see below |

Browser run: cockpit uses `site-evaluate` (337-point trace for 336 h) and the
antenna fault goes to `/evaluate` with a `SIM` blackout seal and the matching
`/api/onboard/report`; 720 h gives 721 points. Evidence search: `LOLA` returns
LOLA DEM first with model id, SHA-256 and https source links; database down →
`available:false`, 503 `VECTOR_UNAVAILABLE`, UI "configured but unavailable";
database back → `available:true` and search 200 without restarting the API;
duplicate JSON key → 400; a vector labelled `all-MiniLM-L6-v2` → 422
`MODEL_MISMATCH`. Compare calls `/api/compare` (3 × 200); Recover lists nearby
sites with their own start, delay and seal; Explore shows one LROC card per
layout, none for a site without media. 390 × 844: no horizontal page scroll.

## Blockers and open items

- **P0 deploy prerequisite.** Production `/docker/braspace` compose runs
  `["/app/bin/api", "vector-ingest"]` with no flags and gates the API on it.
  With this code that exits 2, so the API would not start. Before deploying,
  change it to `["/app/bin/api", "vector-ingest", "-lexical", "-apply"]` and
  give the service `VECTOR_DATABASE_URL` and
  `BRASPACE_VECTOR_MODEL_ID=braspace-lexical-384-v1`, as in
  `compose.vector.yaml`. Production also holds 10 rows from the older seed
  design; the new ingest indexes 4 registry layers. Decide whether legacy rows
  stay before the deploy.
- **GitHub Actions.** Job annotation: "The job was not started because recent
  account payments have failed or your spending limit needs to be increased".
  Billing of the organisation; no step runs. Not a code failure.
- **P1, nonsense query.** `zzzqqqxxx` still returns 4 nearest neighbours
  (similarity 0.015) instead of an empty state. Needs a decided relevance
  floor for the lexical model, not an ad-hoc threshold.
- **P0, science.** #291 fixed the solar-disc formula, but derived aggregates
  (`science/results/*.json`, `web/data/sites*.json`) were not regenerated
  here; that needs the pinned NASA rasters.
- **Not covered:** Chromium step of ci-local, full four-viewport Playwright
  matrix, PR #289 (design tokens; independent, not merged here).
