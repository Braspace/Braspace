# BRASPACE — Lunar assets, rights, NASA data and map sources

Research lead: @maccachera (#55, #61). Engineering lead: @gustavofullstack (#54). API layers: @gfreiresjrp (#57). Status: research only — NOT YET downloaded, ingested, or deployed.

## Source registry

| Source | Official URL | Intended use | Usage/rights caution | Status |
|---|---|---|---|---|
| Google Maps — Moon | https://www.google.com.br/maps/space/moon/ | Navigation/zoom reference, external link | REFERENCE ONLY. Do not scrape, download or redistribute Google Maps imagery/tiles, derive terrain/3D from Google tiles or clone UI | Reference |
| NASA SVS CGI Moon Kit | https://svs.gsfc.nasa.gov/4720/ | Global 3D visual albedo and coarse DEM | Credit NASA Scientific Visualization Studio; read asset-specific conditions and verify checksums | Candidate |
| NASA Moon Image Galleries | https://science.nasa.gov/moon/image-galleries/ | Source discovery and education | Check each asset for third-party restrictions; credit NASA | Candidate |
| LROC Featured Images | https://lroc.im-ldi.com/images | Educational site media and external gallery links | Featured material on LROC website is copyrighted; do NOT blindly rehost | Candidate |
| LROC PDS data | https://pds.lroc.im-ldi.com/ | Scientific georeferenced image assets | LROC PDS released data are public domain according to LROC SOC; cite instrument and NASA/GSFC/ASU | Candidate |
| LROC QuickMap | https://quickmap.lroc.im-ldi.com/ | Reference viewer and map product discovery | Do not copy proprietary presentation/tiles; verify any layer/WMS terms and origin before access | Reference |
| LROC Lunaserv WMS | https://wms.im-ldi.com/ | Optional legal read-only layer integration | Verify documented service, tile cache, user agent, permitted use and attribution | Candidate |
| NASA PDS LOLA | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | Terrain-aware scientific horizon and local mesh | Identify exact product, frame, native resolution, height unit, nodata and SHA-256 | Required — not integrated |
| NAIF SPICE | https://naif.jpl.nasa.gov/naif/ | Moon orientation, solar/terrestrial ephemerides and libration | Record exact kernel set and validate geometry vs JPL Horizons | Required — not integrated |

## Concrete visualization assets

- NASA SVS 2025 color albedo: lroc_color_2k.jpg (2048×1024, approx. 447 KB), with larger 4K/8K TIFF/EXR choices on https://svs.gsfc.nasa.gov/4720/ . A 2K texture is preferred for first paint and performance.
- NASA SVS global displacement/height: ldem_4.tif (1440×720), ldem_16.tif (5760×2880); read the SVS page for map height offset, lunar radius 1737.4 km and encoding. These are coarse visual 3D assets, not precision polar skyline DEM.
- LROC PDS images should be preferred for repository-hosted photo panels when appropriate; LROC Featured pages may be linked directly for reference, not copied as if all images were public domain.
- ALL direct files, allowed uses, download date, credits, checksums, and coordinate frames MUST be placed in a machine-readable manifest before use.

## Primary licensing and usage policies

- Google Maps Platform policies: https://developers.google.com/maps/documentation/tile/policies — prohibition on scraping/extraction or creating outside-Service derived maps/3D models. Google Moon is **not** a data import source for BRASPACE.
- LROC Terms & Citation: https://lroc.im-ldi.com/about/terms — distinguishes PDS public-domain data from copyrighted Featured/curated website items; educational images credit NASA/GSFC/Arizona State University (or NASA/GSFC/ASU).
- NASA media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/ — generally usable NASA material for informational/educational use with attribution, third-party rights exceptions, and protected NASA logos; do not imply NASA endorses our tool. Special care with SI-generated images.
- CGI Moon Kit source and visual/scientific boundaries: https://svs.gsfc.nasa.gov/4720/ — credits NASA's Scientific Visualization Studio, Ernie Wright and supporting NASA LRO teams.

## Research handoff artifact schema

Record per asset: id, source_landing_page, exact_download_url, original_creator, credit_text, retrieved_at_utc, usage_terms, copyright_status, redistribution_approved, file_size_bytes, sha256, pixels, pixel_resolution_m, coordinate_frame, projection, nodata_value, used_in_app_commit, use_type [visual_only/scientific], validation_status.

**Do not claim "NASA Data used" on the official submission** just because a landing page is listed in this document; it must be consumed in the running scientific/visual product with traceable provenance.

## Blocking tasks

#55 metadata and permissions; #61 region media catalog; #54 original WebGL renderer; #57 source-limited optional map adapter; #56 physical frame and DEM fidelity tests; #59 QA/privacy, image attribution and release.
