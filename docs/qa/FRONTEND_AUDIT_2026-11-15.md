# BRASPACE — Frontend QA checkpoint / 2026-11-15

## Decision and evidence boundary

**NO-GO for full frontend certification.** This doc is an audit, not a fix or a scientific certification. Public site tested through desktop Chromium at 1363×936 CSS px; private repository statically audited at `ae139fdc15cbbad79f66917379b60a0d1c74ffd2` (main at start). Public deployment's build SHA was not verified. Three parallel reviewers inspected SPA/design/state, 3D, and CI evidence. Browser rendering, selected interactions, API results and isolated JS reproducers are distinguished from code-only risks. No direct PostgreSQL authentication, mobile device, GPU WebGL rendering, full CI rerun, or NASA certification was obtained. 64 desktop screenshots were captured during audit, including transitional and negative states (not 64 independent passed tests); retained in the QA session, not committed. An additional real 390×844 local Playwright attempt reached Chromium launch but failed with process_singleton_posix.cc socket() failed: Operation not permitted; no mobile page was rendered. The permission block was respected.

## Surface inventory (53 views, not 53 certified workflows)

| Surface | Count | Observed |
|---|---:|---|
| Main SPA | 7 | Home, Explore, Compare, technical planning, classroom, activity, evidence; navigation and selected actions exercised |
| Onboard computer | 13 | Overview, parameters, geometry, horizon, windows, energy, life support, replan, visual, sensitivity, log, launches, status; all panels opened; energy evaluation partial; replan preview only |
| Polar Lab | 5 | Explore, Compare, Recover, Landing Lab, Evidence & Learn; live analysis and settings; no WebGL context |
| Mission Studio | 7 | Overview, Explore, Compare, Recover, Science & engineering, Evidence, Learn; live sky, comparison and replan executed; education reveal worked |
| MoonProof multipage | 13 | Index, mission, explore, compare, recover, cockpit, landing, debrief, evidence, present, activity, plan, rules; loaded after async initialization |
| Classic | 5 | Explore, Compare, Recover, Science & Engineering, Evidence & Learn; baseline+delay evaluated |
| Moon HD | 2 | Pole and Globe modes both remained on loading without WebGL; GPU paths unverified |
| Polar map demo | 1 | Colored elevation map and candidate pins rendered |
| Total | 53 | Inventory of distinct views including both Moon HD modes; not a claim all controls pass |

Public routes: https://braspace.github.io/ ; https://braspace.github.io/moonproof/ ; https://braspace.github.io/studio/ ; https://braspace.github.io/classic.html ; https://braspace.github.io/lab.html ; https://braspace.github.io/onboard/cockpit.html ; https://braspace.github.io/moon-hd.html ; https://braspace.github.io/polar-map-demo.html.

## Live integration evidence

- Studio: Go API connected, 16 catalog regions. Malapert, 2025-01-01T00:00Z, 24 h: 24 stored samples at 3600 s, PRELIMINARY; comparison of Malapert (100% Sun, 0% Earth, 0h dark, 24h Earth gap), Haworth (NO_SERIES_DATA, all numeric cells dash), Nobile Rim 1 (91.7% Sun, 0% Earth, 2h dark, 24h Earth gap). Replan with constraints 60h darkness and 72h Earth gap returned BASELINE_ADMISSIBLE with 6 options (baseline, +24/48/72h, two nearby sites), with human review caveat. No claims of flight safety.
- Classic: Connecting Ridge, 2026-12-01, 48h, +48h delay; baseline 0 Wh minimum charge, 14h darkness, 48h Earth obstruction, 3 risks; delayed 500 Wh, 48h Earth gap, 1 risk. Computed from stored series PRELIMINARY. 2D fallback shown.
- Multipage Evidence: API online, UNVERIFIED_INPUTS; 16 catalog sites, 7 stored series (5 PRELIMINARY + 2 SYNTHETIC), 5 locally precomputed sites; **Metadata search (pgvector): off**. Passport has series SHA, NAIF kernels and horizon assumptions. This is direct frontend evidence of disabled search, not proof entire database is unavailable.
- Multipage Compare: distinguishes 3 scenarios / 2 sites / 2 dates; B and C at Malapert are intentionally different dated cases. Do not conflate this with SPA duplicate-site bug.
- Multipage Recover: default +48h references POST /api/scenarios/delay, 107h -> 59h longest night, margin -47h -> +1h, Earth 94% -> 100%; options partly local stored series, not all returned by API. 
- Multipage Landing: guided/free modes, camera selection, telemetry and no-GPU simulation work; 998m initial altitude declined, fast-descent alert at 531m, -42.7m/s. Center is black without GPU; no visual 3D validation. In a deliberate free-mode no-thrust attempt, auto-navigation to Debrief succeeded: touchdown −59.5m/s, 295m from target, 100% fuel, 4/7 rules met; failure correctly identified engine not fired. Empty and populated Debrief both observed. Landing target slope initially 1.1° vs touchdown 2.2°: investigate whether different sampled points are explicitly identified.
- SPA Explore selection updates Malapert, 74% solar, 44% Earth, longest night 134h; energy N/D. Polar map demo rendered in deployment despite relative /api/sites static concern.
- Onboard state ENGINE READY / UNVERIFIED_INPUTS / SYNTHETIC. 36/75 OK, 9 partial, 5 scheme, 13 pending, 12 blocked; status must not be interpreted as all live integrations. Launches are blocked by scope.

## P0 — release blocking

| ID | Evidence | Required regression / acceptance |
|---|---|---|
| FE-01 | SPA Compare selects Malapert A/C after Explore CTA; static pickedSites Node repro duplicates 2/5 defaults. `web/shell/views/common.js:24–29`. PR #274 open has partial fix, review duration parsing before merge. | Test every known initial site, all scenario identities unique where distinct-site comparison is intended; allow explicit different dates for same site only when labeled. |
| FE-02 | SPA technical duration 28→56 updates local table yet Terreno link contains site only; Lab opens 14d. `web/shell/app.js:65–70`, `views/explorar.js:64`, `web/ds/router.js:59–62`, `web/moon-hd/backdrop.js:59–65`, `web/moonproof/core/shell.js:128`. | Shared typed context: siteId, UTC epoch, duration hours, layer, language, origin; round-trip links/back/deep links across SPA, Lab, HD, board, Studio, multipage. Explicit unsupported window, never silent reset. |
| FE-03 | Onboard Overview Earth blackout 351h vs Windows 702h for same synthetic scenario, parameter 720h/30d, windows extend Dec 1–Jan 29 22:00; Geometry reports 60min vs parameter 120min. Default energy run rejected WINDOW_TOO_LONG; explicit partial 480h result. | Single window/sample duration; compare window sums, longest blackout and timestamps across all cards, half-open UTC boundaries, step consistency; never silently truncate energy horizon. |
| FE-04 | Real Malapert link opens synthetic A, default Dec 1 720h. Static provenance caution appended only once (`web/onboard/cockpit.js:1941–1943,1967–1971`), tab render replaces children (1823–1837); tabHash uses query.site not current S.site (1899–1904). | No silent real→synthetic substitution; sticky visible SIM badge and explanatory transition on every panel, URL state consistent after changing site/tab, tests real + synthetic + no series. |
| FE-05 | Moon HD hangs in loading on no-WebGL Chromium, console THREE renderer error + TypeError T is not a function (app.js:72:18). `web/moon-hd/app.js:72,453` top-level renderer before catch, no contextlost handler. | No GPU => accessible 2D map/error/retry, no infinite spinner; GPU => pole/globe image, GLB, controls, camera, context loss/restore and network error tests. |
| FE-06 | Isolated Node repro: delayed route A then B then A resolution injects [B,A] and invokes onAfter [B,A], `web/ds/router.js:78–108`. | AbortController/generation guard, rapid navigation, browser history, stale response and cleanup tests. |
| FE-07 | Isolated Node lab duration d=0.001 produces 4166.6667% with synthetic all-visible fixture, d=Infinity accepted; d=3 unsupported blank. `web/lab/data.js:143–150`, `app.js:321–325`. SPA options 7/14/28/56 vs Lab 2/7/14/28/365. | Finite, supported, positive, coverage-checked duration; explicit error and clamp metadata; all percentages 0–100, no divide by zero; compatible 56d path. |
| FE-08 | Published Evidence says pgvector off; current CI not proven green. | Search UI -> real API -> Postgres pgvector; migrations/extension/index, search empty/error/no results, source IDs, readiness flag; perform live end-to-end and assert off state if unavailable. |

## P1 — usability, design, performance and quality

- FE-09: skip link `#view` maps to 404 router in isolated Node reproduction; browser published Home and Explore clicks preserved routes, so this risk was NOT reproduced on deployed build; distinguish in-page anchors from routes; keyboard focus to main, Back/Forward, Escape and modal focus trap.
- FE-10: independent token stacks `web/ds/tokens.css` (radius26, rgba(12,15,18,.58)) and `web/moonproof/core/tokens.css` (radius22, rgba(16,18,20,.72), 8/13/21/34 scale), plus Studio/Lab/HD/Classic CSS. Implement shared semantic tokens, 5/8/13/21/34/55 spacing and meaningful grid, typography, borders, glass contrast, map legend, responsive safe areas; preserve each task's visual hierarchy. No pixel parity to Heloisa reference established.
- FE-11: Compare Lab table squeezed into side panel while black center; Board visual panel checkbox alignment poor; Studio labels/values run together (e.g. SITE/Malapert); multipage nav and labels show truncation, planning table nested horizontal scroll; verify anchored cards and accessible scroll at all widths.
- FE-12: language mixed PT/EN on Lab; depth Answer/Why/Proof varies across modules. Consistent glossary, unit and date formatting, translated tooltips/ARIA labels, origin seals, clear selected control, no hidden evidence.
- FE-13: `web/lab/scene.js:11` static CDN import can block before fallback; `web/moon-hd/scene.js:13–18` asset byte length only; `web/moon3d.js:128,138–141,181–182` visual provenance while loading and late GLB/texture lifecycle risk. Self-host locked dependency where appropriate, SHA-256 integrity, context loss/restore, abort/dispose, lazy LOD, memory and frame-time budgets.
- FE-14: Multipage Evidence says no slope source / Plan says no effect, Explore shows EST slope (2.2° in Mons Mouton). Clarify estimated terrain visual slope vs source-backed planning slope; preserve distinct evidence classes. No scientific inference from rendered imagery.
- FE-15: reduce motion checkbox toggled in Polar Lab, landing telemetry simulation ran; full animation quality, motion preference, touch, FPS, visual transition regression not certified. Test CSS/JS prefers-reduced-motion, tab hide/resume, scroll, touch, pointer capture, pause and replay.

## CI evidence and gate

- Latest inspected #278 head 3389f44: failed job https://github.com/Braspace/Braspace/actions/runs/43702721467/job/132777142041 ; steps null, logs unavailable (404 BlobNotFound). #277 head 7820b8b https://github.com/Braspace/Braspace/actions/runs/43702216005/job/132775599567 and #279 https://github.com/Braspace/Braspace/actions/runs/43702790068/job/132777465688 similarly failed/unattributable. No combined status on audit main, query for push workflow runs yielded zero; do not infer job failure cause or claim no CI.
- Historic Node 20/22 tests 51/51 https://github.com/Braspace/Braspace/actions/runs/43627634757 ; older PR #108 real Go/Rust integration Chromium artifacts https://github.com/Braspace/Braspace/actions/runs/43627634824/artifacts/14126663086 ; neither certifies current SHA.
- `npm test` omits onboard suite (separate local/Docker command); Docker and current workflow Node22 only, despite Node20/22 requirement. Existing browser tests desktop multipage and 6 mobile geometry checks, only 3/13 onboard panels, no GPU Moon HD GLB integration. `scripts/page-sweep.mjs` checks 1440×900 and 390×844 but not wired into CI; no current screenshot artifacts.
- Required gate: Node20/22 frontend tests incl onboard; Go/Rust + Postgres/pgvector schema and live API contract fixtures; mandatory Playwright Chromium, Firefox, WebKit routes/control assertions; 320×568, 390×844, 768×1024, 1024×768, 1440×900, 1920×1080; visual snapshots each view, empty/loading/offline/error, actual GPU + no GPU, keyboard/axe, touch, 200% zoom, reduced motion; console/network failures, horizontal overflow, interaction assertions, trace/screenshots on failure. Exact SHA and deployment identity. Current run does not certify mobile, GPU, export/download integrity, touch, high-DPI, all controls or cross-browser.
- Define release as 0 unresolved P0 in primary demo flow, CI green with downloadable artifacts on exact SHA, explicit remaining P1 limitations and source provenance. Preserve private repo until authorized publication; no merge/deploy/submission by audit.

## Brain / handoff

Canonical checkpoint: this file. It summarizes verified observations, source-code reproductions, CI links, and backlog priorities. Agents should start here and reconcile #274/#279 before modifying overlapping files. For each FE item create or link existing issue; record exact SHA, red regression, green local test, CI URL and deployment smoke evidence. Do not change origin labels or fabricate data. External vector/graph memory ingestion has not been performed or confirmed.
