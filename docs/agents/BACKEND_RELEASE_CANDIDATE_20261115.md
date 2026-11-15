# Backend P0 release candidate — 2026-11-15

Base: `773e67c3075275acab0300e7cbc09960d628bee5`. This candidate integrates five component branches, without modifying the product frontend:

| PR | Component commit | Scope |
| --- | --- | --- |
| #331 | `8b342a0d8b8db7f93d9e5dd02b59fa11befbc74f` | pgvector input/readiness, reversible quarantine and real DB lane |
| #332 | `687126b5c504cf5b5efcdec89f1b23e70eee211d` | sky uses exact grid, no silent rounding |
| #334 | `ca7a6277d7e6b0b745b5a1a3a517a3431eebf52f` | cockpit HTTP contract and CI lane |
| #341 | `973c5420a9171a5436ae09ac274fe6943281518e` | explicit physical resource inputs, no silent zeros |
| #347 | `513c8dc75ec25758de62c61196aa2a09e11f466e` | exact Rust stdout keys/non-null fields; typed visibility schema |

The shared `api/openapi.json` hunks were reconciled without whole-file replacement. `scripts/ci-local.sh` retains the pgvector and cockpit-to-API lanes. `scripts/cockpit-backend-contract.mjs` now supplies the `code` and `httpStatus` error fields used by the compact cockpit model, and checks omitted `load_w` and off-grid sky windows. #343 (browser UX lane) is deliberately excluded; the frontend candidate integrates it separately. Do not independently merge the component PRs after this combined tree is accepted. The engine-only portion of older broad #291 is superseded by #347.

## Evidence (not scientific validation)

- Go 1.26.11 exact-main source fixture plus combined changes: `go test . ./onboard -count=1` PASS (16.432s / 0.014s).
- `bash -n scripts/ci-local.sh`, `node --check scripts/cockpit-backend-contract.mjs`, OpenAPI JSON parse PASS.
- Local Go HTTP executable compiled from combined source, embedded site data and deterministic **Go testengine double** (not Rust). Cockpit contract PASS 48/48 on exact main frontend modules and 48/48 on #329 frontend head `989f22cd8a2dd8102d9d8dda09b17d46b33b0000`. The test includes all catalog sites, site-evaluate/fallback, power/crew/report, invalid resource and grid inputs. Vector status was disabled, not evidence of an active pgvector index.
- No `TEST_DATABASE_URL` or `TEST_VECTOR_DATABASE_URL`: verified 16 DB/pgvector tests skipped. This environment cannot certify active Postgres, pgvector, real Rust, science binaries, Chromium or the final EXO-X1 release gate. No production mutation or merge was executed.

## Integration and release checklist

1. MAC integrator: reconcile with final #329 frontend tree, including #343 browser lane and preserving both backend lanes in `scripts/ci-local.sh`.
2. Run `scripts/ci-local.sh --browser` on the final exact SHA in EXO-X1; confirm all Go/Rust/Postgres/pgvector, Worker and browser lanes, no DB integration skips. Confirm science manifest/hash validation in Docker test stage.
3. Verify direct API and same-origin Worker contract using the final frontend; validate active pgvector independently (source metadata only, never mission science). No scientific confidence promotion.
4. Follow `docs/harness/OWNERS.md` release owners. Record backend backup (`pg_dump`) and rollback image, Worker version ID, commit SHA and post-deploy QA. Selective rollout and rollback are owner-authorized operations only.
