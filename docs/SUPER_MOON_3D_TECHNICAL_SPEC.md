# BRASPACE Super Moon 3D — Original lunar navigator specification

**Implementation owner:** @gustavofullstack (#54) · **Scientific signoff:** @joeljato (#56) · **NASA/LROC assets:** @maccachera (#55/#61) · **Optional API:** @gfreiresjrp (#57) · **Product UX:** @lisanogueira (#60) · **QA:** @Ninzinhu (#59).

## Product scope — NOT YET IMPLEMENTED

A high-quality **original** browser 3D Moon with NASA-source textures and local polar DEM scientific data. Google Moon and LROC QuickMap are **reference experiences**, **not a database to scrape** nor a template to replicate pixel-for-pixel. Our interface belongs to BRASPACE.

### Renderer / scene design

- Frontend: TypeScript and Three.js/WebGL 2 with orbit controls, WebGL context-loss recovery, mobile pointer/touch and keyboard alternatives. Use one shared strongly-typed `LunarSite` and `MissionScenario` state across Explore, Compare and Recover. Avoid duplicate or divergent calculations in browser and Go/Rust science API.
- **Global aesthetic globe:** NASA SVS CGI Moon Kit 2025 color map `lroc_color_2k.jpg` (2K, low-bandwidth LOD) and optional higher-res assets after explicit rights, download integrity and performance checks. https://svs.gsfc.nasa.gov/4720/ . Treat this as *visual context*.
- **Global elevation mesh:** NASA SVS LOLA displacement `ldem_4.tif` or 16 px/degree only where properly decoded and rescaled to reference lunar radius 1737.4 km; these coarse assets are insufficient for fine south-pole horizon science.
- **High-detail polar scientific surface:** separate, source-verified LRO/LOLA polar DEM (PDS/PGDA); tile window, units, frame, latitude/longitude convention, epoch, resolution, nodata and checksum. Geometry/horizon produced by verified Rust/Go scientific pipeline, never inferred from RGB/illustrative texture.
- **Local terrain scene:** separate small terrain patch around an actual candidate site with sampled mesh and documented terrain interpolation; Sun/Earth markers projected from the same validated ephemeris, with ground truth label.
- **Scene labels:** Sun and Earth visible/occluded, terrain obstruction angle, current lunar position, scenario UTC and source/validation status. Display placeholders without fictional precision if NASA source data is absent.
- **Performance:** load 2K first, 4K optional, cap GPU memory/draw calls, frustum culling, image compression only with rights, observe reduced-motion and 2D fallback for low-end/mobile/no WebGL. Log basic LCP/FPS on supported test devices.
- **Coordinates:** east-positive lunar longitude, latitude from -90 to +90; document frame `MOON_ME`, Moon fixed radius conventions, UV seam and proper pole orientation; zoom does **not** change science results.

### User interaction / overlays

1. **Global 3D Globe** with rotation, pinch zoom, site pins, safe camera reset and optional 2D map.
2. **Candidate landing sites** (sourced latitude/longitude and site geometry), searchable and 2–4 comparable.
3. **Sun/Earth horizon**: azimuth/elevation, local skyline with limb/occlusion conditions and time cursor.
4. **Terrain/slope**: local scientifically grounded DEM patch, separate color vs relief products and resolution indicator.
5. **Lighting/communication timelines**: use only real computed data from Go/Rust NASA-verified pipeline when available, otherwise neutral unavailable state.
6. **Recovery**: input a delay or hardware change, recompute rather than substituting estimates, show A/B, violated constraint and distance to thresholds.
7. **Evidence**: product IDs, URLs, NASA sources, frame, local height, time standard, data status and uncertainty caveats.
8. **Media**: clickable NASA/LROC image cards, with proper license/credit and a link to primary source.

### Architecture (to implement; separated from scientific scope)

```
LRO/LOLA DEM + NAIF/SPICE ----> Verified preprocessing / Rust science
              |                          |
NASA SVS visual textures      Go /v1/scenarios (typed versioned JSON)
              |                          |
Three.js 3D visualization <--- validated visibility/timeline
              |
Explore / Compare / Recover / Reports / Evidence
```

Prefer standalone WebGL scene code and typed feature modules over cloning existing competitors. Validate real assets before embedding; avoid deep-linking remote imagery in production without permission, reliable caching strategy and CSP review.

### Never do these

- Scrape, bulk download or reuse Google Maps Moon imagery/tiles outside permitted Google Maps service or copy its UI exactly; refer to https://developers.google.com/maps/documentation/tile/policies .
- Present NASA SVS **color map** as precise physical elevation, or show fictional dynamic shadows as verified.
- Download/rehost copyrighted LROC Featured Images without rights review.
- Use NASA insignia on AI-generated artwork or imply NASA certifies BRASPACE's scientific outputs.

### P0 sprint / P1 expansion

**P0**: basic textured 3D Moon with two test pins; verified mapped coordinate inputs; renderer responsive + no-WebGL fallback; science badge visible; one NASA-sourced image and clear credit. **P1**: polar DEM patch mesh, physically consistent Sun/Earth, shadows, 4K LOD, layer picker, animated timeline and media gallery. If no actual source and validation, ship **2D and honest limitations**, not invented flight-grade 3D.

**Ready-to-review PR:** code + source attribution manifest + screenshot + page speed/test artifacts + developer instructions + documented source/precision limitations. None of these are DONE solely by publishing this spec.
