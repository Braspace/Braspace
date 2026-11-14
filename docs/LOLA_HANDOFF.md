# BS-038 — LOLA data handoff to Go and Rust owners

Source: `data/manifest.json`; verify local bytes with `python3 scripts/verify_lola.py /path/to/ldem_80s_80m.img`. The binary stays outside Git. The selected product is PDS `LRO-L-LOLA-4-GDR-V1.0`, version V2.0; source URL, 115,520,000-byte size and SHA-256 are pinned in the manifest. The PDS `.LBL` is the interpretation authority.

Rust owner: read exactly 7600 × 7600 signed little-endian 16-bit values, row major, with 15,200 bytes per line. Convert `height_m = DN × 0.5`; add 1,737,400 m only when planetary radius is required. Geolocate with the label's polar stereographic parameters, including pixel registration and projection offsets. Establish no-data/coverage handling and compare transformed control points independently before producing a skyline. Ray tracing must include lunar curvature, observer height, azimuth sampling and an error budget.

Go owner: treat `data/manifest.json` as server-side provenance; never accept a caller-supplied product name as verified source evidence. The current `/v1/visibility` requires `frame: "MOON_ME"` and always returns `UNVERIFIED_INPUTS`; this generic token is insufficient to prove equality with the raster's `MEAN EARTH/POLAR AXIS OF DE421`. Agree on a versioned, explicit frame identifier and transform before changing the science status. The CLI JSON protocol and existing Go/Rust tests are engineering bootstrap tests only.

Renderer owner: the low-bandwidth NASA SVS 2K candidate and required credit are in `data/ASSET_REGISTRY.json`. This is a visual map, not a polar science DEM. The external-link gallery is in `data/LUNAR_GALLERY.json`.

Acceptance still requiring human owners: Joel and Gabriel Freire must confirm acquisition, coordinate convention and API contract; then provide a reviewed PR, real-data test output and scientific limitations. No acknowledgment or scientific integration is claimed here.
