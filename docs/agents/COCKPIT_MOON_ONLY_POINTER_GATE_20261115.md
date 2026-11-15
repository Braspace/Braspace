# P0 — Moon-only immersive restore pointer gate (15 Nov 2026)

## Scope and root cause

Canonical route: `/moonproof/` → shared Preact/Three.js cockpit. This is a **focused QA/UX change only**; no modifications to Joel's Moon, the Artemis mesh, Rust/Go, Postgres/pgvector or science inputs.

The shared lazy Moon backdrop sets `.moon-backdrop.is-explore { z-index: 2147483000; pointer-events: auto }`, while the independent panel toolbar was fixed at `z-index:25`. Therefore the fullscreen WebGL canvas can intercept pointer clicks on **Restore panels** even though the controller keeps the toolbar mounted. The existing browser E2E avoided the failure by clicking the Moon's own exit control and then invoking the toolbar via `page.evaluate()` rather than using real pointer interaction.

## Targeted change

- `web/moonproof/screens/cockpit-panels.css`: raise **only** the compact panel toolbar to `z-index:2147483002` during `html.moon-explore-on`; keep the canvas, orbit/drag controls and site pins interactive outside that toolbar.
- `web/browser/cockpit-panels.e2e.mjs`: on a working GPU wait for immersive mode, verify `elementFromPoint` at the Restore button hits that button, and use Playwright's actual `.click()`. No simulated `page.evaluate().click()` is accepted. No-WebGL fallback still tests basic pointer restoration.

## Release gates for the integrator (EXO-X1)

- [ ] Review the one-layer stacking fix against Heloísa's design system and mobile safe area. Test at 320, 390, 768, 1024, 1440, 1920 px; verify menu, restore button and 44 px touch targets.
- [ ] Run `node --check web/browser/cockpit-panels.e2e.mjs`, `npm --prefix web run check:ts`, `npm --prefix web test`, `bash scripts/ci-local.sh --browser` on the **exact PR head SHA**, with real Chromium GPU and without WebGL.
- [ ] While Moon-only is active, click **Restore panels** with a real pointer (not DOM injection) and verify nine panel states and the shared Moon scene. Check Escape, focus order, drag, selected site pins, textures, resize and no duplicate renderer.
- [ ] Confirm Go/Rust/PostgreSQL/pgvector contract and Worker version using existing gates; do not conflate existing production evidence with this PR.
- [ ] Verify no browser console errors and no regressions in onboarding tutorial, responsiveness or reduced-motion preferences.
- [ ] Integrator only: merge/release after green CI and reviews, deploy the exact main SHA, record Cloudflare version ID and rollback, then do production browser smoke and attach evidence.

Status at creation: **proposed PR, not browser-tested, not released**. The user's local EXO-X1/Desktop Commander device was offline from this session; GitHub source code inspection is not GPU evidence. Scientific sources remain PRELIMINARY/SYNTHETIC, not independently validated.
