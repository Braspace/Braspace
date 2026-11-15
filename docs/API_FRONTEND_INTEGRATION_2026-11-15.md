# P0 — API and frontend integration (2026-11-15)
Baseline private main: `439606d8364494d719b7aec060547800463fd17b`. Public Pages configuration separately identified source `66b935068e81`.

## Observed live evidence (09:46–09:48 UTC)
Public API `https://braspace-api.srv1898743.hstgr.cloud`, with Origin `https://braspace.github.io`:
- All 21 OpenAPI method/path operations requested. 20 HTTP 200; optional vector search HTTP 503, explicitly disabled and unavailable (384 dimensions). Exact CORS origin on the responses; allowed POST preflight HTTP 204, unrelated origin HTTP 403.
- Health: status ok, engine ready, PostgreSQL, 16 sites, 7 stored series (5 elementary PRELIMINARY, 2 SYNTHETIC). No independent scientific validation.
- GitHub Pages direct /api/health is HTTP 404 HTML; published HTML loads a generated config.js that routes fetch to API. Repository source previously depended on this injection.
- Anonymous browser Studio: connected catalogue 16; sky returns 24 hourly Malapert samples; compare returned 2 sites AVAILABLE; recover returned baseline + 3 delays + 2 nearby options.
- Anonymous browser onboard cockpit: API OK / engine ready; geometry and delay labelled SYNTHETIC; energy action returned 0 Wh and CONSTRAINTS_BREACHED, UNVERIFIED_INPUTS.

## Changes
- Shared deployment-aware client URL resolver with exact public hostname; local same-origin retained. Studio, Lab, classic, onboard and MoonProof clients no longer depend on deployment fetch rewriting. Shell comparisons use exact-window preliminary backend data when complete, otherwise explicitly label static fallback and keep hourly static chart/export distinct.
- Proxy forwards POST /v1/visibility. Failed in-flight compare/recover requests are not permanently cached. Frontend deployment config metadata is read from the frontend, not the Go API.
- Backend visibility rejects omitted/null numeric inputs, preserves explicit zero, emits documented JSON error codes. Live pre-fix API accepted omitted/null Sun geometry with identical fingerprint.
- Fullstack matrix asserts coverage of every OpenAPI operation via Go directly and web proxy, expected disability of optional vector and non-proxied asset, malformed JSON tests; public CI verifies actual browser interactions and response origins.

## Release gate
Do not equate HTTP 200 with scientific validation. Current public source is not the latest main. This change requires final SHA CI, real Go/Rust integration, browser runs on release and reviewed deployment. Preserve team privacy and submission timing; no submission or publication was performed by this audit.
