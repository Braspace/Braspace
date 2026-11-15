# Moon HD frontend P0 — QA handoff

## Coverage inventory

| Surface | Modes |
|---|---:|
| SPA | 7 |
| Classic | 5 |
| Polar Lab | 5 |
| Studio | 7 |
| Cockpit | 14 |
| MoonProof multipage | 13 |
| Moon HD fallback | 2 |
| Polar map demo | 1 |
| Dashboard | 1 |
| Training | 1 |
| Total | 56 |

Five viewports: 1920×1080, 1440×900, 1280×800, 768×1024, 390×844. 280 viewport/mode combinations, not 280 passed tests. The actual matrix is executable, records screenshot + results.json per run, and verifies navigation, route-specific visible anchors, document overflow, uncaught errors, HTTP errors and failure preview. No GPU is deliberately requested by this matrix; a separate native GPU run is mandatory for graphics acceptance. For unsupported local routes, configure the same static artifact server and API proxy as production; do not mark 404s as passed.

## Run

Start full-stack backend (real data and API) and serve the matching web branch. Install Playwright in web and Chromium using the existing CI setup. From web: `BASE=http://127.0.0.1:5380 npm run test:matrix`. `MATRIX_FAMILY=cockpit` restricts to one family. `MATRIX_OUT` overrides output. Existing `npm test` and browser/e2e.mjs remain required. The matrix has not been executed in the sandbox: browser launch was blocked by socket permissions; separate desktop production observations are documented in the main handoff.

## Release gates

- Hardware WebGL2: real draw of globe and native cap, correct coordinate frame for known landmarks, selected date, light direction, zoom/drag/touch and keyboard, lost context, retry and fallback. No SwiftShader as evidence of hardware success.
- All routes and responsive states: initial loading, no WebGL, slow network, API error, successful data, language and theme, keyboard-only, reduced motion, touch targets, focus visibility, contrast and no overflow; no change in data provenance/disclaimers.
- Design: shared glass/token/spacing rules (13/21/34 where appropriate); consistent hierarchy, navigation and animations; no fake decorative Moon. Preserve functional map overlays and scientific DEMs (never replace them with non-georeferenced posters).
- Context parity: follow-up #287 for viewer/map URL translation and state persistence (t/start, d/hours, pt/pt-BR). Coordinate with that PR, do not duplicate changes. Test tab and site selection after reload.
- Validate API result, 480-hour cap warning, no-data statuses, UI truthfulness and actual routes. Screenshots are evidence, not scientific validation.
- Archive CI run URL, exact commit, browser/GPU, per-case result, screenshots and remaining failures; keep draft until required checks and GPU validation succeed.
