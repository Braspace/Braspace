# LOLA south-pole horizon processor — candidate scientific implementation

**Owner of scientific review:** @joeljato, issues [#14](https://github.com/Braspace/Braspace/issues/14), [#17](https://github.com/Braspace/Braspace/issues/17), [#65](https://github.com/Braspace/Braspace/issues/65).
**Data-owner handoff:** @maccachera [PR #71](https://github.com/Braspace/Braspace/pull/71).
**Code status (2026-11-14):** The GitHub Actions workflow [LOLA PDS source-backed horizon evidence](https://github.com/Braspace/Braspace/actions/runs/43616076751) downloaded the original 115,520,000-byte PDS raster, checked the pinned SHA-256 and reproduced the committed Connecting Ridge 36-azimuth terrain horizon. A separate [NAIF workflow](https://github.com/Braspace/Braspace/actions/runs/43616076788) downloaded JPL kernels, generated a 72-hour Sun/Earth-center angle series and compared the calculated output with the committed preliminary series. **Both are reproducibility/source-integrity checks, not independent scientific validation or flight-grade accuracy benchmarks.**
**Frames:** LOLA raster label `MEAN EARTH/POLAR AXIS OF DE421`; NAIF computation `MOON_ME_DE440_ME421`, using `NONE` geometric aberration correction. The separate `science/spice_lunar_angles.py` now computes source-backed Sun/Earth-center ephemeris directions, but frame interoperability, geodesy and numerical accuracy **remain independently unvalidated**.

## Scientific purpose

Make real NASA terrain usable for a Moon south-pole candidate site's **geometric horizon** without misrepresenting it as a computed illumination or Earth communication window. We separate three verification gates:

1. **Source authenticity:** independent NASA PDS binary SHA-256 matches the 115,520,000-byte product selected and authenticated by @maccachera in PR #71.
2. **Pixel/geodesy and ray calculation:** map planetocentric lat/lon to the PDS3 polar stereographic raster with the label's `MAP_SCALE=80m/pixel`, `LINE_PROJECTION_OFFSET=3799.5`, `SAMPLE_PROJECTION_OFFSET=3799.5`, frame DE421 ME; sample heights as `DN*0.5` m, add reference radius 1,737,400m, account for lunar curvature and observer mast height. **This algorithm must be independently cross-checked** by Joel at known sites and control points.
3. **Sun/Earth windows:** `science/spice_lunar_angles.py` now uses downloaded JPL/NAIF kernels to compute 72 hourly geometric Sun/Earth-center look angles for Connecting Ridge and combines them with the unvalidated LOLA skyline. This is not an independent validation of frames, horizon interpolation, time scales, solar-disc effects, eclipse geometry or actual RF/power windows. Output stays `UNVERIFIED`.

Primary PDS file listing: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/  
PDS label: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl  
PDS data SHA-256 pinned by Gabriel: `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`.

## Reproduce using original NASA bytes (outside Git)

```bash
mkdir -p data/raw/lola .local/out
BASE='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img'
curl -fLSs "${BASE}/ldem_80s_80m.img" -o data/raw/lola/ldem_80s_80m.img
curl -fLSs "${BASE}/ldem_80s_80m.lbl" -o data/raw/lola/ldem_80s_80m.lbl

python3 science/lola_horizon.py \
  --img data/raw/lola/ldem_80s_80m.img \
  --label data/raw/lola/ldem_80s_80m.lbl \
  --lat -89.4632 --lon -137.49 \
  --observer-height-m 2 \
  --max-distance-m 30000 --step-m 160 --azimuth-step-deg 5 \
  --output .local/out/connecting-ridge-horizon-preliminary.json

python3 -m unittest discover -s science/tests -v
```

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

- [x] Automated source acquisition and checksum/reproducibility check against original NASA LOLA PDS bytes in [CI](https://github.com/Braspace/Braspace/actions/runs/43616076751) (not an independent benchmark).
- [x] Automated source-backed NAIF 72-hour sample regeneration and committed-series comparison in [CI](https://github.com/Braspace/Braspace/actions/runs/43616076788) (not an independent benchmark).
- [ ] @maccachera: confirm the PDS pixel-offset and coordinate interpretation independently and attach the evidence to [#38](https://github.com/Braspace/Braspace/issues/38).
- [ ] @joeljato: review south pole geodesy, the ENU/geometric maximum, interpolated DEM values and numerical error, and reproduce reference horizon azimuths; attach actual test log to [#14](https://github.com/Braspace/Braspace/issues/14).
- [x] A source-derived Connecting Ridge NAIF series is wired into `api/sitedata/series` with `science_status=UNVERIFIED`; [Go/Rust CI](https://github.com/Braspace/Braspace/actions/runs/43616076740) confirms preliminary series consumption.
- [ ] @gfreiresjrp and @joeljato: independently verify the numerical results and coordinate/time contracts before any scientifically `VALIDATED` status can be permitted.
- [ ] @gustavofullstack: present the source-derived horizon and SPICE-centered visibility *as preliminary*, with a provenance drawer and `UNVERIFIED` status; do not imply measured solar power, RF link availability or flight recommendation.
- [ ] @Ninzinhu: review reproducibility, privacy, NASA form citations and science limitation wording. No claim of NASA certification or endorsement.
- [ ] Keep the 115 MB binary outside Git. Do not merge this PR until Joel's real-dataset acceptance and CI are reviewed.

## Integration discipline

This PR includes the terrain calculator, NAIF look-angle calculator, source-backed evidence, a preliminary Connecting Ridge API series and related CI workflows. The `api/sitedata` series explicitly declares `science_status=UNVERIFIED`. It does not merge PR #74 or #76 and does not change `main`. Independent scientific review, numerical control points, tolerances and uncertainty budget remain required before using `VALIDATED`.
