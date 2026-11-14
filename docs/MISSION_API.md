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

## Errors

JSON `{"error": "...", "code": "..."}`.

| Status | Codes |
|---|---|
| 400 | `INVALID_JSON` (unknown field, trailing data) |
| 404 | `SITE_NOT_FOUND` |
| 405 | wrong method |
| 413 | `REQUEST_TOO_LARGE` (> 128 KiB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `INVALID_TIME`, `INVALID_DURATION`, `INVALID_SITES`, `INVALID_DELAYS`, `INVALID_CONSTRAINT`, `CONSTRAINTS_REQUIRED`, `DATA_NOT_AVAILABLE`, `OUTSIDE_COVERAGE`, `OBSERVER_HEIGHT_UNAVAILABLE` |
| 500 | `INTERNAL` |
| 502 | `ENGINE_ERROR` (non-zero exit or invalid output) |
| 503 | `ENGINE_UNAVAILABLE` |
| 504 | `ENGINE_TIMEOUT` (2 s per call, 20 s per request) |

## Series data contract (for the science pipeline)

One JSON file per site under `api/sitedata/series/`, referenced by `series_file` in
`catalog.json`. The loader rejects the whole data set at startup if any file is invalid.

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

`science_status`: `SYNTHETIC` (fixtures), `UNVERIFIED` (real inputs, not yet checked
against references) or `VALIDATED` (reference checks in BS-017 passed).
`scientifically_validated` in responses is true only when both the data and the engine
report `VALIDATED`.

The `synthetic-demo-*` files are generated by `go run ./cmd/synthseries` and are not
NASA data or lunar locations.

## PostgreSQL (BS-020)

Schema: `api/db/migrations/001_init.sql` (`sites`, `site_nearby`, `site_series`,
`horizon_samples`, `ephemeris_samples`, `source_manifest`, `ingest_runs`). Range and
format checks live in the schema too (site id pattern, `MOON_ME` frame, angle bounds,
`science_status` enum, SHA-256 format).

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
