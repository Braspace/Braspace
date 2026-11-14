# Moon HD viewer (`web/moon-hd.html`)

Owner: @joeljato. Status: **visual product, not independently validated, not a NASA product.**

A static page (no API calls) with two views that share one clock:

| View | What is drawn | Data |
|---|---|---|
| Globe | Whole Moon, LROC WAC colour, relief from LOLA 16 px/deg (normal map + displacement), lit from the sub-solar direction | `color_4k.jpg` / `color_8k.jpg`, `normal_4k.jpg`, `height_2k.jpg` |
| South pole · LOLA 80 m | 164 km × 164 km around the pole at native 80 m, true scale, lunar curvature included, terrain shadows marched toward the Sun in the fragment shader | `south_pole_80m.bin` |

The clock covers the same window as the site series (hourly, from 2025-01-01, 35,064 samples). The sub-solar and
sub-Earth points come from `ephemeris.bin`.

Open locally: `cd web && node dev-server.mjs`, then `/moon-hd.html`. Deep links: `?view=pole`, `?t=2026-11-14T12:00:00Z`, `?lang=pt`.

## What is real and what is a display choice

| Item | Status |
|---|---|
| Terrain heights at the pole | Unmodified LOLA DNs (`LDEM_80S_80M`, same SHA-256 the team pinned), centre crop, no resampling |
| Sub-solar / sub-Earth points | NAIF SPICE (DE440, `MOON_ME_DE440_ME421`, LT+S, centres of Sun and Earth, observer at the Moon centre), 0.01° quantisation, linear interpolation between hourly samples |
| Polar shadows | Geometric. Only terrain inside the 164 km grid casts shadows (a peak outside it does not). 144 samples per ray (72 on phones), spacing grows with distance, so a narrow distant peak can be missed. The penumbra is a smooth step across the 0.53° solar disc, not an integration of the disc |
| Globe relief | Exaggerated (slider, default ×4). 16 px/deg is about 1.9 km per pixel at the equator |
| Brightness | Lunar-Lambert blend chosen for looks; no calibrated photometry. Earthshine on the night side is decorative |
| Stars | NASA SVS Deep Star Maps 2020; **not** oriented relative to the Moon. Decorative |
| Sun and Earth in the sky | Correct direction and angular size; not at true distance. Earth is a plain shaded sphere |

No landing metric is computed on this page.

## Cross-check with the site series

`web/tests/moon-hd.test.mjs` compares, for Connecting Ridge and Peak Near Shackleton, whether the Sun's centre is above the
terrain according to (a) the team series (`science/three_site_pipeline.py`: Sun seen from the site with `spkcpo`, against a
360-azimuth LOLA horizon) and (b) the viewer's ray march toward the sub-solar direction (`sunClearance` in
`web/moon-hd/polar-math.js`, a CPU copy of the shader). Samples within 0.3° of the horizon are left out.

Measured on 2026-11-14, one sample every 37 hours over the four years:

| Site | Compared | Agree | Disagree |
|---|---|---|---|
| Connecting Ridge | 811 | 784 (96.7 %) | 27, all "series says lit, viewer says shadow" |
| Peak Near Shackleton | 804 | 794 (98.8 %) | 10, same direction |

At the three samples printed during the check for Connecting Ridge, the margin above the horizon differed by 0.02°, 0.00° and 0.14°.
Both computations use the same LOLA file and the same kernels, so this shows the two implementations agree with each other;
it is not a validation against an independent reference. The cause of the remaining disagreements has not been investigated.

## Sources and licences

| File | Source | SHA-256 of the source |
|---|---|---|
| `lroc_color_poles_8k.tif` | NASA SVS 4720, CGI Moon Kit: <https://svs.gsfc.nasa.gov/4720> | `4af8b0cd…dce43bad796` → see `manifest.json` |
| `ldem_16.tif` | NASA SVS 4720, CGI Moon Kit (LOLA) | see `manifest.json` |
| `starmap_2020_4k.exr` | NASA SVS 4851, Deep Star Maps 2020: <https://svs.gsfc.nasa.gov/4851> | see `manifest.json` |
| `ldem_80s_80m.img` | PDS Geosciences Node, LRO-L-LOLA-4-GDR-V1.0 | `e6591eee…8ff65fdc` (team pin) |
| NAIF kernels | <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/> | team pins |

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
- The GitHub Pages publish step has to copy `moon-hd.html`, `moon-hd/` and `data/moonhd/` (about 24 MB).
- Not tested on a real phone or on Windows; checked in a desktop Chromium pane and in a 375 px emulated viewport.
- Rows in `docs/ASSET_LICENSE_MATRIX.md` and `data/ASSET_REGISTRY.json`.
