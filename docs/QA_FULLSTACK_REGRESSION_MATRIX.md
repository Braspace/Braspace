# BRASPACE MoonProof — Fullstack QA / Regression Matrix (2026-11-14)

This document separates **software behavior proven by tests** from **lunar science independently validated against NASA/NAIF datasets**. The automated test fixtures are synthetic unless their provenance explicitly states otherwise. A passing CI check must never be presented as NASA certification or flight readiness.

## Automated gates

| Area | Test file(s) | Primary failure modes | Gate |
| --- | --- | --- | --- |
| Go API / visibility | `api/visibility_regression_test.go` | invalid azimuth/elevation, non-monotone horizons, bogus frame/provenance, oversized or trailing JSON, content type, cache headers, reproducibility passport | `go test -race -count=1 ./...` |
| Go mission math | `api/analysis_regression_test.go` | incorrect 30-minute visibility windows, fractions, outage runs, signed constraint margins | `go test -race -count=1 ./...` |
| Rust engine | `engine/tests/cli_regression.rs` | interpolation across 0/360, at-horizon equality, invalid payload, claim escalation, replay drift | `cargo test --locked --all-targets` |
| NASA asset verifier | `tests/test_lola_regression.py` | wrong SHA-256, truncated/extended raster, little-endian signed decoding, malformed dimensions | `python3 -m unittest discover -s tests -v` |
| Web static/proxy | `web/tests/hardening.test.mjs` | CSP/MIME regression, unexpected files, HEAD vs GET, unsafe HTTP methods, report CSP isolation | `npm --prefix web test` |
| Existing broad suite | `api/*_test.go`, `api/onboard/*_test.go`, `web/tests/*.test.mjs`, `tests/*.py` | catalog, comparison, delays, energy, oxygen/food, reports, PostgreSQL, layers, source claims | Existing `.github/workflows/ci.yml` and web workflow |
| Deployment integration | `examples/mission/replay.sh`, Docker Compose, PostgreSQL | real API-to-Rust plumbing, ingestion/readback and container readiness | Existing `.github/workflows/ci.yml` |

New focused gate: `.github/workflows/fullstack-regression.yml`, with Go race+vet, real Rust CLI tests, offline LOLA checks and Node 20/22 web regressions. **Do not disable the existing heavier Docker/PostgreSQL CI.**

## Verification tiers

- **Tier 1 (unit/contract):** Validates code paths, JSON contracts, numeric invariants and failure behavior. Synthetic inputs permitted and labelled.
- **Tier 2 (integration):** Runs Go/Rust executable, API, PostgreSQL and local same-origin web. A green status does not certify source geometry.
- **Tier 3 (scientific):** Requires independently confirmed NASA PDS DEM checksum and PDS label semantics, pixel registration, frame transformation, SPICE kernel provenance, time-scale/light-time assumptions, independent solar/terrestrial visibility comparison, and an uncertainty/error budget. **Not certified by this PR.**
- **Tier 4 (release):** Public HTTPS anonymous access, both teammate frontends integrated, browser/manual visual QA, final English demonstration within slide limit, attribution/disclosures and official submission receipt. **Must be verified separately.**

## P0 manual checks required before submission

1. Start the reviewed release candidate from a clean checkout with Docker/Go/Rust toolchains installed. Check `/readyz`, `/api/health`, `/api/sites`, `/api/layers` and `/api/openapi.json`.
2. Replay the sample fixtures using `examples/mission/replay.sh http://127.0.0.1:8080` and inspect response `science_status`, `scientifically_validated`, `provenance`, `data_status` and non-fabrication behavior.
3. Exercise both Eloísa and JV frontend branches with the same Go API contracts; confirm request payloads, error states, mobile/desktop layout, UTC timestamps, routing and report printing. Identify the actual branch/commit used.
4. Test **one complete user journey**: select three sites → compare Sun/Earth windows → delay and alternative → onboard energy/crew → evidence report → verify provenance. Assert unmeasured properties remain unavailable.
5. Separately run a NASA/NAIF scientific acceptance case with a traceable polar DEM and independently checked horizon/ephemeris numbers, including units, longitude convention, frame epoch and checksum. Do not promote synthetic fixtures into validated data.
6. Open final project and demo URLs in a private browsing session with no GitHub or app login; record HTTP status, screenshots and UTC timestamp.
7. Review Actions logs for ALL required checks and block merge if any fail; capture reviewed merge commit and authorized NASA submission confirmation.

## Safe execution

```sh
python3 -m unittest discover -s tests -v
cargo test --manifest-path engine/Cargo.toml --locked --all-targets
(cd api && go vet ./... && go test -race -count=1 ./...)
npm --prefix web run lint
npm --prefix web test
```

**Merge policy:** this QA PR is draft until its checks pass and owners review any accidental interactions with concurrent science/frontend branches. Avoid modifying source files in teammate branches. Science-critical failures block scientific claims, even if the training-only interface stays available.

**Evidence policy:** Report actual GitHub run IDs and job conclusions; never claim execution from commits alone. Changes under this PR add regression coverage only; they do not alter physics, API features, production infrastructure or teammates' UI.
