# BRASPACE API Reference

Generated from `api/openapi.json` (`BRASPACE API braspace.mission.v1`) on `main` (`0e646c3c50ad665c34013415809e951e489a3b0f`).

**Public Base URL:** `https://braspace-api.srv1898743.hstgr.cloud`

## Endpoints

| Method | Path | Parameters | Summary |
|---|---|---|---|
| `GET` | `/api/health` | — | Service and engine status |
| `GET` | `/api/sites` | — | Site catalog |
| `GET` | `/api/sites/{id}` | `id` (path) | One site and its nearest catalog neighbours |
| `POST` | `/api/compare` | — | Compare 1-3 sites over a time window |
| `POST` | `/api/scenarios/delay` | — | Recalculate a mission window after launch delays and at nearby sites |
| `POST` | `/api/onboard/site-evaluate` | — | Run the onboard simulator (#70) on visibility computed from stored series, plus crew consumables |
| `GET` | `/api/layers` | — | Optional lunar map layers with source, rights, attribution, coverage, resolution, frame and checksum |
| `GET` | `/api/layers/{id}` | `id` (path) | One layer |
| `GET` | `/api/layers/{id}/asset` | `id` (path) | Same-origin copy of a proxy layer, fetched only from its registered source_url and served only if size and SHA-256 match |
| `GET` | `/api/sites/{id}/media` | `id` (path) | Gallery links related to a site |
| `POST` | `/api/onboard/site-report` | — | Printable mission report (#72) for the site-evaluate input, with crew consumables and the combined decision |
| `POST` | `/api/onboard/report` | — | Printable mission report for an onboard request (owned by #72) |
| `POST` | `/api/onboard/evaluate` | — | Onboard simulator v1 with caller-supplied visibility booleans (owned by #70) |
| `GET` | `/api/openapi.json` | — | This document |
| `GET` | `/healthz` | — | Liveness |
| `GET` | `/readyz` | — | Readiness (engine binary present) |
| `GET` | `/v1/capabilities` | — | Implemented vs. missing physics |
| `POST` | `/v1/visibility` | — | Single-epoch visibility from caller-supplied angles (bootstrap contract) |
| `GET` | `/api/sites/{id}/sky` | `id` (path), `start` (query), `hours` (query), `step` (query) | Terrain horizon and Sun/Earth azimuth/elevation for one site (stored series values, read-only, never interpolated) |
| `GET` | `/api/vector/status` | — | Optional metadata-only vector capability and model configuration; default disabled |
| `POST` | `/api/vector/search` | — | Optional cosine-nearest source metadata (NOT lunar physics); 384D client-supplied vector from a pinned model |

## Live Response Examples (2026-11-14)

### `GET /api/health`
```bash
curl -sS https://braspace-api.srv1898743.hstgr.cloud/api/health
```
```json
{"api_version":"braspace.mission.v1","data_source":"postgres","engine":"ready","series_science_statuses":{"PRELIMINARY":5,"SYNTHETIC":2},"service":"braspace-api","sites":16,"sites_with_series":7,"status":"ok"}
```

### `GET /readyz`
```bash
curl -sS https://braspace-api.srv1898743.hstgr.cloud/readyz
```
```json
{"science_status":"UNVERIFIED_INPUTS","status":"ready"}
```

### `GET /v1/capabilities`
```bash
curl -sS https://braspace-api.srv1898743.hstgr.cloud/v1/capabilities
```
```json
{"caller_supplied_look_angles":true,"caller_supplied_terrain_horizon":true,"maximum_horizon_samples":1440,"naif_spice_loaded":false,"nasa_lola_loaded":false,"scientifically_validated":false,"version":"braspace.visibility.v1"}
```
