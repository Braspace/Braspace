# Cockpit ↔ backend contract (MoonProof E · Cockpit)

The cockpit (`web/moonproof/cockpit.html`, source `web/moonproof/screens/cockpit*.ts`) is the product's main panel.
This document lists **every backend call it makes**, which fields it reads, and how that is tested against the
real stack. Nothing here is scientific validation: series are `PRELIMINARY` or `SYNTHETIC`, and every computed
answer comes back as `UNVERIFIED_INPUTS`.

```
Browser (Preact TSX cockpit) ──same origin──▶ Cloudflare Worker (deploy/cloudflare, /api /v1 /healthz /readyz)
        ──▶ Go API (api/) ──▶ Rust engine (engine/, deterministic visibility)
                         ├──▶ PostgreSQL (catalog + stored hourly series, api/store_pg.go)
                         └──▶ pgvector (optional metadata retrieval, lexical-384; never decides physics)
```

## Calls made by the cockpit

| When | Request | Fields read by the cockpit | Off / error |
|---|---|---|---|
| boot (`core/data.ts apiOnline`) | `GET /readyz` | `status` | "offline · precomputed" badge, no simulated numbers |
| badges | `GET /v1/capabilities` | `scientifically_validated` (always `false`) | badge says N/D |
| next Sun/Earth transitions | `GET /api/sites/{id}/sky?start=<UTC>&hours=240` | `next_transitions.sun` | sites without series answer `404 NO_SERIES_DATA` and the screen shows N/D |
| energy run (`runScenario`) | `POST /api/onboard/site-evaluate` (`siteEvaluateBody`) | `onboard.options[0].timeline[].charge_wh`, `onboard.science_status`, `onboard.inputs_sha256`, `options[0].metrics.minimum_charge_wh`, `total_unserved_energy_wh`, `end_mode`, `simulation_status` | if the site has no stored series → fallback below |
| fallback for sites without series | `POST /api/onboard/evaluate` (`evaluateBody`, hourly booleans from the browser's stored series) | `options[0].timeline`, `science_status`, `inputs_sha256` | no answer → `{ok:false}`, never an invented charge |
| crew (O₂ / food) | `POST /api/onboard/site-evaluate` (`crewRequest`) | `candidates[0].consumables.items[]`, `combined_decision` | values stay `null`, never 0 |
| sensitivity ±20 % | 4 × `site-evaluate` (`sensitivityVariants`) | `readEnergy` | per-variant N/D |
| "Relatório" | `POST /api/onboard/site-report` (same body as the last run) | `text/html` (no scripts) | button re-enabled, error shown |

Error envelope: every 4xx is JSON with a stable `error.code` (`SITE_NOT_FOUND`, `NO_SERIES_DATA`,
`INVALID_DURATION`, `INVALID_SCENARIO`, `INVALID_VECTOR`, …). The cockpit never parses HTML as an API answer.

## Invariants checked

1. Catalogue: 16 sites, ids `^[a-z0-9][a-z0-9-]{0,63}$`; the 7 with stored series carry an hourly window, a
   `series_sha256` and `PRELIMINARY`/`SYNTHETIC`. The other 9 are N/D and are **never** synthesized.
2. A site with a stored series is computed **server side** (`route: "site"`); a site without one goes through
   `evaluate` (`route: "eval"`). Both return a charge trace of `hours + 1` finite points inside `[0, capacity]`.
3. Determinism: the same body gives the same `inputs_sha256` and timeline; changing `load_w` changes the fingerprint.
4. Physics sanity: less battery cannot raise the minimum charge.
5. Negatives: unknown site 404, duration over the limit 422, negative battery 422, non-boolean sample 4xx — all JSON, never 5xx.
6. pgvector: `lexical-384` (`braspace-lexical-384-v1`), `scientifically_validated:false`; 384D search returns ≤ limit with
   scores; 383D and zero vectors are `422 INVALID_VECTOR`. The cockpit keeps working with vector disabled.

## How to run

```bash
# against any stack (local compose, staging, production — POSTs are pure computations, no ingestion)
BRASPACE_COCKPIT_API=http://127.0.0.1:8080 node scripts/cockpit-backend-contract.mjs
# through the same-origin Worker
BRASPACE_COCKPIT_API=https://braspace-moonproof.almeida-me.workers.dev node scripts/cockpit-backend-contract.mjs
```

Production sits behind Traefik `ratelimit` (average 20 req/s, burst 40, per client IP) and a full run is ~60 requests:
use `BRASPACE_COCKPIT_PACE_MS=150` there. A 429 makes the run exit 2 (`RATE_LIMITED`, inconclusive), never 1.
After a backend deploy, add `BRASPACE_EXPECT_COMMIT=<sha>`: `/healthz` must report that exact commit (an image built
without `BRASPACE_GIT_SHA` reports `unknown`).

`scripts/ci-local.sh` runs it after `compose up` (step "cockpit ↔ Go/Rust/Postgres contract"). Lane owners: `docs/harness/OWNERS.md`.

## Evidence (15/11/2026)

| Target | Build | Result |
|---|---|---|
| local compose Go + Rust + Postgres 16 + pgvector (EXO-X1) | `62bf446` | 49/49 PASS |
| production API `braspace-api.srv1898743.hstgr.cloud` (Origin Pages) | `62bf446` | 49/49 PASS |
| production Worker `braspace-moonproof.almeida-me.workers.dev` (same origin) | `62bf446` | 49/49 PASS |

Observed values worth knowing (engineering, not flight): with the cockpit's H1 profile, 14 days starting 30 days
after the series start, `malapert-massif`, `nobile-rim-1`, `mons-mouton-im2` and both synthetic sites reach 0 Wh at
some hour; `peak-near-shackleton` keeps 18 000 Wh. Sites without series fall back to browser booleans and show
15 200 Wh minimum: that number is a property of the browser's declared pattern, not of the site.
