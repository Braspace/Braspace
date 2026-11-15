# Scientific validation report and error budget (BS-017)

Status: **PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED**. Nothing here is `VALIDATED`, NASA-certified or flight-grade.
Drafted by an AI agent (Renata, BR109); the scientific owner (@joeljato) must review it before it is cited.
Every number below is copied from a committed file; the command to reproduce it is next to it. Nothing was re-run for this document.

## 1. What is compared with what

| # | Quantity | Ours | Independent reference | Committed result |
|---|---|---|---|---|
| V1 | Sun and Earth azimuth/elevation seen from a lunar site | SPICE (`api/cmd/threesitepipeline` via `api/naif`, `spkcpo`, apparent LT+S, frame `MOON_ME_DE440_ME421`) | JPL Horizons API, topocentric AZ-EL (quantity 4), airless, `CENTER='coord@301'` | `science/results/validation_horizons.json` |
| V2 | Fraction of time the Sun / Earth is above the terrain horizon | `api/cmd/threesitepipeline` on LOLA `LDEM_80S_80M` | NASA GSFC PGDA `AVGVISIB_75S_120M_201608` (+`_EARTH`), Mazarico et al. 2011, *Icarus* 211:1066 | `science/results/validation_pgda.json` |

Reproduce V1: `go -C api run ./cmd/validatehorizons -samples 12 -output <file> <site_json>...` (paths relative to `api/`) (needs network access to the Horizons API).
Reproduce V2: see `docs/LANDING_LAB.md` §2 (the NASA inputs, about 350 MB, stay outside git).
Unit tests that need no download: `python3 -m unittest discover -s science/tests`, `cargo test --manifest-path engine/Cargo.toml`, `go test ./...` in `api/`.

## 2. Links and provenance

- LOLA product `LDEM_80S_80M`: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/>; SHA-256 `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc` (`science/README.md`).
- NAIF kernels: `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls` (<https://naif.jpl.nasa.gov/pub/naif/generic_kernels/>).
- JPL Horizons API: <https://ssd.jpl.nasa.gov/api/horizons.api>.
- PGDA products and their SHA-256 are listed in `science/results/validation_pgda.json` (`pgda.sun`, `pgda.earth`); source <http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/>.

## 3. Units

Angles in degrees: azimuth in [0, 360), elevation in [-90, 90]. Frame `MOON_ME` (Mean Earth / Polar Axis). Lengths in metres (LOLA 80 m/pixel, observer 2 m above ground, ray step 160 m, horizon range 100 km). Percentages are fractions of the 35,064 hourly samples from 2025-01-01T00:00Z. "pp" means percentage points. "Visible" in `three_site_pipeline.py` means the body **centre** is above the horizon, plus a separate solar-disc fraction (disc radius about 0.27 deg).

## 4. Differences

### V1, Horizons (5 sites x 12 epochs x 2 bodies)
Every stored difference in `validation_horizons.json` (`max_abs_az_diff_deg_cos_el`, `max_abs_el_diff_deg`) is `0.0` at the precision the file keeps; `science/results/README.md` states the bound as below 0.000005 deg. Both use the same SPICE-class ephemeris family, so V1 checks the frame, light-time and aberration handling, not the lunar orientation model against an unrelated source.

### V2, PGDA

| Site | Ours: Sun disc % | PGDA Sun % | diff (pp) | Ours: Earth centre % | PGDA Earth any-part % | diff (pp) |
|---|---|---|---|---|---|---|
| mons-mouton-im2 | 45.57 | 46.43 | -0.86 | 81.03 | 92.06 | -11.03 |
| malapert-massif | 38.52 | 34.97 | 3.55 | 48.83 | 52.75 | -3.92 |
| nobile-rim-1 | 31.22 | 30.85 | 0.37 | 31.98 | 35.83 | -3.85 |
| connecting-ridge | 51.92 | 50.65 | 1.27 | 44.82 | 43.74 | 1.08 |
| peak-near-shackleton | 80.89 | 71.89 | 9.00 | 58.88 | 57.26 | 1.62 |

Sun differences range from -0.86 to +9.00 pp. The +9.00 pp at `peak-near-shackleton` is **unexplained** (`docs/LANDING_LAB.md` §3).

## 5. Error budget (what is known, what is not)

| Source | Size | Basis |
|---|---|---|
| Ephemeris vs Horizons | < 0.000005 deg (stored result 0.0) | V1 |
| Sun/Earth fraction vs PGDA | -0.86 .. +9.00 pp (Sun), -11.03 .. +1.62 pp (Earth) | V2 |
| Earth counted at centre (ours) vs any part (PGDA) | systematic: ours is a lower bound | `validation_pgda.json` caveats |
| Different averaging period (ours 2025-2028, PGDA long term) | not quantified | `validation_pgda.json` caveats |
| PGDA uses its own horizon model and DEM | not quantified; "independent but not identical" | `validation_pgda.json` caveats |
| DEM resolution (80 m) vs craters/boulders under about 160 m | not quantified | `docs/LANDING_LAB.md` §6 |
| Site coordinate = catalogue feature centre, not a touchdown point | up to about 5 km at Malapert | `docs/LANDING_LAB.md` §6 |
| Observer height 2 m | not varied | `science/README.md` |
| Raster pixel registration (half pixel, PR #86) | not quantified separately | `science/results/README.md` |

No total uncertainty is given because the terms above are not independent and several are unquantified. A combined interval would be invented.

## 6. Limitations (explicit)

- The Rust engine and the Go API classify **caller-supplied** angles against a **caller-supplied** skyline. They validate nothing about NASA data (`docs/SCIENTIFIC_ACCEPTANCE.md`).
- Geometric Sun visibility is not usable solar power (see the note in `docs/`, BS-018/BS-040).
- No tolerance has been agreed with the science owner, so there is no pass/fail verdict here. `VALIDATED` stays forbidden until there is one.
- The ephemeris window is 2025-01-01 to 2028-12-31.
- Numeric reference fixtures (second deliverable of #17): the committed JSONs in `science/results/` are the only numeric references; no separate fixture directory exists yet.

## 7. Next actions
1. @joeljato: decide the tolerance per quantity and whether the +9.00 pp case is a defect.
2. Explain or fix `peak-near-shackleton`.
3. Add a fixtures directory with the Horizons and PGDA values and a test that fails when `science/results/*.json` drift from it.
