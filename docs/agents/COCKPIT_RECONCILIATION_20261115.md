# Cockpit P0 release reconciliation — 2026-11-15

## Production audit (connected Chrome, not candidate preview)

- `/moonproof/` still opens personas. Cockpit has generic left, right and bottom folds, but 29 hidden descendants remained keyboard-accessible after folding (3 + 22 + 4).
- The deployed lazy globe loaded in Chrome and contained lunar pins. Selecting Malapert Massif pressed its 3D pin but left the URL/site and operation context at Mons Mouton. The dedicated Cockpit Artemis scene was absent. No production mutation/deploy performed.

## Integrated candidate

- Parent `c1b837c5353858331a166fa3be430240d617d8e3`; reconcile main `773e67c3075275acab0300e7cbc09960d628bee5` (35 changed paths). Keep main's shared density and lazy background on auxiliary pages, but no double zoom or second renderer on Cockpit. Direct entry is still canonical.
- Main's API aggregate helper retained for auxiliary screens; Cockpit daily traces retain their exact static hourly source with API scenario/sky/report, preventing an API aggregate from mislabelling a local chart. Same URL state drives selectable lunar sites, source inputs and reports.
- #344: mobile bottom nav/scroll sheet occlusion, reversible WebGL focus. Camera popup bounds and external CSS fix restrictive `style-src 'self'`. Generic folds (non-Cockpit pages) now make translated content inert and restore focus, respecting responsive breakpoints.
- #343: ci-local `--browser` now runs six-width Cockpit focus gate. Added explicit hardware mode `BRASPACE_REQUIRE_COCKPIT_GPU=1` (no forced SwiftShader). Browser suite checks scene CSS, ready/fallback state, camera controls, visible bounds, alternative selection and 2D restoration. No claim of candidate GPU execution.
- Backend separate: #331 pgvector, #332 scientific grid, #334 EXO CI contracts, #341 omitted power validation, #347 invalid Rust stdout. Combined backend candidate must preserve disjoint OpenAPI sections and all ci-local lanes.

## Evidence

- Super ZIP SHA-256 `01f08b672d42cdf5bfa055ca4dedefc7bf0539b390cf5320f0313305341f1f00`; harness SHA-256 `6d749208360fc48583f97a06f30ddfd9dcc6782c4b35a243f7e4fde4fa3763d6` rechecked.
- Fixture: TypeScript 5.6.3 strict build PASS; Node 24.22.1 MoonProof 249/249 PASS. Backdrop extended suite 12/14 PASS: remaining 2 require 12 binary MoonHD assets not materialized (registry SHA and local asset HTTP). No claim of full assets validation.
- Bash syntax and isolated mocked six-width gate contract PASS, including GPU flags and correct failure propagation. Browser test syntax PASS, real candidate browser/EXO not run here.
- GitHub Actions earlier runs have no steps, log blobs unavailable; #334 reports org billing blocker. EXO-X1 is not connected to this session. Do not force merge/deploy or report GREEN on stale evidence.

## Next gate (MAC / Worker owner)

1. Confirm exact integrated SHA and main at handoff. Reconcile backend candidate ci-local without replacing front lane; run Node 20/22 with full assets, Go/Rust, Docker, actual Postgres/pgvector, science, and EXO `scripts/ci-local.sh --browser` (then hardware mode). Record exact SHA, artifacts, actual errors, and rollback/version ID.
2. Review and promote only with GREEN; backup before backend deploy. Publish canonical Worker, verify direct entry, five supported sites update URL/context, both languages and six sizes, 3D shared lander and 2D fallback. NASA scientific claims remain preliminary or synthetic as appropriate.
