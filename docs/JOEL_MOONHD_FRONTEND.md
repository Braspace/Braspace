# BRASPACE — Moon HD visual identity / frontend P0

Date: 2026-11-15. Base audited: `a3692147210ba9cd33acc2bacdec597299a04601`.

## Canonical source

Joel (@joeljato), PR #216 (merged): Moon HD viewer, real LRO/LOLA south-polar terrain; PR #247 extracted the shared scene; PR #252 prevents software WebGL from starving the interface. Keep `web/moon-hd/scene.js`, `web/moon-hd/polar-math.js`, and `web/data/moonhd/manifest.json` authoritative. Native 80 m near the pole, 320 m regional grid; source `LDEM_80S_80M`, NASA LRO/LOLA. Visual product, not independently validated or NASA-certified.

The new static preview is a reproducible orthographic heightfield render of the **same** checked 80 m grid, lighting fixed for illustration, not a screenshot of the WebGL shader and never a live SPICE prediction. `science/render_moon_preview.py` regenerates `web/moon-hd/pole-preview.webp`:

```sh
python science/render_moon_preview.py web/data/moonhd/south_pole_80m.bin web/moon-hd/pole-preview.webp
```

- Source SHA-256: `a1244e43cb392feb55aa63ee2289de5a7a098847f2511ce5fba2fcafceccf23c` (8,388,608 bytes, verified against published manifest).
- Derived WebP SHA-256: `9eacf3af78202bb35ee41d5c795621ecb1cf168a30260e5cda39f26eba4e99b7`; 1200 × 800; 57,644 bytes. Renderer: NumPy, SciPy, Pillow; fixed orthographic camera tilted 18° from nadir. Attribution: terrain data NASA LRO/LOLA; model integration Joel, BRASPACE; offline preview BRASPACE. Do not use as a registered map or hazard certification.

## Surface policy (22 HTML entrypoints, including their routed modes)

| Family | Preview / model policy | Functional data retained |
|---|---|---|
| Shell `/`, Explore, Compare, Technical, Class, Activity, Evidence | Shared static backdrop; prior hardware-gated Moon HD backdrop where already wired | Existing projected selectable map and data cards |
| MoonProof entry, Evidence, Rules, Debrief | Same preview while WebGL initializes/fails; existing hardware-gated scene | Source labels, debrief trajectory |
| MoonProof Mission, Explore, Compare, Recover, Cockpit, Landing, Plan, Present, Activity | Shared image behind content only; no second animated canvas | LOLA map projection, marker positions, rays, charts, simulator and educational state |
| Classic, Onboard cockpit | Common decorative backdrop; existing foreground widgets protected | API-backed calculations, classic globe pending migration |
| Onboard educational index, Dashboard, Studio | Shared image behind content, light-mode veil for educational index | Preserve contrast, forms, tables, role state |
| Polar Lab, Polar Map Demo | Common background; never hide map/canvas | Existing terrain markers, simulator and geospatial layer registration |
| Moon HD viewer | Poster during load; 45 s fallback for stalled import/loading, localized retry and 2D map link | Original full interactive Moon HD when available |

## Current evidence and limits

- Public viewer `moon-hd.html?view=pole&lang=pt`: black loading screen with `THREE.WebGLRenderer: A WebGL context could not be created` / error at `app.js:72` in fresh cloud Chrome; no working WebGL. This confirmed the P0 before change.
- Public shell home: loaded four task cards and old decorative relief; Explore loaded selectable five-site map and correctly marked prototype values/unknown energy. Responsive and contrast validation remains pending.
- Shell checkout not authenticated in this environment; source inspected at pinned GitHub commit through authenticated connector. Local Chromium startup failed (`socket() failed: Operation not permitted`). Do not claim browser validation of this branch or screenshot coverage of 53 modes.
- PR #281 documented 53 surfaces, including historical FE-05; #287 is open at inspection and overlaps frontend context/loader fixes. Reconcile before merge. Do not mask functional maps, overwrite teammate code or deploy directly.

## Next implementation and QA gates (P0)

1. Obtain a GPU-enabled screenshot of Joel's exact scene from the existing `?view=pole` at a declared UTC and camera, publish controlled WebP variants (desktop, portrait, tablet) with source manifest and scene revision. Use as future replacement for orthographic preview if fidelity is approved.
2. Integrate the shared scene into foreground legacy globe, Studio visual, Polar Lab and operational maps through explicit camera/projection adapters. Keep 2D georeferenced layer and pin interaction as an accessible fallback. Never move marker coordinates to match a decorative poster.
3. Share one typed MissionContext across all routes (site, UTC, duration, layer, language, provenance). Coordinate #287. Preserve back/forward, deep links, source claims, and API behavior. Do not duplicate WebGL engine or scientific calculations.
4. Audit every route and modal/mode from #281 plus new TSX routes at desktop 1440×900, notebook 1280×800, tablet 768×1024, mobile 390×844 and narrow 320px. Capture actual screenshots and console logs. Use physical touch hardware for gesture QA.
5. Verify slow network, no WebGL, software WebGL, real GPU, context loss/restoration, reduced motion, keyboard-only, tab visibility, navigation while loading, and offline. A poster must always be present before asset download; no indefinite loading, double canvases, or leaked GPU resources.
6. Validate typography, glass contrast, safe areas, focus, responsive reflow, animation and Linear/Fibonacci hierarchy using existing design tokens, spacing and Heloísa's `designer/` references. Preserve accessible semantic controls and avoid decorative effects over scientific labels.
7. Run `npm --prefix web run lint`, `npm --prefix web test`, full browser e2e with software fallback and GPU separate, then release pipeline at exact SHA. Capture actual screenshots and check API / site data continuity. Require science owner and UX review.

Release gate: no full frontend acceptance, merge, production deployment, scientific validation, or NASA submission claimed by this checkpoint alone.


## Cycle 2 — 2026-11-15

- Classic imports `moon-hd/classic-adapter.js`: one WebGL 2 context, shared Joel scene/cap, 80 m desktop / 320 m mobile, camera-only orbit, keyboard, selected site focus, UTC ephemeris sample and canonical poster on startup/failure/context loss. No synthetic globe or separate background GPU canvas. GLB legacy utility retained for its independent tests, no longer wired into Classic.
- Polar Lab global-scale view imports the same scene/cap, scaled to its kilometre coordinate frame. Analysis grids and local terrain/landing physics are unchanged. Async resources are scoped to the active scene; poster remains on failure. Validate hardware GPU and marker registration before release.
- Studio's CSS sphere and fake dashed orbit are replaced by the authentic preview. Explore natural texture references the same Moon HD 4K source; registered relief, PGDA and LOLA maps remain unchanged.
- Cockpit navigation gets a stable deep link and regression coverage (14 tabs, previously CI expected 13); comparison checkboxes use a 44px touch target, adaptive grid and compact control. Multipage pre-ready root shows preview even while body is hidden.
- Browser audit of the deployed site, desktop 1348×925: Classic synthetic sphere fallback; Studio artificial CSS sphere; Cockpit comparison layout oversized. Energy evaluation responded explicitly SYNTHETIC, NO_CANDIDATE_MEETS_ALL_ASSUMED_LIMITS / NO_OPTION_PASSES_ASSUMED_LIMITS with 3 breaches; 720 h request capped to 480 h with WINDOW_TOO_LONG warning. These observations are from the deployed version, not validation of the draft.

See [QA matrix](JOEL_MOONHD_QA_MATRIX.md). Do not mark complete until browser evidence and actual hardware-GPU validation pass. No changes to backend scientific decision rules.
