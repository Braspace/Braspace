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
- Upstream pinned; `redirect: "error"`; no Cookie, Authorization, Origin or client-IP headers forwarded.
- POST bodies: `application/json` only, ≤ 128 KiB (Go's bound), must be a JSON object; no query string.
- Go status codes and error bodies pass through unchanged (a 422 stays a 422).
- Non-JSON upstream → 502 `INVALID_UPSTREAM_RESPONSE` (except `/api/layers/{id}/asset`, which may be an image).
- Network failure → 502 `API_UNAVAILABLE`; timeout (24 s) → 504 `API_TIMEOUT`. Never a fake success.
- Unknown API path → 404 `ROUTE_NOT_FOUND`; wrong method → 405 with `Allow`; no CORS headers emitted.

Run: `node --test deploy/cloudflare/moonproof-worker.test.mjs` (also a step in `scripts/ci-local.sh`).

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
