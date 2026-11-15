# BRASPACE API Reference

**Public Base URL:** `https://braspace-api.srv1898743.hstgr.cloud` (same origin through the Worker: `https://braspace-moonproof.almeida-me.workers.dev`).

<!-- BEGIN GENERATED: scripts/gen-api-md.mjs from api/openapi.json — do not edit by hand -->

Spec: `BRASPACE API` `braspace.mission.v1` (OpenAPI 3.1.0). **22 operations.**

Lunar landing site comparison and launch-delay replanning (NASA Space Apps 2026). Visibility is geometric line of sight computed by the Rust engine from stored horizon and Sun/Earth series. Check `science_status`, `provenance` and `scientifically_validated` on every response; synthetic fixtures are not NASA data.

Every 4xx/5xx body is JSON with a stable `code` (see each operation). Science fields (`science_status`,
`scientifically_validated`, provenance) must be shown as they come: no response is flight-validated.

## Endpoints

| Method | Path | Summary | Statuses |
|---|---|---|---|
| `GET` | [`/api/health`](#get-api-health) | Service and engine status | 200, 503 |
| `GET` | [`/api/sites`](#get-api-sites) | Site catalog | 200 |
| `GET` | [`/api/sites/{id}`](#get-api-sites-id) | One site and its nearest catalog neighbours | 200, 404 |
| `POST` | [`/api/compare`](#post-api-compare) | Compare 1-3 sites over a time window | 200, 400, 404, 413, 415, 422, 500, 502, 503, 504 |
| `POST` | [`/api/scenarios/delay`](#post-api-scenarios-delay) | Recalculate a mission window after launch delays and at nearby sites | 200, 400, 404, 413, 415, 422, 500, 502, 503, 504 |
| `POST` | [`/api/onboard/site-evaluate`](#post-api-onboard-site-evaluate) | Run the onboard simulator (#70) on visibility computed from stored series, plus crew consumables | 200, 400, 404, 413, 415, 422, 500, 502, 503, 504 |
| `GET` | [`/api/layers`](#get-api-layers) | Optional lunar map layers with source, rights, attribution, coverage, resolution, frame and checksum | 200 |
| `GET` | [`/api/layers/{id}`](#get-api-layers-id) | One layer | 200, 404 |
| `GET` | [`/api/layers/{id}/asset`](#get-api-layers-id-asset) | Same-origin copy of a proxy layer, fetched only from its registered source_url and served only if size and SHA-256 match | 200, 404, 502 |
| `GET` | [`/api/sites/{id}/media`](#get-api-sites-id-media) | Gallery links related to a site | 200, 404 |
| `POST` | [`/api/onboard/site-report`](#post-api-onboard-site-report) | Printable mission report (#72) for the site-evaluate input, with crew consumables and the combined decision | 200, 400, 404, 413, 415, 422, 500, 502, 503, 504 |
| `POST` | [`/api/onboard/report`](#post-api-onboard-report) | Printable mission report for an onboard request (owned by #72) | 200, 400, 413, 415, 422 |
| `POST` | [`/api/onboard/navigation`](#post-api-onboard-navigation) | Synthetic lunar GNSS geometry for one site over a time window (premises are assumptions, not a validated navigation model) | 200, 400, 413, 415, 422 |
| `POST` | [`/api/onboard/evaluate`](#post-api-onboard-evaluate) | Onboard simulator v1 with caller-supplied visibility booleans (owned by #70) | 200, 400, 413, 415, 422 |
| `GET` | [`/api/openapi.json`](#get-api-openapi-json) | This document | 200 |
| `GET` | [`/healthz`](#get-healthz) | Liveness | 200 |
| `GET` | [`/readyz`](#get-readyz) | Readiness (engine binary present) | 200, 503 |
| `GET` | [`/v1/capabilities`](#get-v1-capabilities) | Implemented vs. missing physics | 200 |
| `POST` | [`/v1/visibility`](#post-v1-visibility) | Single-epoch visibility from caller-supplied angles (bootstrap contract) | 200, 400, 413, 415, 422, 499, 502, 503, 504 |
| `GET` | [`/api/sites/{id}/sky`](#get-api-sites-id-sky) | Terrain horizon and Sun/Earth azimuth/elevation for one site (stored series values, read-only, never interpolated) | 200, 404, 422, 503 |
| `GET` | [`/api/vector/status`](#get-api-vector-status) | Optional metadata-only vector index state; only state=index_ready (current audited ingest manifest) serves search | 200 |
| `POST` | [`/api/vector/search`](#post-api-vector-search) | Optional cosine-nearest source metadata (NOT lunar physics); 384D client-supplied vector from a pinned model | 200, 400, 413, 415, 422, 503 |

### GET /api/health

Service and engine status

operationId: `getHealth`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `Health` | OK |
| 503 | `application/json` `Health` | Engine unavailable |

### GET /api/sites

Site catalog

operationId: `listSites`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `SiteList` | OK |

### GET /api/sites/{id}

One site and its nearest catalog neighbours

operationId: `getSite`

| Parameter | In | Required | Schema | Description |
|---|---|---|---|---|
| `id` | path | yes | string, `^[a-z0-9][a-z0-9-]{0,63}$` |  |

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `SiteDetail` | OK |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) |

### POST /api/compare

Compare 1-3 sites over a time window

operationId: `compareSites`

Request body (required): `application/json` `CompareRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `CompareResponse` | OK |
| 400 | `application/json` `Error` | Malformed JSON, unknown field or trailing data (INVALID_JSON) |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) |
| 413 | `application/json` `Error` | Body above 128 KiB (REQUEST_TOO_LARGE) |
| 415 | `application/json` `Error` | Content-Type must be application/json |
| 422 | `application/json` `Error` | Validation or data availability error; see `code` |
| 500 | `application/json` `Error` | Unexpected server error (INTERNAL) |
| 502 | `application/json` `Error` | Engine failed or returned an invalid contract (ENGINE_ERROR) |
| 503 | `application/json` `Error` | Engine binary unavailable (ENGINE_UNAVAILABLE) |
| 504 | `application/json` `Error` | Engine call exceeded 2 s or request exceeded 20 s (ENGINE_TIMEOUT) |

### POST /api/scenarios/delay

Recalculate a mission window after launch delays and at nearby sites

operationId: `delayScenario`

Request body (required): `application/json` `DelayScenarioRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `DelayScenarioResponse` | OK |
| 400 | `application/json` `Error` | Malformed JSON, unknown field or trailing data (INVALID_JSON) |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) |
| 413 | `application/json` `Error` | Body above 128 KiB (REQUEST_TOO_LARGE) |
| 415 | `application/json` `Error` | Content-Type must be application/json |
| 422 | `application/json` `Error` | Validation or data availability error; see `code` |
| 500 | `application/json` `Error` | Unexpected server error (INTERNAL) |
| 502 | `application/json` `Error` | Engine failed or returned an invalid contract (ENGINE_ERROR) |
| 503 | `application/json` `Error` | Engine binary unavailable (ENGINE_UNAVAILABLE) |
| 504 | `application/json` `Error` | Engine call exceeded 2 s or request exceeded 20 s (ENGINE_TIMEOUT) |

### POST /api/onboard/site-evaluate

Run the onboard simulator (#70) on visibility computed from stored series, plus crew consumables

operationId: `siteOnboardEvaluate`

Request body (required): `application/json` `SiteOnboardRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `SiteOnboardResponse` | OK |
| 400 | `application/json` `Error` | Malformed JSON, unknown field or trailing data (INVALID_JSON) |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) |
| 413 | `application/json` `Error` | Body above 128 KiB (REQUEST_TOO_LARGE) |
| 415 | `application/json` `Error` | Content-Type must be application/json |
| 422 | `application/json` `Error` | Validation or data availability error; see `code` |
| 500 | `application/json` `Error` | Unexpected server error (INTERNAL) |
| 502 | `application/json` `Error` | Engine failed or returned an invalid contract (ENGINE_ERROR) |
| 503 | `application/json` `Error` | Engine binary unavailable (ENGINE_UNAVAILABLE) |
| 504 | `application/json` `Error` | Engine call exceeded 2 s or request exceeded 20 s (ENGINE_TIMEOUT) |

### GET /api/layers

Optional lunar map layers with source, rights, attribution, coverage, resolution, frame and checksum

operationId: `listLayers`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |

### GET /api/layers/{id}

One layer

operationId: `getLayer`

| Parameter | In | Required | Schema | Description |
|---|---|---|---|---|
| `id` | path | yes | string |  |

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |
| 404 | `application/json` `Error` | Unknown layer (LAYER_NOT_FOUND) |

### GET /api/layers/{id}/asset

Same-origin copy of a proxy layer, fetched only from its registered source_url and served only if size and SHA-256 match

operationId: `getLayerAsset`

| Parameter | In | Required | Schema | Description |
|---|---|---|---|---|
| `id` | path | yes | string |  |

| Status | Content | Meaning |
|---|---|---|
| 200 | `image/jpeg` —, `model/gltf-binary` — | Image bytes (image/jpeg) or a 3D model (model/gltf-binary, streamed from a verified disk cache; supports Range and If-None-Match) |
| 404 | `application/json` `Error` | Unknown or non-proxied layer (LAYER_NOT_FOUND, LAYER_NOT_PROXIED) |
| 502 | `application/json` `Error` | Source unreachable or checksum mismatch (LAYER_UNAVAILABLE); render the fallback |

### GET /api/sites/{id}/media

Gallery links related to a site

operationId: `getSiteMedia`

| Parameter | In | Required | Schema | Description |
|---|---|---|---|---|
| `id` | path | yes | string |  |

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) |

### POST /api/onboard/site-report

Printable mission report (#72) for the site-evaluate input, with crew consumables and the combined decision

operationId: `siteOnboardReport`

Request body (required): `application/json` `SiteOnboardRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `text/html` — | Standalone print-friendly HTML (Print → Save as PDF) |
| 400 | `application/json` `Error` | Malformed JSON, unknown field or trailing data (INVALID_JSON) |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) |
| 413 | `application/json` `Error` | Body above 128 KiB (REQUEST_TOO_LARGE) |
| 415 | `application/json` `Error` | Content-Type must be application/json |
| 422 | `application/json` `Error` | Validation or data availability error; see `code` |
| 500 | `application/json` `Error` | Unexpected server error (INTERNAL) |
| 502 | `application/json` `Error` | Engine failed or returned an invalid contract (ENGINE_ERROR) |
| 503 | `application/json` `Error` | Engine binary unavailable (ENGINE_UNAVAILABLE) |
| 504 | `application/json` `Error` | Engine call exceeded 2 s or request exceeded 20 s (ENGINE_TIMEOUT) |

### POST /api/onboard/report

Printable mission report for an onboard request (owned by #72)

operationId: `onboardReport`

Request body (required): `application/json` `StandaloneOnboardRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `text/html` — | HTML |
| 400 | — | Invalid JSON |
| 413 | — | Too large |
| 415 | — | Content-Type |
| 422 | — | Invalid scenario |

### POST /api/onboard/navigation

Synthetic lunar GNSS geometry for one site over a time window (premises are assumptions, not a validated navigation model)

operationId: `onboardNavigation`

Request body (required): `application/json` `object`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK: version, model_status, premises, summary, outages, samples |
| 400 | — | Invalid JSON |
| 413 | — | Too large |
| 415 | — | Content-Type |
| 422 | — | Invalid request |

### POST /api/onboard/evaluate

Onboard simulator v1 with caller-supplied visibility booleans (owned by #70)

operationId: `onboardEvaluate`

Request body (required): `application/json` `StandaloneOnboardRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |
| 400 | — | Invalid JSON |
| 413 | — | Too large |
| 415 | — | Content-Type |
| 422 | — | Invalid scenario |

### GET /api/openapi.json

This document

operationId: `getOpenAPI`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` — | OpenAPI 3.1 document |

### GET /healthz

Liveness

operationId: `healthz`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |

### GET /readyz

Readiness (engine binary present)

operationId: `readyz`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |
| 503 | `application/json` `object` | Engine unavailable |

### GET /v1/capabilities

Implemented vs. missing physics

operationId: `capabilities`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK |

### POST /v1/visibility

Single-epoch visibility from caller-supplied angles (bootstrap contract)

operationId: `visibility`

Request body (required): `application/json` `VisibilityRequest`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | OK. All required Rust output fields are explicit, non-null and exact-case. The evidence passport describes caller-supplied inputs; never VALIDATED. |
| 400 | `application/json` `Error` | Malformed JSON, unknown field or trailing data (INVALID_JSON) |
| 413 | `application/json` `Error` | Body above 128 KiB (REQUEST_TOO_LARGE) |
| 415 | `application/json` `Error` | Content-Type must be application/json |
| 422 | `application/json` `Error` | Invalid inputs (INVALID_VISIBILITY_INPUT); null or incomplete look angles and horizon samples are rejected, never read as zero |
| 499 | `application/json` `Error` | Client canceled request (REQUEST_CANCELED) |
| 502 | `application/json` `Error` | Engine failed or returned an invalid contract, including missing, null, duplicate, case-aliased or unknown fields (ENGINE_ERROR) |
| 503 | `application/json` `Error` | Engine unavailable (ENGINE_UNAVAILABLE) |
| 504 | `application/json` `Error` | Engine deadline exceeded (ENGINE_TIMEOUT) |

### GET /api/sites/{id}/sky

Terrain horizon and Sun/Earth azimuth/elevation for one site (stored series values, read-only, never interpolated)

operationId: `getSiteSky`

| Parameter | In | Required | Schema | Description |
|---|---|---|---|---|
| `id` | path | yes | string, `^[a-z0-9][a-z0-9-]{0,63}$` |  |
| `start` | query | no | string/date-time | RFC3339 UTC on the series grid; default is the series start |
| `hours` | query | no | number, ..720 | Window length in hours, default 24, max 720. Must be a whole multiple of the series step, otherwise 422 GRID_NOT_ALIGNED; it is never rounded. |
| `step` | query | no | integer, 60.. | Seconds between samples; whole multiple of the series step (default: series step). At most 1000 samples are returned. |

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `SiteSky` | OK |
| 404 | `application/json` `Error` | Unknown site (SITE_NOT_FOUND) or site without series (NO_SERIES_DATA) |
| 422 | `application/json` `Error` | INVALID_TIME, INVALID_DURATION, INVALID_STEP, GRID_NOT_ALIGNED, OUTSIDE_COVERAGE or WINDOW_TOO_LONG |
| 503 | `application/json` `Error` | ENGINE_UNAVAILABLE |

### GET /api/vector/status

Optional metadata-only vector index state; only state=index_ready (current audited ingest manifest) serves search

operationId: `getVectorStatus`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | JSON response |

### POST /api/vector/search

Optional cosine-nearest source metadata (NOT lunar physics); 384D client-supplied vector from a pinned model

operationId: `searchSourceMetadata`

Request body (required): `application/json` `object`

| Status | Content | Meaning |
|---|---|---|
| 200 | `application/json` `object` | JSON response |
| 400 | `application/json` `Error` | JSON response |
| 413 | `application/json` `Error` | JSON response |
| 415 | `application/json` `Error` | JSON response |
| 422 | `application/json` `Error` | JSON response |
| 503 | `application/json` `Error` | JSON response |

<!-- END GENERATED -->

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
