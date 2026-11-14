# Mission API (BS-019 / BS-020 / BS-023 / BS-039 / BS-044)

Go endpoints for the site catalog, multi-site comparison and launch-delay replanning.
All geometry still runs in the Rust engine (`POST /v1/visibility` contract); the Go
layer selects stored inputs, calls the engine once per time step, and aggregates.

Run locally:

```sh
cargo build --manifest-path engine/Cargo.toml
cd api && RUST_ENGINE_BIN=../engine/target/debug/braspace-lunar-engine go run .
```

| Variable | Default | Purpose |
|---|---|---|
| `RUST_ENGINE_BIN` | `./bin/lunar-engine` | Rust CLI path |
| `LISTEN_ADDR` | `:8080` | HTTP address |
| `DATABASE_URL` | unset | PostgreSQL URL; when set, the catalog and series are loaded from the database at startup |
| `SITE_DATA_DIR` | embedded `api/sitedata` | Directory with `catalog.json` and series files (used when `DATABASE_URL` is unset) |
| `CORS_ALLOWED_ORIGINS` | empty (no cross-origin) | Comma-separated exact origins, e.g. `http://localhost:5173`. `*` is ignored. |

The OpenAPI 3.1 document is `api/openapi.json`, also served at `GET /api/openapi.json`.
Example requests and their exact expected responses live in `examples/mission/`;
`./examples/mission/replay.sh http://127.0.0.1:8080` replays them against a running
server (CI does this against the real Rust engine).

## Endpoints

### `GET /api/health`
`200` when the engine binary is present, `503` (`"engine":"unavailable"`) otherwise.
Also reports how many sites have series data and their `science_status`.

### `GET /api/sites` · `GET /api/sites/{id}`
13 Artemis III candidate regions with source feature-center coordinates
(NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, transcribed in BS-005),
plus two `synthetic-demo-*` fixtures. `{id}` adds the 5 nearest sites by
great-circle distance on a 1737.4 km sphere. A site has a `series` block only when
horizon/ephemeris data was ingested for it.

### `POST /api/compare`

```sh
curl -s localhost:8080/api/compare -H 'Content-Type: application/json' -d '{
  "site_ids": ["synthetic-demo-a", "synthetic-demo-b", "malapert-massif"],
  "start_utc": "2026-12-01T00:00:00Z",
  "duration_hours": 72,
  "include_series": false
}'
```

Per site: `data_status` (`AVAILABLE`, `NO_SERIES_DATA`, `OUTSIDE_COVERAGE`), and when
available `metrics` (sun / earth / simultaneous visible fraction, longest continuous
dark and comm-gap hours, minimum margins in degrees), visibility windows, optional
hourly series, `science_status` of the stored data, `engine_science_status` and
provenance. Sites without data get no numbers.

### `POST /api/scenarios/delay`

```sh
curl -s localhost:8080/api/scenarios/delay -H 'Content-Type: application/json' -d '{
  "site_id": "synthetic-demo-a",
  "start_utc": "2026-12-01T00:00:00Z",
  "duration_hours": 72,
  "delays_hours": [24, 48, 72],
  "constraints": { "max_continuous_dark_hours": 20, "min_earth_fraction": 0.5 },
  "include_nearby": true,
  "max_nearby": 2
}'
```

Evaluates the baseline, each delay, and up to `max_nearby` nearest sites that have
data. Each option lists every declared constraint with `limit`, `value`,
`baseline_value`, `unit` and `margin` (negative = breached by that amount).
`outcome.status` is `BASELINE_ADMISSIBLE`, `ALTERNATIVE_FOUND` or
`NO_ADMISSIBLE_ALTERNATIVE`; in the last case nothing is proposed.

Constraints are caller assumptions (battery autonomy, comms requirement); the API has
no default thresholds. `observer_height_m` is accepted only if it matches the height
the stored horizon was computed for.

Same request ⇒ byte-identical response (`request_sha256` / `scenario_sha256`).

### `POST /api/onboard/site-evaluate` (#64, #69)

Adapter to the onboard simulator from #70. Instead of typed-in booleans, each
candidate (site + delay) gets its Sun/Earth visibility from the stored series via the
Rust engine, and the result goes unchanged into `onboard.Evaluate` (battery, energy
loss, comms blackout risks are Gustavo's model, not reimplemented here). Provenance
and `science_status` travel with every candidate; `onboard.source_claim_unverified`
names the terrain/ephemeris IDs.

Rejected instead of filled in: a site without series (`DATA_NOT_AVAILABLE`), a window
past the data (`OUTSIDE_COVERAGE`), more than 480 steps (`WINDOW_TOO_LONG`), candidates
on different time steps (`GRID_MISMATCH`).

Optional `crew` adds oxygen and food: autonomy, depletion time and margin at the end
of the window, with `CRITICAL` / `HIGH` risks in the same shape as the onboard ones.
`aboard_during_delay: true` means the crew consumes while waiting out a delay. Rates are
inputs and `rate_source` is mandatory; the examples use 0.84 kg O2 and 1.76 kg food per
person per day as placeholders to be checked against NASA BVAD (NASA/TP-2015-218570).
Without `crew`, consumables are reported as `UNKNOWN`. If the stock runs out while the crew waits out a delay, the item is `DEPLETED_DURING_DELAY` with the actual depletion time.

`combined_decision` picks the first candidate (request order) where energy, comms and
consumables all hold; the onboard simulator's own decision only weighs energy and comms.

### `POST /api/onboard/site-report`

Same input as `site-evaluate`, returns the printable mission report from #72 as HTML
(Print → Save as PDF) with an extra section: visibility source, combined decision,
consumption rate source and, per candidate, the oxygen/food table and risks. The plain
`/api/onboard/report` is unchanged. The MoonProof UI uses this report after a
computed-series run.

### Resources in `POST /api/scenarios/delay` (#69)

`crew`, and `power` + `max_comm_blackout_hours`, are optional on the delay replan.
Each option then also reports `consumables` and an `onboard` summary, and its checks
include `oxygen_margin_hours`, `food_margin_hours`, `min_battery_charge_wh`,
`unserved_energy_wh` and `longest_earth_obstruction_hours`, each with its baseline value.
That is how a delay that fixes the energy budget but runs the oxygen down shows up. Nearby sites whose series was computed for a different observer height are listed as `OBSERVER_HEIGHT_MISMATCH` and never compared.
`examples/mission/scenario-delay-resources.*` has a full case.

### Map layers and site media (#57)

- `GET /api/layers`, `GET /api/layers/{id}`: optional lunar layers with source page
  and URL, rights, attribution, coverage, resolution, projection/frame, size and SHA-256.
  Entries are copied from `data/ASSET_REGISTRY.json` and `data/manifest.json`, and a
  test fails if they drift. `scientific_role` is `visualization_only` or
  `science_source`; visual layers never feed calculations.
- `GET /api/layers/{id}/asset`: same-origin copy for `delivery: "proxy"` layers (today
  only the NASA SVS LROC 2k texture used by the 3D globe, which browsers block
  cross-origin). The API fetches only the registered `source_url` on an allowlisted
  host, checks size and SHA-256 before serving, and caches the bytes in memory. It
  never takes a URL from the request. If the source is down or the checksum differs,
  you get `502 LAYER_UNAVAILABLE` and the UI keeps its procedural fallback. The LOLA
  science DEM is `external` and is never served.
- `GET /api/sites/{id}/media`: LROC gallery links (`data/LUNAR_GALLERY.json`) related to
  a site. Links only; no image is copied, per the gallery's thumbnail policy.

## Errors

JSON `{"error": "...", "code": "..."}`.

| Status | Codes |
|---|---|
| 400 | `INVALID_JSON` (unknown field, trailing data) |
| 404 | `SITE_NOT_FOUND` |
| 405 | wrong method |
| 413 | `REQUEST_TOO_LARGE` (> 128 KiB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `INVALID_TIME`, `INVALID_DURATION`, `INVALID_SITES`, `INVALID_DELAYS`, `INVALID_CONSTRAINT`, `CONSTRAINTS_REQUIRED`, `DATA_NOT_AVAILABLE`, `OUTSIDE_COVERAGE`, `OBSERVER_HEIGHT_UNAVAILABLE`, `INVALID_CREW`, `INVALID_POWER`, `INVALID_MISSION`, `INVALID_CANDIDATES`, `GRID_MISMATCH`, `GRID_UNSUPPORTED`, `WINDOW_TOO_LONG`, `INVALID_SCENARIO`, `GRID_NOT_ALIGNED`, `TOO_MANY_EVALUATIONS` (more than 4000 uncached engine evaluations in one request) |
| 499 | `REQUEST_CANCELED` (client went away) |
| 500 | `INTERNAL` |
| 502 | `ENGINE_ERROR` (non-zero exit or invalid output) |
| 503 | `ENGINE_UNAVAILABLE` |
| 504 | `ENGINE_TIMEOUT` (2 s per call, 20 s per request) |

Engine subprocesses are capped globally (2 × CPU, at most 16 at once) so concurrent requests queue instead of multiplying processes.

## Series data contract (for the science pipeline)

One JSON file per site under `api/sitedata/series/`, referenced by `series_file` in
`catalog.json` together with `series_sha256`, the SHA-256 of the file's exact bytes
(`shasum -a 256 api/sitedata/series/<file>`). The loader rejects the whole data set at
startup if any file is invalid or does not match its hash, so an edited angle, a removed
sample (which would shift every later epoch) or a truncated file never reaches the API.
The server then exits with a one-line `site data rejected, not starting: …` message.

```json
{
  "schema": "braspace.site-series.v1",
  "site_id": "malapert-massif",
  "science_status": "UNVERIFIED",
  "provenance": {
    "terrain_dataset_id": "LRO-L-LOLA-4-GDR-V1.0/LDEM_80S_80M V2.0",
    "terrain_sha256": "e6591eee...",
    "ephemeris_id": "<kernel set id>",
    "frame": "MOON_ME",
    "generator": "<tool and version>"
  },
  "observer_height_m": 2,
  "terrain_horizon": [{"azimuth_deg": 0, "elevation_deg": 1.2}, "... strictly increasing, 2..1440 samples"],
  "start_utc": "2026-11-01T00:00:00Z",
  "step_seconds": 3600,
  "samples": [{"sun": {"azimuth_deg": 0, "elevation_deg": 0.6}, "earth": {"azimuth_deg": 0, "elevation_deg": 1.5}}]
}
```

`science_status`: `SYNTHETIC` (fixtures), `PRELIMINARY` (derived from NASA LOLA + SPICE by science/export_api_series.py, not independently validated), `UNVERIFIED` (real inputs, not yet checked
against references). `VALIDATED` is reserved: the loader and the database (migration 003)
both refuse it until independent benchmark evidence can be stored with the series, so
`scientifically_validated` is currently always false.

The `synthetic-demo-*` files are generated by `go run ./cmd/synthseries` and are not
NASA data or lunar locations.

## PostgreSQL (BS-020)

Schema: `api/db/migrations/` (001 creates `sites`, `site_nearby`, `site_series`,
`horizon_samples`, `ephemeris_samples`, `source_manifest`, `ingest_runs`). Range and
format checks live in the schema too (site id pattern, `MOON_ME` frame, angle bounds,
`science_status` enum without `VALIDATED`, SHA-256 format).

```sh
export DATABASE_URL='postgres://braspace:<password>@localhost:5432/braspace?sslmode=disable'
cd api
go run . ingest -manifest ../data/manifest.json   # migrate + load catalog, series, NASA manifest
go run . verify -manifest ../data/manifest.json   # exit 1 if anything differs
go run .                                          # serves from PostgreSQL (/api/health: data_source=postgres)
```

- `ingest` validates everything with the same rules as the API before touching the
  database, then replaces the rows in one transaction (an invalid file changes nothing).
- Each series row stores the source file SHA-256 and a SHA-256 of its canonical content.
  On load the API reassembles the series, rejects index/epoch gaps and recomputes the
  content hash, so an edited value or missing row stops startup instead of being served.
- `verify` compares the database with the source files and the NASA manifest checksum
  (`LDEM_80S_80M.IMG`, `e6591eee…` from BS-003).
- All queries are parameterised; the URL is only read from the environment and never logged.

Docker: `cp .env.example .env`, set `POSTGRES_PASSWORD` (`openssl rand -hex 16`), then
`docker compose -f compose.yaml -f compose.db.yaml up --build`. The database has no
host port; a one-shot `ingest` service loads the data before the API starts.

## Tests

```sh
cd api && go test -race ./...
TEST_DATABASE_URL=postgres://... go test -race ./...   # adds the PostgreSQL suite (disposable DB)
```

`openapi_test.go` checks that every documented route is served, that GET responses
and all example requests/responses validate against the schemas, and that the examples
still produce byte-identical responses (`go test -run TestExamples -update` to refresh
after an intended change).

Covers 200/400/404/405/413/415/422/500/502/503/504, engine timeout, deterministic
replay, delayed recalculation, no-alternative outcome, missing data, CORS and data
loader rejections. When the Rust binary is built, a test checks that it and the test
engine produce identical comparison output.

## Not modelled

Sun disc width, refraction, eclipses, RF link budget, DSN scheduling. Durations have one
series-step resolution.


### Exact temporal grid and scientific integrity guardrails (2026-11-14)

All starts and durations must match the stored `step_seconds` grid exactly; no floor/ceil window rounding. A per-site comparison reports `data_status=GRID_NOT_ALIGNED` without metrics for off-grid input. Onboard adaptation and delay-planning baselines reject it with HTTP 422 `GRID_NOT_ALIGNED`. Source files with a self-declared `VALIDATED` label are rejected until independent SPICE/LOLA scientific validation attestation is implemented. Rust stdout must match the current `UNVERIFIED_INPUTS` protocol and returned site/epoch/angle margins and visibility must agree. These checks detect malformed software inputs; they do not replace NASA scientific verification.
