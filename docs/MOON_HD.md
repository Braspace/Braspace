# Moon HD viewer (`web/moon-hd.html`)

Owner: @joeljato. Status: **visual product, not independently validated, not a NASA product.**

A static page (no API calls) with **one 3D Moon** and one clock. Two camera presets share the scene:

| Preset | What you see | Data |
|---|---|---|
| Globe | The whole sphere: LROC WAC colour, relief from LOLA 16 px/deg (normal map + displacement) | `color_4k.jpg` / `color_8k.jpg`, `normal_4k.jpg`, `height_2k.jpg` |
| South pole | The same sphere seen from low altitude near the pole. South of 80.35° S the surface is a cap built from `LDEM_80S_80M`: native 80 m within 164 km of the pole, 320 m block means out to 80° S, lunar curvature included, terrain shadows marched toward the Sun in the fragment shader | `south_pole_80m.bin`, `south_pole_320m.bin` |

Options: **Colour** natural / altitude, **Light** real Sun / even, **Relief ×** 1 to 10 (default 1 = true scale), **Names**.
Names are the catalog landing sites plus IAU/USGS features (`features.json`: craters ≥ 20 km and montes south of 80.5° S, and every mare).

The clock covers the same window as the site series (hourly, from 2025-01-01, 35,064 samples). The sub-solar and
sub-Earth points come from `ephemeris.bin`.

Open locally: `cd web && node dev-server.mjs`, then `/moon-hd.html`. Deep links: `?view=pole`, `?color=altitude`, `?light=even`, `?t=2026-11-14T12:00:00Z`, `?lang=pt`.

## What is real and what is a display choice

| Item | Status |
|---|---|
| Terrain heights in the cap | LOLA DNs from `LDEM_80S_80M` (same SHA-256 the team pinned): unmodified in the 80 m grid, 4 × 4 block means in the 320 m grid. The two are blended over 2.4 km where they meet |
| Sub-solar / sub-Earth points | NAIF SPICE (DE440, `MOON_ME_DE440_ME421`, LT+S, centres of Sun and Earth, observer at the Moon centre), 0.01° quantisation, linear interpolation between hourly samples |
| Shadows (Light = real Sun) | Geometric, only inside the cap and only from terrain inside the cap. Rays reach 260 km with 144 samples (72 on phones), spacing grows with distance, so a narrow distant peak can be missed. The penumbra is a smooth step across the 0.53° solar disc. North of 80.35° S there are no cast shadows, only the day/night side and the slope shading |
| Relief × above 1 | Exaggerates heights everywhere, including in the shadow march: shapes and shadows are then not at true scale. The page says so |
| Light = even | Not physical: a light fixed to the camera plus a fill term, no night side, no shadows. The page says so |
| Colour = altitude | Height above the 1,737.4 km sphere on a fixed ramp from −7 km to +8 km (heights outside it clamp). The ramp is a display choice |
| Brightness | Lunar-Lambert blend chosen for looks; no calibrated photometry. Earthshine on the night side is decorative |
| Natural colour inside the cap | The global LROC mosaic (about 1.3 km per pixel in latitude at 8k), far coarser than the 80 m relief under it |
| Stars | NASA SVS Deep Star Maps 2020; **not** oriented relative to the Moon. Decorative |
| Sun and Earth in the sky | Correct direction and angular size; not at true distance. Earth is a plain shaded sphere |
| Names | Gazetteer feature centres, lifted 1.5 km above the surface; labels only |

No landing metric is computed on this page.

## Cross-check with the site series

`web/tests/moon-hd.test.mjs` compares, for Connecting Ridge and Peak Near Shackleton, whether the Sun's centre is above the
terrain according to (a) the team series (`science/three_site_pipeline.py`: Sun seen from the site with `spkcpo`, against a
360-azimuth LOLA horizon traced out to 100 km) and (b) the viewer's ray march toward the sub-solar direction (`sunClearance`
in `web/moon-hd/polar-math.js`, a CPU copy of the shader at relief ×1). Samples within 0.3° of the horizon are left out.

Measured on 2026-11-14, one sample every 37 hours over the four years:

| Site | Compared | Viewer limited to 100 km (like for like, this is what the test asserts) | Viewer at its own 260 km reach |
|---|---|---|---|
| Connecting Ridge | 811 | 784 agree (96.7 %) | 785 agree (96.8 %) |
| Peak Near Shackleton | 804 | 795 agree (98.9 %) | 765 agree (95.1 %) |

Every disagreement is "series says lit, viewer says shadow". Raising the number of samples per ray from 144 to 600 changes
the counts by at most 6, so sampling density is not the cause.

**Open question for the science review (#65, #154):** at Peak Near Shackleton, letting the ray continue past 100 km turns 30
more of the 804 samples (3.7 %) from lit to shadow. If that holds, terrain between 100 km and 260 km blocks the Sun there and
the series' 100 km horizon overestimates sunlight at that site. This is one implementation on a 320 m block-mean grid; it has
not been checked against PGDA or any independent product, and the Connecting Ridge disagreements (which do not depend on the
reach) are not explained either.

Both computations use the same LOLA file and the same kernels, so agreement shows the two implementations agree with each
other; it is not a validation against an independent reference.

## Sources and licences

| File | Source | SHA-256 of the source |
|---|---|---|
| `lroc_color_poles_8k.tif` | NASA SVS 4720, CGI Moon Kit: <https://svs.gsfc.nasa.gov/4720> | `4af8b0cd…dce43bad796` → see `manifest.json` |
| `ldem_16.tif` | NASA SVS 4720, CGI Moon Kit (LOLA) | see `manifest.json` |
| `starmap_2020_4k.exr` | NASA SVS 4851, Deep Star Maps 2020: <https://svs.gsfc.nasa.gov/4851> | see `manifest.json` |
| `ldem_80s_80m.img` | PDS Geosciences Node, LRO-L-LOLA-4-GDR-V1.0 | `e6591eee…8ff65fdc` (team pin) |
| NAIF kernels | <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/> | team pins |
| `MOON_nomenclature_center_pts.zip` | IAU/USGS Gazetteer of Planetary Nomenclature (public domain): <https://planetarynames.wr.usgs.gov> | see `manifest.json` |

`web/data/moonhd/manifest.json` lists every source URL with its full SHA-256 and size, and the SHA-256 and size of every
published file. NASA media are generally not copyrighted; credit lines used on the page: "NASA's Scientific Visualization
Studio", "NASA LRO/LOLA Science Team", "NASA/JPL NAIF". This file does not replace `docs/ASSET_LICENSE_MATRIX.md`; the rows
there are still to be added (left out of this PR to avoid conflicts with the open PRs that edit it).

## Regenerating the data

```bash
python3 -m venv .venv && .venv/bin/pip install numpy pillow tifffile imagecodecs OpenEXR spiceypy
# download the inputs listed in science/build_moon_hd_assets.py into data/raw/ (git-ignored)
.venv/bin/python science/build_moon_hd_assets.py --raw data/raw --out web/data/moonhd
```

The script refuses any input whose SHA-256 differs from the pinned one. Unlike the other `science/` tools it needs
third-party packages. JPEG bytes can differ between Pillow/libjpeg versions, so a rebuild on another machine may change the
JPEG hashes in the manifest; the `.bin` files are deterministic.

## Not done

- No link to this page from the hub or the MoonProof screens.
- The GitHub Pages publish step has to copy `moon-hd.html`, `moon-hd/` and `data/moonhd/` (about 31 MB).
- No Earth texture: the NASA Blue Marble host did not answer on 2026-11-14, so Earth stays a plain sphere.
- Feature names between 80° S and 80.5° S and craters under 20 km are left out to keep the labels readable.
- Not tested on a real phone or on Windows; checked in a desktop Chromium pane and in a 375 px emulated viewport.
- Rows in `docs/ASSET_LICENSE_MATRIX.md` and `data/ASSET_REGISTRY.json`.
