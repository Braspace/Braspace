# LOLA south-pole horizon processor — candidate scientific implementation

**Owner of scientific review:** @joeljato, issues [#14](https://github.com/Braspace/Braspace/issues/14), [#17](https://github.com/Braspace/Braspace/issues/17), [#65](https://github.com/Braspace/Braspace/issues/65).
**Data-owner handoff:** @maccachera [PR #71](https://github.com/Braspace/Braspace/pull/71).
**Code status:** first-pass runnable Python 3.12 standard-library tool with synthetic terrain unit tests; **not yet benchmarked against the actual NASA 115 MB PDS bytes or an independent horizon reference in this PR**.
**Frame:** `MEAN EARTH/POLAR AXIS OF DE421`; NASA PDS LRO/LOLA source; **NO NASA Sun/Earth ephemerides integrated**.

## Scientific purpose

Make real NASA terrain usable for a Moon south-pole candidate site's **geometric horizon** without misrepresenting it as a computed illumination or Earth communication window. We separate three verification gates:

1. **Source authenticity:** independent NASA PDS binary SHA-256 matches the 115,520,000-byte product selected and authenticated by @maccachera in PR #71.
2. **Pixel/geodesy and ray calculation:** map planetocentric lat/lon to the PDS3 polar stereographic raster with the label's `MAP_SCALE=80m/pixel`, `LINE_PROJECTION_OFFSET=3799.5`, `SAMPLE_PROJECTION_OFFSET=3799.5`, frame DE421 ME; sample heights as `DN*0.5` m, add reference radius 1,737,400m, account for lunar curvature and observer mast height. **This algorithm must be independently cross-checked** by Joel at known sites and control points.
3. **Sun/Earth windows:** require genuine JPL/NAIF SPICE vectors in frame consistent with the raster and a verified epoch/time convention; **not performed by this script**.

Primary PDS file listing: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/  
PDS label: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl  
PDS data SHA-256 pinned by Gabriel: `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`.

## Reproduce using original NASA bytes (outside Git)

```bash
mkdir -p data/raw/lola .local/out
BASE='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img'
curl -fLSs "${BASE}/ldem_80s_80m.img" -o data/raw/lola/ldem_80s_80m.img
curl -fLSs "${BASE}/ldem_80s_80m.lbl" -o data/raw/lola/ldem_80s_80m.lbl

# Go CLI (api/lolahorizon + api/cmd/lolahorizon): same flags, JSON keys/order and exit codes
go -C api run ./cmd/lolahorizon \
  --img ../data/raw/lola/ldem_80s_80m.img \
  --label ../data/raw/lola/ldem_80s_80m.lbl \
  --lat -89.4632 --lon -137.49 \
  --observer-height-m 2 \
  --max-distance-m 30000 --step-m 160 --azimuth-step-deg 5 \
  --output ../.local/out/connecting-ridge-horizon-preliminary.json

# Python reference (kept: science/lola_horizon.py is still imported by
# benchmarks/pgda_illumination/compare.py)
python3 science/lola_horizon.py \
  --img data/raw/lola/ldem_80s_80m.img \
  --label data/raw/lola/ldem_80s_80m.lbl \
  --lat -89.4632 --lon -137.49 \
  --observer-height-m 2 \
  --max-distance-m 30000 --step-m 160 --azimuth-step-deg 5 \
  --output .local/out/connecting-ridge-horizon-preliminary.json

python3 -m unittest discover -s science/tests -v
(cd api && go test ./lolahorizon ./cmd/lolahorizon)
```

## SPICE pipeline in Go (no spiceypy)

The NAIF/SPICE side of the pipeline is pure Go (`api/naif`: text kernels, DAF/SPK type 2, binary PCK type 2, `str2et`,
`spkpos`/`spkezr`/`spkcpo` with `NONE`, `LT` and `LT+S`, `pxform`, `reclat`, `m2q`). It was checked against spiceypy 8.4.0
(CSPICE N0067) on 2,500 random epochs and the five sites: at most 5.4e-11 deg in azimuth/elevation and 9.4e-13 relative in
km (`api/naif/differential_test.go`). The scripts that used spiceypy were ported and deleted; the outputs they wrote are
reproduced byte for byte (SHA-256 identical) from the same kernels and the same LOLA raster:

| Was (Python) | Is (Go, run from `api/`) |
|---|---|
| `science/spice_lunar_angles.py` | `go run ./cmd/spicelunarangles --horizon ../science/evidence/connecting-ridge-LOLA-PRELIMINARY.json --kernels-dir <kernels> --output-series ... --output-metadata ...` |
| `science/three_site_pipeline.py` | `go run ./cmd/threesitepipeline --img <lola>.img --label <lola>.lbl --kernels-dir <kernels> --out-dir ../science/results` |
| `science/horizon_reach_study.py` | `go run ./cmd/horizonreachstudy --img <lola>.img --label <lola>.lbl` |

Tests that need NASA inputs skip with a clear message when they are absent: set `NAIF_KERNEL_DIR` (the four kernels above plus
`pck00010.tpc`; checksums are verified), `LOLA_DIR` (`ldem_80s_80m.img` + `.lbl`) and, for the differential report,
`NAIF_DIFF_REF` (written by `api/naif/testdata/gen/gen_fixtures.py --diff N`, not committed). The `generator` strings inside
the committed artefacts still name the old Python files on purpose: they are provenance of those bytes.

The Go port was checked against the Python on a synthetic 7600x7600 raster (not NASA data): the JSON was byte-identical on every case tried. The owner-approved acceptance bound is `|diff| <= 1e-6` per value (degrees, and relative for metres). The committed `science/results/*`, `api/sitedata/*` and `web/data/*` remain the Python-produced, SHA-pinned outputs; they were not regenerated.

The CLI refuses a raster with the wrong byte length, an unexpected frame or changed checksum. It computes the terrain horizon **from the actual binary at runtime** when supplied with that binary. It never downloads or commits NASA data itself. The resulting JSON contains `actual_nasa_dem_bytes_used`, checksum, site, observer mast height, azimuthal elevation profile, missing-data coverage and explicit `PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED` plus `ephemerides_integrated: false` and `nasa_certified: false`.

## Numerical methodology

For south-pole planetocentric latitude `phi` and east-positive longitude `lambda`, with spherical lunar radius `R`:

```text
rho = 2 R tan((phi + 90°)/2)
x = rho sin(lambda); y = rho cos(lambda)
pixel_col0 = SAMPLE_PROJECTION_OFFSET + x/MAP_SCALE
pixel_row0 = LINE_PROJECTION_OFFSET - y/MAP_SCALE
```

Zero-indexed pixel centres per DSMAP_POLAR.CAT (X = (I - N/2 - 0.5)*MAP_SCALE, I one-indexed): the label offset is already the zero-indexed pole position, so no extra -0.5 is applied. Joel must confirm this exact convention with an independent georeferenced benchmark before production use. DEM values use bilinear spatial interpolation with an explicit sentinel guard. Ray directions follow great circles along local tangent ENU. At each distance, terrain planetary radius is `R+elevation`; the apparent height is measured against the observer's local tangent using a 3D vector (curvature included). The maximum apparent elevation among sampled terrain points defines the approximate skyline for that azimuth.

**Limitations:** This is a sampled discrete DEM along rays; grid resolution, interpolation, oversampling and undersampling, radial extent, image artifacts, observer-height uncertainty, site center uncertainty, partial coverage, parallax, geodetic-vs-geocentric conventions and lunar shape approximation all affect results. It is *not* flight-grade. True Sun disc width and eclipses are absent; no solar incidence, battery or RF budget is computed.

## Follow-ups and ownership

- [ ] @maccachera: run the CLI against the same verified original NASA raster (or supply an approved output, exact command and checksum); confirm pixel-offset interpretation from PDS label; link in [#38](https://github.com/Braspace/Braspace/issues/38) and PR #71.
- [ ] @joeljato: review south pole geodesy, the ENU/geometric maximum, interpolated DEM values and numerical error, and reproduce reference horizon azimuths; attach actual test log to [#14](https://github.com/Braspace/Braspace/issues/14).
- [ ] @gfreiresjrp: connect future approved horizon JSON to existing typed `api/sitedata/series` loader **only after SPICE-derived Sun/Earth samples are verified**; do not label data `VALIDATED` without independent criteria.
- [ ] @gustavofullstack: expose measured horizon in 3D renderer with a clear PRELIMINARY label and provenance drawer; do not claim illumination/communication windows until SPICE.
- [ ] @Ninzinhu: review reproducibility, privacy, NASA form citations and science limitation wording. No claim of NASA certification or endorsement.
- [ ] Keep the 115 MB binary outside Git. Do not merge this PR until Joel's real-dataset acceptance and CI are reviewed.

## Integration discipline

The science branch is based on latest `main` and adds **only** `science/`, `.github/workflows/lola-science.yml`. It does not overwrite Gabriel's PR #71 or Freire's PR #74, and does not change `main` or the runtime's `science_status` until approved.
