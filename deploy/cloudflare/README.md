# MoonProof Cloudflare Worker

The Worker at `braspace-moonproof.*.workers.dev` serves `web/` as static assets. On that host the
frontend resolves its API base to `""` (`web/api-base.ts`), so every screen calls `/api/*` on its
own origin.

## Problem (revalidated 2026-11-15 13:37 UTC)

| Request | Result |
| --- | --- |
| `GET  workers.dev/` | 200 |
| `GET  workers.dev/api/health`, `/api/sites`, `/healthz` | **404** (Worker only serves assets) |
| `GET  braspace-api…/api/health` | 200, `data_source: postgres`, `engine: ready` |
| `OPTIONS braspace-api…/api/sites` with `Origin: workers.dev` | **403** `CORS_FORBIDDEN` (correct: the Go API allows no wildcard) |

## Fix

`moonproof-worker.mjs` proxies **exactly** the routes in `api/openapi.json` to the pinned Go API and
falls through to `ASSETS` for everything else. Browser → Worker → Go → Postgres/Rust → Worker →
Browser, all same-origin; no CORS change on the API.

Guarantees (covered by `moonproof-worker.test.mjs`):

- Allowlist equals the OpenAPI paths; the test fails on drift either way.
- Upstream pinned; `redirect: "manual"` and any 3xx refused as 502 (workerd throws a TypeError for `"error"`: on 15/11 that made every `/api` call 502 `API_UNAVAILABLE`; covered by `moonproof-worker.workerd-redirect.test.mjs`); no Cookie, Authorization, Origin or client-IP headers forwarded.
- POST bodies: `application/json` only, ≤ 128 KiB (Go's bound), must be a JSON object; no query string.
- Go status codes and error bodies pass through unchanged (a 422 stays a 422).
- Per-route success media types mirror the OpenAPI (`image/jpeg`, `model/gltf-binary` for layer assets; `text/html` reports keep the upstream CSP). Anything else on a 2xx → 502 `INVALID_UPSTREAM_RESPONSE`.
- `text/plain` upstream errors keep their status as JSON (`UPSTREAM_ROUTE_NOT_FOUND` for 404, else `UPSTREAM_ERROR`).
- Network failure → 502 `API_UNAVAILABLE`; timeout (24 s) → 504 `API_TIMEOUT`. Never a fake success.
- Unknown API path → 404 `ROUTE_NOT_FOUND`; wrong method → 405 with `Allow`; no CORS headers emitted.

Run: `node --test deploy/cloudflare/*.test.mjs` (also a step in `scripts/ci-local.sh`).

## Deploy

The production Worker lives on a Cloudflare account outside this repository. Whoever owns it:

```bash
cd deploy/cloudflare && cp wrangler.toml.example wrangler.toml   # set `name` to the live Worker
npx wrangler deploy
```

If the live Worker already has its own entrypoint, import `handleAPI` and call it first:
`return (await handleAPI(request)) ?? existingRouter(request, env)`.

Smoke after deploy:

```bash
curl -s https://braspace-moonproof.almeida-me.workers.dev/api/health   # expect 200 + data_source
```

Rollback: redeploy the previous Worker version (`npx wrangler rollback`); the API is untouched.

## Stacked contract corrections

The updated parent 3326aad fixes GLB and legacy 404 normalization; all 11 parent checks are preserved/adapted. Six of eight differential probes still fail on that parent; the reconciled candidate passes 51/51 in Node with in-memory upstream and the pinned main OpenAPI spec. Reports receive a non-weakenable sandbox policy; single Range, conditional requests and 304 are retained. JSON byte forwarding preserves duplicate keys for Go, vector/navigation have 16 KiB limits, cross-site and unsupported queries are rejected. Retain parent structured legacy errors. Run all suites; test the actual Cloudflare runtime and existing config in staging before deployment. Do not copy the example over a live config. Save existing Worker version for rollback and confirm the correct Go SHA. No production or fullstack validation is implied.
