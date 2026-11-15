# MoonProof P0 — fullstack integration checkpoint | 2026-11-15

## Scope and ancestry

One product entry: `/moonproof/` → cockpit. Auxiliary pages remain reachable for evidence, planning and learning; legacy material stays archived, not deleted. Preserve Heloísa's Manrope/IBM Plex Mono, jade/sun/earth, glass and Fibonacci spacing. Desktop density targets the previous 75% appearance at 100% zoom without shrinking touch targets. The original Joel Moon HD data and scene are reused; the Landing Lab and cockpit use the canonical Artemis model in `web/moon-hd/artemis.ts` from main #349. The visual hover is explicitly illustrative, never engineering telemetry.

- Previous integrated candidate #329: `989f22cd8a2dd8102d9d8dda09b17d46b33b0000`.
- Main incorporated: `f9c1fed0121bb24b8c47f49b7fb8cfe1253f53b9` (#348 and #349).
- Backend aggregate #350: `2e6b0c194c5bd101c5fb9c7cf278882a669e8606` (#331, #332, #334, #341, #347).
- Frontend #344 and CI #343 already incorporated in candidate ancestry. Do not merge individual components again without checking ancestry and overlap.
- Input ZIP SHA-256: `01f08b672d42cdf5bfa055ca4dedefc7bf0539b390cf5320f0313305341f1f00`.
- Input harness SHA-256: `6d749208360fc48583f97a06f30ddfd9dcc6782c4b35a243f7e4fde4fa3763d6`.

## Engineer loop / evidence

| Lane | Evidence | Status |
|---|---|---|
| Cockpit UX | Nine independent groups, focus-safe folds, camera menu, mobile bottom nav, site state sync, shared Artemis mesh, 2D fallback, CSP-compatible stylesheet. 253/253 MoonProof tests in local fixture. | PASS fixture |
| TypeScript/lint | TypeScript 5.6.3 strict build; JS syntax lint with route matrix files restored. | PASS fixture |
| Shared web tests | 98/108 pass, 10 failures due to absent large Moon HD/400m data in local reconstruction; re-run with full checkout. | INCOMPLETE |
| Backend Go | Aggregate root/onboard tests repeated independently using Go 1.26.11 (22.978s / 0.014s). | PASS fixture |
| API contract | 48/48 against local Go HTTP with deterministic engine stand-in and embedded data, with cockpit builder from previous #329. Strict malformed Rust stdout, missing power and nonaligned sky grid. | PASS fixture; not real Rust |
| DBA | Strict vector eligibility, scoped migration and down SQL, rollback runbook; 16 DB-dependent checks not executed in aggregate fixture. | EXO required |
| Release gate | Bash syntax and mocked gate pass; six widths, local URLs, required suite fail-closed, optional hardware GPU check. | PASS mock; browser candidate pending |
| Live baseline | Actual Chrome production inspection: shared Moon opened; old folded groups expose 29 hidden focusables; selected pin did not synchronize mission context; old persona entry remains. | Baseline only, not new release |

## Release checklist (MAC integrator + EXO-X1)

1. Checkout the exact integrated candidate SHA in an isolated worktree with all Git/LFS data; check main ancestry and no uncommitted edits.
2. Run `bash scripts/ci-local.sh --browser` including real Go/Rust and PostgreSQL/pgvector; run the cockpit browser gate with `BRASPACE_REQUIRE_COCKPIT_GPU=1` on hardware. Keep 320/390/768/1280/1440/1920 evidence and mobile focus/overflow checks. Re-run shared asset tests with actual bytes.
3. Run `node scripts/cockpit-backend-contract.mjs` against the real API with the actual Rust engine and the database lanes. Record migration backup/snapshot and rollback proof; no destructive production smoke.
4. Record exact SHA, EXO CI GREEN, Worker version and rollback per `docs/harness/OWNERS.md`. GitHub Actions had infrastructure/billing failures before job steps, which is not a test pass. Do not infer GREEN from local fixture tests.
5. MAC integrator merges, releases and verifies canonical PWA entry, all fold controls, site pin and mission context, camera, Artemis, real backend statuses, mobile and offline fallback in production. Keep legacy archive intact. Link artifacts and close only verified issues.

## Ownership / handoff

Front scene, compact UX, Go/Rust/API, DBA and release/QA are separate lanes; see `LANES_2026-11-15.md`, `COCKPIT_RECONCILIATION_20261115.md`, `BACKEND_RELEASE_CANDIDATE_20261115.md`, `../COCKPIT_BACKEND_CONTRACT.md` and `../DB_MIGRATION_RUNBOOK.md`. This checkpoint is not a production deployment or NASA flight certification.
