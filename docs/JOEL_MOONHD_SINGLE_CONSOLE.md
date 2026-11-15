# MoonProof — Joel Moon HD on the principal Preact shell

Owner of the original rendering and source data: @joeljato (#216). This change depends on #296 (canonical static preview and shared adapter). It does not alter elevations, shaders, SPICE kernels, scientific data, colours, or the Go/Rust computation contract.

## Architecture

- `web/moon-hd/three.tsx`: typed bridge to `classic-adapter.js`, which calls Joel's `scene.ts` meshes and shaders. One canvas; no procedural lunar fallback, no separate Three instance. Abort on navigation away/pagehide and preserve the poster on failures.
- `web/moon-hd/preact.tsx`: persistent Preact component mounted outside the route outlet. The home and `#/terreno` use the same interactive panel, and internal shell routes keep the same context. Controls: site, UTC day, keyboard orbit, pole reset, zoom and explicit API calculation.
- `web/moon-hd/mission-api.ts`: typed runtime validation for site catalogue and real Go `POST /api/compare` responses. The Go layer loads authoritative stored series from PostgreSQL or embedded assets and calls the Rust engine. The client does not infer visibility from the rendering or fabricate values on error.
- `web/moon-hd/preact.css`: existing design tokens, responsive one/two columns, visible focus, 44 px controls, reduced-motion poster support. The `pole-preview.webp` from #296 is the fixed-light, CPU-rendered 80 m LOLA snapshot; it is not a georeferenced map overlay or time-dependent shadow evidence.
- `#/terreno` is now internal. The full advanced lab and onboard cockpit remain explicit compatibility destinations pending functional parity; this is not a claim that every legacy route has been migrated.

## Live observations (2026-11-15)

| Endpoint | Result |
|---|---|
| `https://braspace-moonproof.almeida-me.workers.dev/` | HTTP 200 |
| Worker `/api/health` and `/config.js` | HTTP 404 |
| `https://braspace-api.srv1898743.hstgr.cloud/api/health` | HTTP 200; `data_source: postgres`, `engine: ready`, five preliminary and two synthetic series |
| Go `POST /api/compare` (Connecting Ridge, 2026-11-15 UTC, 24 h) | HTTP 200, PRELIMINARY / UNVERIFIED_INPUTS; Sun 100%, Earth 0%, 0 h dark, 24 h Earth blocked |
| Browser CORS preflight from the Worker origin | HTTP 403 `CORS_FORBIDDEN` |

These are observations from the published services, not independently validated science. The private repository remains private. The new TSX panel has not yet been deployed.

## Worker deployment gate

Keep same-origin requests. Integrate `deploy/cloudflare/moonproof-worker.mjs` into the existing Worker: `const result = await handleMoonAPI(request); if (result) return result;` before its existing routing. For an assets-only Worker, the default export is an example using the `ASSETS` binding. Preserve existing behavior for non-Moon requests; set `run_worker_first` for `/api/compare` and `/api/health` in the existing Worker asset routing configuration. The exact upstream is pinned, the body is bounded at 128 KiB, credentials are not forwarded, redirects are rejected, and upstream JSON/HTTP errors are propagated without caching. Keep Go's existing validation and rate/budget constraints. No CORS wildcard is introduced. Do not deploy the example as a separate Worker or replace the existing configuration blindly.

Alternative: explicitly configure the published Worker origin in the Go CORS allowlist and in API base/CSP, if the deployment team elects cross-origin access. Current CORS preflight fails, so merely hard-coding the backend URL is not a fix.

## Acceptance

1. Merge #296 and then this stacked change after full CI passes. Build TS-generated JS in lockstep (`npm --prefix web run build:ts`, `check:ts`).
2. Run `npm --prefix web test`, browser matrix (PC, notebook, tablet, mobile, reduced-motion, software/no WebGL, context loss), Go/Rust integration and scientific acceptance tests. Check there is exactly one GPU canvas on the principal shell and no missing asset requests.
3. Publish using existing Cloudflare configuration, then verify `/api/health` and `/api/compare` anonymously from the actual browser origin, not just using curl directly to Go. Verify `connecting-ridge` with a valid date and error/no-model behavior.
4. Preserve visual vs science status; do not present the shadow shader, synthetic fixtures or the terrain preview as a validated mission solution.

Focused local tests (`node --test web/tests/moon-console.test.mjs deploy/cloudflare/moonproof-worker.test.mjs`) cover contract, dates, markers, failure handling, shell topology and Worker routing, not GPU rendering. The full repository cannot be cloned in the isolated workspace; report only tests actually run.
