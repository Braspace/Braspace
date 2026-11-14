# BRASPACE — Lunar Landing Site Navigator (MoonProof)

**NASA Space Apps Challenge 2026** | [Portuguese version (`README.pt-BR.md`)](README.pt-BR.md)

BRASPACE / MoonProof is an educational and engineering prototype for evaluating lunar south pole landing sites, Sun/Earth visibility windows, terrain horizon masking, and crew/consumables mission planning.

---

## Live Demo & API

Verified on **2026-11-14** (`HTTP 200`):

- **Web App (GitHub Pages):** https://braspace.github.io/
  - Polar Lab: https://braspace.github.io/lab.html
  - Onboard Mission Computer: https://braspace.github.io/onboard/cockpit.html
  - Polar Elevation Map Demo: https://braspace.github.io/polar-map-demo.html
- **Public API:** https://braspace-api.srv1898743.hstgr.cloud
  - Health: https://braspace-api.srv1898743.hstgr.cloud/api/health
  - Readiness: https://braspace-api.srv1898743.hstgr.cloud/readyz
  - Capabilities: https://braspace-api.srv1898743.hstgr.cloud/v1/capabilities
  - Site Catalog: https://braspace-api.srv1898743.hstgr.cloud/api/sites

> **Scientific honesty:** `/readyz` reports `"science_status": "UNVERIFIED_INPUTS"` and `/v1/capabilities` reports `"scientifically_validated": false`.

---

## Real Data vs. Simulation

| NASA / External Source | Product in Repo | Status | Notes |
|---|---|---|---|
| **NASA LOLA (`LDEM_80S_80M`) + NAIF SPICE** | `api/sitedata/series/{connecting-ridge,malapert-massif,mons-mouton-im2,nobile-rim-1,peak-near-shackleton}.json` & `web/data/sites/*`, `web/data/terrain/*` | **PRELIMINARY** (not flight-validated) | Offline pipeline (`science/`) computes terrain horizon and Sun/Earth angles. |
| **Synthetic demo series** | `api/sitedata/series/synthetic-demo-{a,b}.json` | **SYNTHETIC** | Labelled synthetic time series for end-to-end testing and UI demos. |
| **Onboard consumables / battery** | `api/onboard/` & `web/onboard/` | **SIMULATION** | Educational mission computer model; not flight-certified. |
| **NASA PGDA & JPL Horizons** | `web/data/validation/validation_{pgda,horizons}.json` | **BENCHMARK** | Reference comparison datasets for offline science checks. |
| **NASA LROC / SVS** | `web/data/moon/lroc_color_2k.jpg` & layer proxy | **VISUAL ASSET** | See [`docs/ASSET_LICENSE_MATRIX.md`](docs/ASSET_LICENSE_MATRIX.md). |

---

## Architecture

```mermaid
flowchart LR
    Browser["Static Web App<br/>(web/, GitHub Pages)"] -->|HTTPS JSON| API["Go API Server<br/>(api/, :8080)"]
    API -->|stdin/stdout JSON| Engine["Rust Visibility Engine<br/>(engine/, braspace-lunar-engine)"]
    API -->|SQL| DB[("PostgreSQL 16 + pgvector<br/>(compose.db.yaml)")]
    Science["Python Science Pipeline<br/>(science/, LOLA + SPICE)"] -.->|generates offline JSON/BIN| API
    Science -.->|generates offline JSON/BIN| Browser
```

---

## Running Locally

### Quick Start (API + Rust Engine)

```bash
cp .env.example .env
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/health
```

- **Default port:** `127.0.0.1:${BRASPACE_PORT:-8080}:8080`
- **With PostgreSQL:** `docker compose -f compose.yaml -f compose.db.yaml up -d --build`
- **With optional pgvector metadata search:** `docker compose -f compose.yaml -f compose.db.yaml -f compose.vector.yaml up -d --build`
- **Environment variables (by name):** `BRASPACE_PORT`, `CORS_ALLOWED_ORIGINS`, `POSTGRES_PASSWORD` (see [`.env.example`](.env.example) and [`docs/DEPLOY.md`](docs/DEPLOY.md)).

---

## Testing

All suites verified against `main` (`0e646c3c50ad665c34013415809e951e489a3b0f`):

| Suite | Command | Result |
|---|---|---|
| **Web (Node test runner)** | `npm --prefix web test` | 93 passed, 0 failed |
| **Onboard Cockpit** | `node --test web/onboard/test/*.mjs` | 49 passed, 0 failed, 1 skipped |
| **Go API** | `cd api && go test ./...` | `api` & `api/onboard` pass |
| **Rust Engine** | `cd engine && cargo test` | 3 unit + 6 integration passed |
| **Python Science** | `python3 -m unittest discover -s science/tests` | 21 tests OK |
| **Python Root** | `python3 -m unittest discover -s tests` | 9 tests OK |

See [`docs/TESTING.md`](docs/TESTING.md) for details.

---

## Repository Structure

| Path | Purpose |
|---|---|
| `api/` | Go HTTP API server (`braspace.mission.v1`), OpenAPI spec (`api/openapi.json`), site catalog & series (`api/sitedata/`). |
| `engine/` | Rust deterministic visibility engine (`braspace-lunar-engine`). |
| `web/` | Static frontend, Polar Lab (`lab.html`), Onboard Cockpit (`onboard/cockpit.html`), polar map demo (`polar-map-demo.html`), and precomputed data (`web/data/`). |
| `science/` | Python offline pipeline for NASA LOLA DEMs, NAIF SPICE kernels, and PGDA/Horizons benchmarks. |
| `docs/` | Architecture, API reference, data provenance, testing, deploy, and team documentation ([`docs/README.md`](docs/README.md)). |
| `scripts/` | Audit, smoke-test (`smoke-publico.sh`), and verification scripts. |
| `tests/` | Repository-level Python unit tests. |
| `compose*.yaml` | Docker Compose definitions for API, PostgreSQL, and optional pgvector. |

---

## Team & Roles

From [`docs/TEAM_ROLES_AND_HANDOFFS_2026.md`](docs/TEAM_ROLES_AND_HANDOFFS_2026.md):

- **Gustavo** — Integration, Infrastructure & Release
- **Gabriel Maccachero** — Data & NASA Sources
- **Gabriel Freire** — Backend API & Database
- **Joel** — Rust Engine & Scientific Calculations
- **Heloísa** — UX/UI & Frontend
- **João Victor** — QA & Onboard Mission Computer

---

## License & NASA Credits

- Code: [MIT License](LICENSE) (`Copyright (c) 2026 Braspace`).
- NASA & external assets: see [`docs/ASSET_LICENSE_MATRIX.md`](docs/ASSET_LICENSE_MATRIX.md) and [`docs/ATTRIBUTION_AND_LICENSES.md`](docs/ATTRIBUTION_AND_LICENSES.md).

---

## Honest Limitations

- **Not flight-certified:** `/readyz` reports `UNVERIFIED_INPUTS` and `/v1/capabilities` reports `scientifically_validated: false`.
- **Partial series coverage:** `/api/health` reports `16` catalog sites, of which `7` have stored time series (`5` `PRELIMINARY`, `2` `SYNTHETIC`); the remaining `9` sites have no stored visibility series yet.
- **Offline science pipeline:** LOLA + SPICE computations run offline in `science/` and are loaded as static JSON/BIN artifacts rather than computed dynamically per HTTP request.
