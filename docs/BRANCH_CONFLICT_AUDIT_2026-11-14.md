# BRASPACE — Branch/PR conflict and integration audit

**Readback baseline:** 2026-11-14; repository `Braspace/Braspace` (private). GitHub ref heads, changed filenames, PR state and CI were checked with the connected GitHub app. This is a **snapshot**: re-read HEAD SHA before any merge. Does not imply all tests, scientific validation or release gates are complete.

## Live snapshot of relevant pull requests

| PR / branch | Status checked | Main work | File-level overlap | Recommended action |
|---|---|---|---|---|
| [#45](https://github.com/Braspace/Braspace/pull/45) `team/gustavofullstack/spaceapps-2026` | **Merged** | Go/Rust bootstrap, Docker CI | Historical branch now behind main | **Never merge old branch again**; preserve as legacy |
| [#62](https://github.com/Braspace/Braspace/pull/62) `team/Ninzinhu/spaceapps-2026` | **Merged** | QA/verification documents | Historical branch now behind main | Preserve; use new feature branches for future QA |
| [#70](https://github.com/Braspace/Braspace/pull/70) `team/gustavofullstack/onboard-computer-v1` | **Merged** | `api/onboard/onboard.go`, tests, `POST /api/onboard/evaluate` | `api/main.go`, `Dockerfile` already changed on main | Preserve; integrate other feature routes **without deleting onboard registration** |
| [#53](https://github.com/Braspace/Braspace/pull/53) `team/gfreiresjrp/spaceapps-2026` | Open, most recent CI success at `154ce270...`, mergeability must be refreshed | Site catalog, typed Go compare, time-series delay replan, PostgreSQL, OpenAPI, 36 files | `api/main.go` with #70 and report #72; `Dockerfile`; `.github/workflows/ci.yml` with #71 | Preferred next technical review/merge **after** independent QA; preserve `/api/onboard/evaluate`, compare/replan routes and all Postgres CI |
| [#71](https://github.com/Braspace/Braspace/pull/71) `team/maccachera/spaceapps-2026` | Draft, CI push success and PR workflow running at readback | NASA LOLA PDS source manifests, actual 115,520,000-byte `LDEM_80S_80M.IMG` recorded SHA-256, labels, SPICE metadata, attribution and verification script | `.github/workflows/ci.yml` with #53; data docs otherwise disjoint | Keep research provenance intact; reconcile workflow **without removing PostgreSQL tests**; dataset selection is not an integrated terrain horizon |
| [#72](https://github.com/Braspace/Braspace/pull/72) `feat/onboard-mission-report-20261114` | Draft; latest CI pending at audit, earlier red due unused Go import then fixed | Strict `POST /api/onboard/report`, deterministic printable HTML / browser PDF, risk table and XSS tests | One-line `api/main.go` route vs #53; `api/onboard/report*.go` unique | Review after #53; ensure both route registrations exist, rerun Go/Rust/Docker CI and verify real HTML print |
| [#44](https://github.com/Braspace/Braspace/pull/44) `ops/spaceapps-2026-coordination` | Draft, docs-only | 15 competitors, responsibilities, 58+ issues, strategy and science/report specifications | Mostly new docs; **content staleness** from fast-moving issues/PRs is primary risk | Review/update issue counts and owner matrix; can merge without code collision once accurate and approved |
| `team/joeljato/spaceapps-2026` | Behind main, no unique diff at audit | Scientific tasks assigned but not yet pushed to this branch | No file collision yet | Do **not** merge/no branch overwrite; await source-backed science PR |
| `team/lisanogueira/spaceapps-2026` | Behind main, no unique diff at audit | UX & education tasks assigned but not yet pushed to this branch | No file collision yet | Do **not** merge/no branch overwrite; await original designs |
| `jotave` | Behind main, no unique diff at audit | Legacy | None | Preserve, no merge |

## Explicit collision matrix

| File | Branch/PR A | Branch/PR B | Exact resolution |
|---|---|---|---|
| `api/main.go` | #53 registers mission service/middleware | #70 **already merged**, #72 registers report route | Integrate both `(&missionAPI{...}).register(mux)` and `mux.Handle("POST /api/onboard/evaluate", onboard.Handler())` and `mux.Handle("POST /api/onboard/report", onboard.ReportHandler())`. Preserve middleware. **Verify once Go tests compile.** |
| `Dockerfile` | #53 copies all Go API sources for embedded site fixtures and Postgres support | #70 already changed the Go build package dependency copy | Confirm `COPY api/ ./` and runtime startup/health; Go binary must contain site fixtures, onboard and report packages. Run clean Compose build. |
| `.github/workflows/ci.yml` | #53 adds Postgres service/integration tests | #71 adds LOLA verification/data-contract checks | Union the jobs/steps; never choose one file version wholesale. Keep Go race, cargo tests, Go↔Rust smoke, Docker, Postgres ingestion and NASA manifest/source validation. |
| `api/go.mod` / `api/go.sum` | #53 introduces DB driver and dependency lock | main uses Go 1.23 baseline | Use the exact PR53 dependency versions and `go mod tidy`; never drop driver to satisfy the report PR. |
| `docs/SPACE_APPS_2026_WORKBOARD.md` | #44 planning audit | Live issue tracker grows | Refresh total and assignments from GitHub before merge; issue creation != implementation. |

## Important scientific and planning blockers

- Maccachero's [LOLA source verification](https://github.com/Braspace/Braspace/blob/team/maccachera/spaceapps-2026/data/LOLA_80S_80M_VERIFICATION.md) reports **real bytes retrieved and matched a SHA-256** `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`. The data **are not yet loaded into the Go/Rust lunar horizon engine**. No scientific result may be claimed NASA-backed until this is implemented and independently validated.
- The onboard module in main is an **educational ground simulation** and reports `UNVERIFIED_INPUTS`. It does not constitute a certified spacecraft onboard computer.
- [Issue #69](https://github.com/Braspace/Braspace/issues/69) (Gabriel Freire) covers O2/food and broader resource model — it is **distinct** from #63 and not completed by the onboard battery/DTE module. Document mass/consumption assumptions, crew count, duration and whether consumed during arrival delay.
- UI 3D, static public project URL, anonymous slide access, actual NASA dataset integration and **Submit for Judging** are separate proof gates.
- Code branches from teammates must not be reset, force-pushed or merged merely because a PR is labelled `mergeable=true`. Latest green CI and independent code/data review come before merge.

## Proposed conflict-safe sequence

1. Re-read HEADs and CI for #53, #71, #72; attach review notes. Fix any red checks.
2. Review/merge **#53** (backend + source fixtures) when CI green and someone independent validates schema/route compatibility. Check `/api/onboard/evaluate` still works.
3. Reconcile **#71** workflow with #53; preserve all Postgres checks and NASA source verifiers; review NASA asset license/source facts, then merge after approval.
4. Rebase or re-create **#72** one-line route atop new main while preserving #53. CI and HTML/PDF visual QA, then merge.
5. Reassess #44 docs and outstanding issues against merged code; correct status before docs merge.
6. Complete NASA LOLA terrain horizon, SPICE source handling and scientific validation; bind them to UI and real report input without laundering `UNVERIFIED_INPUTS` into `VALIDATED`.
7. Publish independent public web project/demo, verify both anonymously (max 7 English slides), and have team owner submit NASA portal by deadline.

**Never claim everything is DONE based on a backlog or README.** CI build != scientific validation; public PDS URL != source used in a calculation; descriptive imagery != metric elevation.
