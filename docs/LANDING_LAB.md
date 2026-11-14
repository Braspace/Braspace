# MoonProof Polar Lab + Landing Lab

`web/lab.html` is a static page. It needs no backend, so it works on GitHub Pages and loads only precomputed, versioned NASA-derived products (~6 MB total).

The flow follows the challenge: **Explore → Compare → Recover → Landing Lab → Evidence & Learn**.

## 1. What is NASA data, what is derived, what is synthetic

| Layer | Status | Source / method |
|---|---|---|
| Terrain heights (region + local) | **NASA data** | LRO/LOLA `LDEM_80S_80M.IMG` V2.0 (PDS `LRO-L-LOLA-4-GDR-V1.0`). SHA-256 `e6591eee…5fdc`. Native 80 m, MEAN EARTH/POLAR AXIS OF DE421. |
| Average illumination / Earth visibility maps | **NASA data** | GSFC PGDA `AVGVISIB_75S_120M_201608` and `…_EARTH` (Mazarico et al. 2011, *Icarus* 211:1066). SHA-256 values in `web/data/region/south_pole_400m.json`. |
| Sun/Earth directions | **NASA/JPL ephemerides, our computation** | NAIF `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`. Frame `MOON_ME_DE440_ME421`. Apparent `LT+S` from the surface site (`spkcpo`), hourly 2025-01-01 → 2028-12-31. |
| Terrain horizon per site | **Derived** | `science/lola_horizon.py`: great-circle rays every 1°, out to 100 km, lunar curvature, observer 2 m. Includes the PR #86 half-pixel fix. |
| Sun/Earth visibility, windows, countdowns | **Derived** | Centre of disc: `margin = elevation − horizon(azimuth) ≥ 0`. |
| Slope | **Derived** | Finite differences of the DEM at 400 m (region) or 40 m (site). Slope is scale-dependent. |
| Globe colour texture | NASA visual product | NASA SVS CGI Moon Kit `lroc_color_2k.jpg`, hosted locally because SVS CORS excludes our origin. Visual only. |
| Lander, its limits, propellant, score | **Synthetic / hypothetical** | Teaching parameters in `web/lab/physics.js`. Not NASA requirements. |
| Stars, GPU shadows, weak fill light | **Illustrative** | Rendering only; never used for numbers. |

## 2. Data pipeline (reproducible)

```sh
# NASA inputs stay outside git (≈350 MB): LOLA .img/.lbl, 4 NAIF kernels, 2 PGDA maps + labels
python science/three_site_pipeline.py --img <lola>/ldem_80s_80m.img --label <lola>/ldem_80s_80m.lbl \
  --kernels-dir <kernels> --out-dir science/results --start-utc 2025-01-01T00:00:00Z --hours 35064
python science/validate_vs_horizons.py science/results/{mons-mouton-im2,malapert-massif,nobile-rim-1,connecting-ridge,peak-near-shackleton}.json \
  --output science/results/validation_horizons.json
python science/build_web_assets.py --lola-img <lola>/ldem_80s_80m.img --lola-lbl <lola>/ldem_80s_80m.lbl \
  --pgda-dir <pgda> --results-dir science/results --out web/data
cp science/results/validation_*.json web/data/validation/
```

Every web asset carries its SHA-256, and the browser checks it before use (`TerrainGrid.load` and `SiteSeries.load`).

Sources:
- **NASA products (the pipeline refuses to run if a checksum differs):**
  - LOLA: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
  - PGDA: http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/
  - NAIF: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- **IM-2 intended landing site:** https://www.lroc.asu.edu/images/1401

## 3. Validation (numbers, not adjectives)

**Ephemeris vs JPL Horizons.** 5 sites × 12 epochs × Sun and Earth, Horizons in topocentric airless apparent AZ-EL, MEAN_ME frame. Every difference is below 0.000005° (`science/results/validation_horizons.json`).

**Terrain horizon vs NASA PGDA maps** (independent horizon model, longer averaging period):

| Site | Ours: Sun disc % (2025–28) | PGDA Sun % | Δ pp | Ours: Earth centre % | PGDA Earth any-part % |
|---|---|---|---|---|---|
| Mons Mouton (IM-2) | 45.6 | 46.4 | −0.9 | 81.0 | 92.1 |
| Malapert Massif | 38.5 | 35.0 | +3.5 | 48.8 | 52.8 |
| Nobile Rim 1 | 31.2 | 30.9 | +0.4 | 32.0 | 35.8 |
| Connecting Ridge | 51.9 | 50.6 | +1.3 | 44.8 | 43.7 |
| Peak Near Shackleton | 80.9 | 71.9 | **+9.0** | 58.9 | 57.3 |

How to read the table:
- **Earth column:** ours is expected to be lower, because we count the Earth's centre while PGDA counts any visible part.
- **Peak Near Shackleton (+9 pp):** the largest Sun difference, still unexplained. Candidate causes are the shorter window, DEM resolution near steep terrain, and PGDA's own horizon model. It needs science review (@joeljato).

**Other checks:**
- All five labelled craters are confirmed as depressions in LOLA, rim 1.5–4.0 km above floor (`web/data/sites.json`).
- Connecting Ridge height is 1,943.26 m here, against 1,943.27 m in PR #86.

**Browser vs Python.** `web/tests/data.test.mjs` checks that the in-browser window metrics reproduce the pipeline's 4-year Sun/Earth % within 0.3 pp. The only difference comes from 0.01° quantisation.

## 4. Landing Lab physics

```text
dr/dt = v
dv/dt = −μ (r − c)/|r − c|³ + (T/m) û        μ = 4.9028000661637961e12 m³/s² (DE440 GM_Moon)
dm/dt = −T/(Isp·g₀)                            g₀ = 9.80665 m/s²
```

- **Frame:** site East-North-Up tangent plane in metres. The Moon centre is at `(0, 0, −(R_ref + site height))`, so gravity is central, not assumed constant.
- **Degrees of freedom:** **3-DOF translational**. The thrust direction `û` comes from two tilt angles that follow the pilot's command with a 20°/s rate limit. That is rate-limited kinematics, not a 6-DOF rigid body (P2).
- **Integration:** **RK4 with a fixed Δt = 0.02 s.** An accumulator decouples the physics from the display frame rate. The state is never rounded during integration.
- **Contact:** the four footpads are tested against the bilinear LOLA tile (lunar curvature included). Ground slope comes from the terrain under the pads. Outcomes are `LANDED`, `HARD_LANDING`, `CRASH` or `OUT_OF_MODELED_AREA`, with a reason for each limit.
- **Tests:** `web/tests/physics.test.mjs`, 13 of them:
  - free fall, energy conservation (drift < 1e-12) and Tsiolkovsky + gravity loss;
  - mass flow, burnout, flat and 20° collisions, leaving the modelled area;
  - bitwise reproducibility, frame-rate independence and RK4 4th-order convergence (error ratio 12–20 when halving Δt; < 1e-4 m after 600 s at Δt = 0.02 s).

## 5. Demo script (60–90 s)

1. Page load (10 s): the camera flies from the NASA globe to the south pole and the LOLA relief appears, lit by the Sun computed for *now*. Point out Shackleton's interior in shadow.
2. Pick **Mons Mouton** and press **IM-2 landing day** (10 s). The Sun/Earth card shows both bodies against the real horizon, the countdown to sunset/Earthset, and the panorama.
3. **Compare** (10 s): five sites over the same 14 days. Sun %, Earth %, longest darkness, plus PGDA long-term reference columns.
4. **Recover** (15 s): +48 h delay. See what changes at the same site and which alternatives meet "≥ 30 % Sun, ≤ 120 h blackout". Click **Fly in Landing Lab**.
5. **Landing Lab** (25 s): throttle with ↑/↓ and steer with W/A/S/D toward the ring. The HUD separates *scientific geometry* (Sun/Earth at that epoch) from *educational simulation*.
6. **Debrief** (10 s): result, touchdown speeds and slope, propellant, chart, energy/communication risks at that epoch, tips.
7. **Evidence** (10 s): provenance, both validation tables, equations, limitations.

## 6. Known limitations and pending work

- Site coordinates are catalogue **feature centres**, not certified touchdown points. Malapert's summit (5,163 m) is ~5 km from the point used.
- The 80 m DEM cannot represent boulders or craters smaller than ~160 m. Ingesting the PGDA 5 m DEMs (Site01/04/07) and their error maps is **not done**, so the uncertainty layer reads `NOT COMPUTED`.
- No power, thermal or RF link-budget model. Earth visibility is geometric only.
- The ephemeris window is 2025-01-01 → 2028-12-31. Outside it the app answers `NOT COMPUTED`.
- The static page reproduces the Recover logic for geometry only. The Go `/api/scenarios/delay` and `/api/onboard/*` endpoints are untouched and still serve the classic Mission Computer (`index.html`).
- Performance: one render costs ~5 ms CPU / ~17 ms GPU on Intel Iris Xe (322k triangles, 4096² shadows). Adaptive quality (dropping shadows or resolution on slow GPUs) is not implemented.
- AI assistance was used to write the code and documentation. Every scientific claim needs human review before submission.
