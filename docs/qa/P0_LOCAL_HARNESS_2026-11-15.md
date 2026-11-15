# P0 local harness — 15/11/2026

Base: `main@e7561ea` (merge #302, TS/TSX migration). Branch: `fix/p0-local-harness-20261115`.
Scope: local verification + one reproduced P0 fix. Not production homologation, not scientific validation, not CI green.

## CI root cause (GitHub Actions)

Run 43716005751 (main, merge #302): job `ci` failed in 3 s with 0 steps; annotation:
"The job was not started because recent account payments have failed or your spending limit needs to be increased."
Root cause is **billing / spending limit of the Braspace organization**, not workflow config or tests. Every workflow
on every PR fails the same way. **External blocker — needs an org owner in Settings → Billing & plans.**
Until then the matrix below is the local equivalent; it does not make GitHub CI green.

## Environment

Fedora 45 x86_64 · Go 1.27.4 · Rust/cargo 1.100.0 · Node 26.13.1 · Python 3.15.2 · Docker 29.9.3
PostgreSQL 17.12 + pgvector 0.8.7 (`pgvector/pgvector:pg17`, disposable container, 127.0.0.1 only, no production access)
Chromium via Playwright (headless, software rendering — no GPU validation).

## Test matrix (HEAD of this branch)

| Suite | Command | Result |
|---|---|---|
| Go vet | `go vet ./...` | exit 0 |
| Go race + real PostgreSQL + real Rust | `TEST_DATABASE_URL=… TEST_VECTOR_DATABASE_URL=… RUST_ENGINE_BIN=… go test -race -count=1 -v ./...` | exit 0 · 206 PASS (top-level + subtests), 0 FAIL, 0 SKIP · 4 packages |
| DB-specific (subset of above) | TestDB* + TestVectorPostgresOptionalIntegration | migrations from empty, 001→002 keeps rows, idempotent migrate, ingest twice same counts, swapped hash refused, VALIDATED refused, tampering/gaps detected, atomic invalid-source rejection, pgvector integration — all PASS |
| Rust | `cargo test --locked --all-targets` | 24 passed (3+18+3) |
| Fullstack HTTP | `BRASPACE_E2E_API_BIN=… BRASPACE_E2E_RUST_BIN=… node scripts/fullstack-e2e.mjs` | 22/22 OpenAPI operations, 71 PASS lines, direct Go/Rust and web proxy, synthetic/offline |
| Web lint | `npm --prefix web run lint` | exit 0 |
| Web unit | `npm --prefix web test` | 404/404 (was 390: dashboard suite now included) |
| TS source of truth | `npm --prefix web run check:ts` | 83 .ts sources match generated .js |
| Science | `python3 -m unittest discover -s science/tests` | 29 OK |
| Data/release gates | `python3 -m unittest discover -s tests` | 42 OK |

## DASH-01 — stale response rendered under another site (backlog #5) — VERIFIED

- **Reproduced in Chromium on main code**: Nobile Rim 1 selected; Malapert's slow /api/compare (delayed 2.5 s) answered last;
  "Hours in sunlight" showed **519 h** (Malapert) under the Nobile label, while Nobile alone shows **260 h**.
- **Root cause**: `calculate()` in `web/dashboard/dashboard.ts` awaited fetches with no request identity; the last
  response to arrive won. Switching to a site without series did not invalidate an in-flight request either.
- **Fix**: exported `latestRequestGate()`; each calculation or site change aborts the previous fetch
  (AbortController) and only the current token may write state, show errors or re-enable the button. AbortError is
  never reported as "API down".
- **Tests**: 3 regression tests (failed before, pass after). Same Chromium scenario after fix: **260 h**, no console
  error, button enabled, no horizontal overflow at 1920×1080, 1366×768, 768×1024, 390×844
  (screenshots in `p0-local-harness-20261115/`, SHA-256 in SHA256SUMS).
- **Gap closed**: `web/dashboard/tests` was executed by neither `npm test` nor any workflow.

## Findings recorded, not changed here

- **GOFMT-01**: `gofmt -l api` lists 13 files on main (e.g. sky.go, vector.go, onboard/*.go). No workflow runs gofmt.
  Not reformatted here to avoid whitespace conflicts with open drafts #279/#291 touching the same files; apply after
  their reconciliation and add `test -z "$(gofmt -l .)"` to ci.yml.
- **WIN-01 (480 h vs 720 h)**: the dashboard prefills duration up to 720 h while `onboard.MaxSamples=480`;
  /api/onboard/site-evaluate answers explicit 422 WINDOW_TOO_LONG (visible error, not silent truncation). The cockpit
  shows "covers only the first 480 h". Full 720 h support is proposed in draft #299; not duplicated here.
- Science aggregates (solar-disk fraction) remain stale until regenerated from pinned sources — unchanged, still PRELIMINARY.

## Not covered

GPU WebGL / Moon HD hardware rendering, full 56-surface × 5-viewport matrix, physical touch, Docker image build,
production/VPS, NASA submission. No merge, no deploy, no production writes.
