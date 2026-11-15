# Cockpit-first integrated candidate — 15 Nov 2026

Merge candidate only; no deployment and no merge into main. Base `6970aa6e56087ab3fdd5d161373b4cc7d88c611f` (main, including #315, #317 and #320). Source PRs #324 (panels), #325 (canonical entry), #326 (Artemis 3D); their 22 paths are disjoint and checked against the new main. Keep the component PRs for review; release the integrated candidate instead of independently deploying conflicting variants.

## Observed evidence

- Combined all 86 TypeScript non-declaration sources, strict TypeScript 5.6.3 compile: passed. All 86 emitted JS blob hashes matched the respective GitHub candidate/main objects; 89 total TypeScript source/declaration files. Targeted combination of cockpit-panels, cockpit-3d and entry-redirect: 9 tests passed, 0 fail, 0 skip (Node 24.22.1). Does not establish full repository test coverage.
- The agent's separate exact #311 model fixture passed 13/13 tests and three live scenarios. #311 is not merged here; its race protection and scenario corrections still require reconciliation with #326.
- Live: existing #319 smoke script exercised 22/22 OpenAPI methods at the API host and 35/35 methods/assets/pages through the Worker, including navigation, report, site-evaluate, vector, readiness, data and GLB range requests. Public API health identified older `62bf446e`; no final Worker SHA marker. Database readiness and vector retrieval are not physical measurement validation.
- #324 official Actions failed without step records; logs unavailable (404 BlobNotFound). Browser Chromium launch was blocked by sandbox restrictions. QA script `web/browser/cockpit-focus-e2e.mjs` is prepared for a real runner; syntax checked, runtime unverified.

## Before production

1. Reconcile #311 cockpit async race, time shift, caller-driven antenna fault and pgvector ingestion; #319 must not install a second renderer on cockpit. Integrate #321 legacy archive only after preserving imported modules and removing obsolete links. #320 mobile fixes are already in the base. No destructive delete or duplicate API implementation.
2. Confirm site/epoch/fault consistency, narrower mobile panels, touch, hardware WebGL, loader/fallback, all 9 toggles and restoration, 2D/3D switching, mission reports and Landing Lab with the shared Artemis illustrative model. The visual model and lighting are not measured spacecraft trajectory or real navigation. Execute `web/browser/cockpit-focus-e2e.mjs` against candidate staging with real backend, capture screenshots and Playwright traces.
3. Full green CI with exact SHA, Go/Rust + PostgreSQL/pgvector, independent science quality checks, no public app/repo changes without the release. Record final deploy/build SHA and re-run the same smoke; submission remains a separate authorized action.
