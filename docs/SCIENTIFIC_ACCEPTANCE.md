# Scientific evidence gates: built vs validated vs published

**Status reviewed 2026-11-14 against `main` 9a7ba43.** Supersedes the earlier "nothing built" text (AUD-19).
Rule: *built* means the artifact exists in the repository; *validated* means an independent benchmark passed a
pre-declared tolerance and was signed off by the science owners (@joeljato, @maccachera); *published* means it is
served by the public demo. Nothing below is promoted to VALIDATED.

| Gate | Built (in repo) | Validated | Published |
|---|---|---|---|
| G1 Data origin | `LDEM_80S_80M.IMG` (PDS LRO-L-LOLA-4-GDR-V1.0) pinned by SHA-256 `e6591eee…5fdc` in `data/manifest.json` | No (provenance recorded, not reviewed) | Derived files only (`web/data/`), never the raw DEM |
| G2 Observer coordinates | 5 sites in `web/data/sites.json` (feature centres from NASA ACD-50044, not touchdown points) | No | Yes, labelled PRE |
| G3 SPICE derivation | `science/spice_lunar_angles.py`, kernels listed in `data/SPICE_SOURCES.md`, evidence `science/evidence/*NAIF-PRELIMINARY*` | No | Derived hourly series only |
| G4 Terrain horizon | `science/lola_horizon.py`, horizons in `web/data/sites/*.json` (80 m DEM, mast height in the series metadata) | No | Yes, labelled PRE |
| G5 Independent benchmark | Comparisons in `web/data/validation/validation_{pgda,horizons}.json`; PGDA differs by ~9 pp at Peak Near Shackleton (different method/window, unexplained) | **No**: tolerance not agreed, residuals not signed off | Shown as context on Evidence |
| G6 Downstream | 5 hourly Sun/Earth series 2025-01-01..2028-12-31 (`api/sitedata/series/`), `science_status` = `PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED`; 2 SYNTHETIC demo series | No | Yes, labelled PRE / SIM |
| G7 UI and submission | MoonProof v3 shows PRE/SIM/N/D per number; NASA submission not sent | No | Demo build: check `config.js` source commit before quoting |

Earlier text, kept for history:

As of the bootstrap (early 2026-11-14), **NO** scientific-validation gate is met. Existing Go/Rust binaries only test a mathematical comparison against caller-supplied angles and skyline.

| Gate | Required artifact | Currently |
|---|---|---|
| G1 Data origin | NASA LOLA exact product/URL, SHA-256, format, pixels/m, license, citation | NOT DONE |
| G2 Observer coordinates | 3 sites, published authoritative lat/lon and lunar frame conventions | NOT DONE |
| G3 SPICE derivation | Pinned kernels SPK/PCK/FK/LSK, J2000/TDB conversion, method, code | NOT DONE |
| G4 Terrain horizon | Ray cast from real DEM, lunar curvature, mast height, independent profile check | NOT DONE |
| G5 Validation | Independent JPL Horizons + peer-reviewed illumination benchmark with defined tolerances | NOT DONE |
| G6 Downstream | Sun/Earth time series, daylight/blackout, uncertainty intervals and model caveats | NOT DONE |
| G7 UI and submission | Accessible 3-site view, evidence per number, public review URLs and NASA confirmation | NOT DONE |

**Method details:** NAIF `illumf_c` works with an ellipsoid or DSK terrain when appropriate kernels are loaded (https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/illumf_c.html). An ellipsoid-only check is NOT a proof of terrain-horizon visibility. The Moon body-fixed frame must be explicitly selected, with orientation kernels (https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/Tutorials/pdf/individual_docs/SPICE_Tutorials_all.pdf). Horizons is a verification reference, not the terrain data source.

Accept a claim as `VALIDATED` only if it has: input data/version/hash, exact frame and epoch, formula, independent reference, numerical residual and threshold, results and tests, CI logs, and known limitations. `PASS` for Go/Rust synthetic comparison is an **engineering** test, not a NASA **scientific** test.

Science owner @joeljato and data owner @maccachera must review source-to-output evidence. Do not simulate a scientific source by setting caller-provided `terrain_dataset_id=NASSA`; bootstrap output must remain `UNVERIFIED_INPUTS` regardless of identifiers.

No autonomous go/no-go decisions for actual landers or human missions.


## Integrity gate added 2026-11-14

The JSON loader now rejects `VALIDATED` series pending an independently verifiable scientific attestation. The engine IPC must return `UNVERIFIED_INPUTS` with correct site, epoch, finite angles and consistent visibility; an arbitrary binary cannot self-promote science status. Mission time grids cannot round silently. NASA LOLA source provenance was merged through [PR #71](https://github.com/Braspace/Braspace/pull/71), but real terrain-horizon and Sun/Earth ephemeris computations remain pending.

The shared Rust-output contract now protects both the direct `/v1/visibility` and mission/scenario HTTP routes. [Draft PR #75](https://github.com/Braspace/Braspace/pull/75) independently develops a **preliminary** terrain-only LOLA skyline; it is not a validated Sun/Earth time-series pipeline.
