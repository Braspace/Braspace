# Scientific evidence gates: from synthetic smoke to actual NASA-backed results

As of 2026-11-14, **NO** scientific-validation gate is met. Existing Go/Rust binaries only test a mathematical comparison against caller-supplied angles and skyline.

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
