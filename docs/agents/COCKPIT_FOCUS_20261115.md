# MoonProof cockpit focus — P0 integration checkpoint

Base inspected: `62bf446e386d3101b6448582330248e160edbb09` (`main`).
User decision: the cockpit is the primary product surface; preserve previous work via archival and keep the existing science and API contracts. Do not remove working capabilities before migration to the cockpit.

## This patch

- Nine independent visibility toggles for battery, Sun/Earth, illumination, rules, alerts, faults, crew, timeline and report. A Moon-only action hides all panels and restores the prior selection. Native buttons/details, PT/EN, keyboard Escape and a 44px minimum target; no simulation or mission-state reinitialization. The DOM survives redraws because visibility is assigned to its ancestor instead of rebuilding telemetry.
- Responsive docks use actual context-bar/toolbar geometry; panel menu is viewport-bounded, timeline width is constrained, report remains reachable on narrow screens. Existing Heloísa tokens are reused. Legacy onboard link is hidden (kept in the DOM for the existing cockpit implementation).
- `cockpit-panels.tsx` is the Preact source of truth, with generated JS. This patch does not replace Joel's renderer or modify Go/Rust/API/DB.

## Evidence and next integration

- Read both supplied harness artifacts; SHA256 manifest verified (322 entries), no archive files copied to GitHub.
- Isolated fixture copied from the exact base: TypeScript 5.6.3 `tsc -p tsconfig.json` passed; `node --test moonproof/tests/cockpit-panels.test.mjs` 3/3 passed; generated JS `node --check` passed. The fixture contains the changed module and exact vendored Preact declarations, not the complete repository. Browser matrix and full-stack CI are still required; the execution environment's Chromium process was blocked by OS sandbox restrictions.
- #319 (interactive Moon HD/API), #320 (mobile overflow), #321 (reversible archive) and #311 (scenario consistency and vector hardening) are existing concurrent PRs. Reconcile HTML changes and verify exact final SHA. #311's model tests were independently reproduced (13/13), but it is not merged and its fixes must be reconciled. No blind merge.
- Independent API agent ran 20/20 contract checks across direct and same-origin Worker, confirming PostgreSQL and Rust ready, real site-evaluate/report, vector status/search and invalid input rejection. Science status remains preliminary/synthetic or unverified; this is not proof of scientific validity or DB integrity.
- Independent 3D agent is implementing the shared illustrative Artemis vehicle on Joel's lunar scene. Preserve one WebGL renderer, selection, fallback to authentic scientific relief when unavailable, and landing lab physics isolation. No simulated vehicle telemetry as measured science.
- Acceptance before merge/deploy: select and hide each group (keyboard/touch), restore all and previous layout, switch PT/EN, change site repeatedly without stale telemetry, run real scenario/faults/report and pgvector, verify 320/390/768/1024/1440/1920 CSS px, real GPU and no-GPU, and Go/Rust/Postgres CI. Record official CI and production smoke separately. No production deployment from this patch.
