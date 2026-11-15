# Independent terrain-horizon benchmark: PGDA lunar polar illumination (BS-017)

**Status: `UNVERIFIED`.** This is a comparison, not a validation. Science owner: @joeljato. Data owner: @maccachera.

## Reference (not stored in git)
- PGDA product 69, "Lunar Polar Illumination" (E. Mazarico): https://pgda.gsfc.nasa.gov/products/69
- File: `AVGVISIB_85S_060M_201608.IMG` + `.LBL`, LOLA EXTRAS (http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/), PDS3, int16 LSB, 5058×5058 px, 60 m/px, polar stereographic on a 1737.4 km sphere, MEAN EARTH/POLAR AXIS OF DE421, covers 85°S–90°S (fully), down to ~82.9°S at the corners.
- Value = DN × 0.00004: the fraction of hourly steps over ~18.6 yr (one lunar nodal cycle) in which **any part of the solar disc** is visible. Computed from LDEM_85S_060M (60 m).
- Observer height: the page and label give none, so it is treated as surface level. Exact start epoch: not stated in the label.
- Terms: LOLA EXTRAS products are "not supported by the PDS or the LOLA Science Team" (README_ILLUMINATION_2016.TXT). NASA data, no stated restriction. **Cite:** Mazarico, E., et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, *Icarus* 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030.
- SHA-256 (2026-11-14):
  - IMG `82dadf321dee28f1947c1fed81858d4cf50fe8eb2aa405aae114e8ab21c1efe1` (51,166,728 B)
  - LBL `33decce957d5d4d9608557d8d969d1e1b94056a159b2563624ade4b528a0c917`
  - our DEM `ldem_80s_80m.img` `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`

## Reproduce
```bash
./download.sh /path/outside/git/dados          # 500 MB cap per file, resumes, prints SHA256SUMS
python -m venv venv && venv/bin/pip install numpy spiceypy matplotlib
venv/bin/python compare.py --data dados --kernels <naif dir with naif0012.tls de440s.bsp moon_pa_de440_200625.bpc moon_de440_250416.tf> \
   --out result_30km.json --grid-npz g30.npz --step-km 3 --sun-step-h 2
venv/bin/python compare.py ... --max-distance-m 100000 --out result_100km.json --grid-npz g100.npz
venv/bin/python plot.py diff.png g30.npz g100.npz
```
Runtime on exo-x1 (20 workers): 96 s at the 30 km range, 288 s at 100 km.

## Method
- Grid: regular 3 km polar-stereographic grid, |ρ| ≤ 140 km, 6,828 points. Each point uses the nearest PGDA 60 m pixel.
- Ours: `science/lola_horizon.py::sample_horizon` (PR #86 physics), with the defaults kept: 2 m observer, 160 m ray step, 30 km range. Azimuth step is 2°. Horizons are computed on LDEM_80S_80M.
- Sun: SPICE DE440s, MOON_ME_DE440_ME421, LT+S, from 2000-01-01 for 18.6 yr every 2 h (81,523 epochs). The Moon-centred direction is projected into the local ENU frame of each point.
- "Lit" means the Sun's centre is above the interpolated horizon. That is the convention of our pipeline, and it is the headline number. The any-limb fraction (centre + solar semidiameter) is reported only as a diagnostic.

## Results (ours − PGDA, fraction of time)
| run | mean | MAE | P95 |abs| | RMSE | max | r |
|---|---|---|---|---|---|---|
| 30 km range (pipeline default) | +0.046 | 0.050 | 0.194 | 0.080 | 0.437 | 0.904 |
| 100 km range (diagnostic) | −0.000 | 0.015 | 0.045 | 0.027 | 0.424 | 0.982 |

`result_30km.json` and `result_100km.json` hold the 10 worst points.

## Limits
- The two products use different DEMs (80 m vs 60 m). The single-pixel worst cases have a 3×3 PGDA range up to 0.44, so they sit on sharp crater rims and peaks.
- The epochs differ (exact PGDA start unknown) and our Sun step is 2 h vs their 1 h. Over a full 18.6 yr cycle this should matter little, but it has not been quantified.
- Point Sun vs disc. Observer height 2 m vs (assumed) 0 m.
- Only 85°S–90°S is covered. The three mission sites need a per-site check with PGDA product 78 (5 m/px DEMs).
