# Five-site Sun/Earth visibility, 2025–2028 (PRELIMINARY)

These results come from `api/cmd/threesitepipeline` (ported from `science/three_site_pipeline.py`; the per-site JSON is byte-identical) with the PR #86 half-pixel registration fix, run on real NASA data:

- **Terrain:** LRO/LOLA `LDEM_80S_80M.IMG` (80 m/px), SHA-256 `e6591eee…5fdc`.
- **Ephemeris:** NAIF `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`. Frame `MOON_ME_DE440_ME421`, apparent `LT+S` from the surface site (`spkcpo`).
- **Horizon:** rays every 1° of azimuth, out to 100 km in 160 m steps, observer 2 m above ground.
- **Window:** 2025-01-01 00:00 UTC, hourly, 35,064 samples.

| Site | Sun visible | Earth visible | Both | Longest darkness | Longest Earth blackout |
|---|---|---|---|---|---|
| Mons Mouton (IM-2 target) | 45.2% | 81.0% | 37.5% | 456 h | 148 h |
| Malapert Massif | 38.4% | 48.8% | 19.5% | 670 h | 357 h |
| Nobile Rim 1 | 31.2% | 32.0% | 10.4% | 515 h | 488 h |
| Connecting Ridge | 53.3% | 44.8% | 26.9% | 502 h | 382 h |
| Peak Near Shackleton | ≤ 80.4% ¹ | 58.9% | ≤ 47.0% ¹ | 345 h | 288 h |

"Visible" means the body's **centre** is above the terrain horizon.

¹ Upper bound. NASA PGDA gives 71.9% average sunlight at this site against our 80.9% (+9.0 pp, outside the ±5 pp tolerance of
`docs/SCIENCE_REVIEW_ONBOARD_BS061.md`), and a ray marched past our 100 km horizon limit finds more shadow there. The cause is
not confirmed. The web screens show the same caveat (`sunCaveat` in `web/moonproof/core/data.js`).

The per-site hourly JSON files (~6 MB each) are not committed. Compact copies, 280 KB per site at 0.01°, live in `web/data/sites/`.

The numbers in PR #82 are superseded: they predate the pixel fix and covered only 2027.

## Validation

- **`validation_horizons.json`:** compares the ephemeris with JPL Horizons over 5 sites × 12 epochs × 2 bodies. Every difference is below 0.000005°.
- **`validation_pgda.json`:** compares our terrain horizon with the NASA GSFC PGDA average maps. Sun differences range from −0.9 to +9.0 pp. See `docs/LANDING_LAB.md` §3.

Do not present these numbers as NASA-certified.
