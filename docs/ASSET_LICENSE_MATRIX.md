# BS-052 — Lunar imagery, 3D assets and licensing matrix

Status: curated asset registry and licensing review.

Review date: 2026-11-14 (America/Sao_Paulo)

Machine-readable registry: [`data/ASSET_REGISTRY.json`](../data/ASSET_REGISTRY.json)

## Decision summary

The NASA SVS CGI Moon Kit is the current handoff candidate for the renderer.
Its 2K color map is small enough for a low-bandwidth visual asset and was
downloaded temporarily to verify its exact bytes. The 4K color map and the
global LOLA-derived displacement render were also verified temporarily, but
none of the binary assets are committed to Git.

The selected assets are rendering aids, not the BRASPACE scientific terrain
source. The scientific south-pole DEM remains the verified LOLA GDR documented
in `data/LOLA_80S_80M_VERIFICATION.md`.

## Asset classes

| Class | Example | Registry status | Handling |
| --- | --- | --- | --- |
| NASA SVS CGI Moon Kit | `lroc_color_2k.jpg`, `lroc_color_16bit_srgb_4k.tif` | `approved_candidate` | May be handed to the renderer with NASA SVS, NASA/GSFC and source credits after project review |
| NASA SVS LOLA-derived global render | `ldem_4.tif` | `approved_candidate` | Visualization only; do not present as the 80 m/pixel polar LOLA science raster |
| LROC PDS product | PDS archive product | `source_approved_product_specific_review_required` | Public-domain status is stated by LROC terms for PDS data; record exact product ID, label, checksum and citations before use |
| LROC website Featured Image | Page 1276 | `external_link_only` | Do not copy/rehost the website image; link to the page and credit NASA/GSFC/ASU |
| QuickMap/Lunaserv | Interactive service | `service_link_only` | Use for discovery or validation; do not treat service responses as repository assets |
| Google Map/Moon tiles | Google Maps Tile API content | `rejected` | No bulk fetching, scraping, offline storage or rehosting |
| BRASPACE polar elevation map (derived) | `web/assets/polar-elevation-87s.webp` + `.json` | `project_derived_from_nasa_pds` | Our render of LRO LOLA `LDEM_80S_80M.IMG` (PDS, SHA-256 in `data/manifest.json`) by `science/render_polar_map.py`; credit "NASA/GSFC/LOLA" shown in the component; elevation only, not illumination or visibility |
| BRASPACE terrain backgrounds (derived) | `web/moonproof/assets/terrain-shade-87s`, `terrain-shade-84s`, `terrain-altitude-87s` (`.webp` + `.json`) | `project_derived_from_nasa_pds` | Our hillshade/altitude-tint render of LRO LOLA `LDEM_80S_80M.IMG` (SHA-256 in `data/manifest.json`, checked) by `science/render_terrain_backgrounds.py`; shading light is synthetic, not a real illumination state; PRELIMINARY visual context, not AI-generated; credit "NASA/GSFC/LOLA" |
| IAU/USGS Gazetteer of Planetary Nomenclature (Moon, centre points) | `web/moonproof/data/features.json` (35 features, centre latitude <= -84) | `public_domain_source_cited` | Shapefile `MOON_nomenclature_center_pts.zip` (https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip), metadata pubdate 2012-10-02, "Public domain"; accessed 2026-11-14 UTC (`accessed_utc` in the JSON). Official names and centre coordinates used as map labels only; no physical value derived; each feature keeps its USGS Feature URL. Credit "IAU Gazetteer of Planetary Nomenclature / USGS" |
| PGDA 78 5 m site LDEMs | `Site01_final_adj_5mpp_surf.tif` | `review_required` | Candidate high-res terrain; page states no data license, only NASA Reproduction Guidelines link; cite Barker et al. 2021. Not rehosted |
| PGDA 81 south pole 87S mosaic | `ldem_87s_5mpp.tif` (3.3 GB) | `review_required` | Page asks citation of Barker et al. 2021; no data license stated. Not rehosted |
| PGDA 69 polar illumination | `AVGVISIB_85S_060M_201608.TIF` | `review_required` | Page asks citation of Mazarico et al. 2011; no data license stated. Candidate benchmark, not ingested |
| NASA SVS 5127 | `lola_sp_still_print.jpg` | `approved_candidate` | Credit "NASA's Scientific Visualization Studio" (page). Visual target only |
| LROC curated downloads | `NAC_POLE_P900S0000.zip`, `LROC_Polar_Illumination_Map.tif` | `external_link_only` | Website-curated products are copyrighted per LROC terms; link and credit NASA/GSFC/Arizona State University |
| LROC Featured Image 237 | WAC south polar mosaic page | `external_link_only` | Already in `LUNAR_GALLERY.json`; do not rehost |
| SLDEM2015 (USGS/PGDA 54) | `Lunar_LRO_LOLAKaguya_DEMmerge_60N060S_512ppd.tif` | `review_required` | Covers only +/-60 deg latitude: not usable at the pole |

## NASA SVS CGI Moon Kit

Source page: <https://svs.gsfc.nasa.gov/4720/> (SVS item ID 4720, last updated
2026-01-09).

The page identifies the maps as designed for 3D rendering, credits NASA's
Scientific Visualization Studio, names Ernie Wright as visualizer and Noah
Petro as scientist, and identifies the LROC WAC Color Mosaic as an underlying
dataset collected by Arizona State University. It also explicitly says the
color map is optimized for aesthetics rather than science.

Required credit for the renderer handoff:

```text
NASA Scientific Visualization Studio; visualizer Ernie Wright;
scientist Noah Petro (NASA/GSFC); source LROC WAC Color Mosaic,
Arizona State University.
```

The registry records exact bytes and SHA-256 for:

- `lroc_color_2k.jpg` — 2048×1024, 457,942 bytes.
- `lroc_color_16bit_srgb_4k.tif` — 4096×2048, 61,891,324 bytes.
- `ldem_4.tif` — 1440×720, 4,153,352 bytes.

The SVS page says its displacement maps were derived from LOLA gridded data,
but the global cylindrical render must not be confused with the selected
south-pole polar-stereographic GDR. For scientific calculations, use the PDS
LOLA product and its label.

## LROC PDS versus LROC website showcase

LROC's terms distinguish PDS-delivered data from website content:

- Products available through the LROC PDS or NASA PDS interfaces are stated to
  be public domain.
- Featured Images, Featured Sites, curated downloads and other non-PDS website
  interfaces are stated to be copyrighted.
- Educational use of website images is encouraged when properly cited, but that
  does not turn the website image into a freely redistributable repository
  asset.
- Commercial use of non-PDS LROC images requires prior permission.

For this reason, the representative page
<https://lroc.im-ldi.com/images/1276> is registered as an external link only.
No image bytes were copied. If engineering needs an image, select the exact
corresponding PDS product, record its product ID and label, verify its terms,
and add its checksum before handoff.

Required LROC educational credit:

```text
NASA/GSFC/Arizona State University
```

## NASA media and third-party assets

NASA media guidance generally allows factual educational/informational use of
NASA content with acknowledgment, but NASA insignia, logotypes and identifiers
are protected. NASA-hosted pages may also contain third-party copyrighted
material. BRASPACE must retain the specific credit and not imply NASA
endorsement.

Sources:

- [LROC Terms and Citation](https://lroc.im-ldi.com/about/terms)
- [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/)
- [LROC PDS archive](https://pds.lroc.im-ldi.com/)
- [LROC QuickMap](https://quickmap.im-ldi.com/)
- [LROC Lunaserv](https://wms.im-ldi.com/)

## Google tile exclusion

Google Maps Platform policies restrict exporting, extracting, scraping,
pre-fetching, indexing, storing or redistributing Google Maps content outside
the service. BRASPACE therefore has not fetched or cached Google Moon/Maps
tiles and will not use them as a source for a local renderer, DEM, terrain
model or scientific analysis.

Source: [Google Maps Tile API Policies](https://developers.google.com/maps/documentation/tile/policies).

## Handoff status

The renderer owner can use `nasa-svs-cgi-moon-kit-lroc-color-2k-2025` as the
first low-bandwidth visual handoff candidate, subject to team review of the
credit text. The registry supplies the exact URL, dimensions, bytes and
checksum. It is not a scientific result and does not represent polar terrain
resolution.

## Assets exposed by the API layer catalog (BS-054, #57)

`GET /api/layers` and `GET /api/sites/{id}/media` expose only the entries below.
Each row keeps the handling decided above.

| Asset | API entry | Status | Handling in the API | Credit |
| --- | --- | --- | --- | --- |
| `lroc_color_2k.jpg` (SVS 4720) | layer `lroc-color-2k` | `approved_candidate` | Same-origin copy for the 3D globe: fetched only from the SVS URL, served only if size, type and SHA-256 `f7130a18…` match; visualization only | NASA SVS; Ernie Wright; Noah Petro (NASA/GSFC); LROC WAC Color Mosaic, ASU |
| `moon_small.glb` (SVS 14959) | layer `svs-14959-moon-small-glb` | `approved_candidate` | Same-origin copy for the 3D globe: fetched only from the SVS URL, written to a disk cache while size (13,799,876 bytes) and SHA-256 `12d3b0bb…` are checked, then streamed (never whole in memory); color map on a sphere, no topography; visualization only, shows no illumination or visibility. The grid (`Moon_NASA_LRO_15k_Grid_Small.glb`), topography (`…8k_Topo…`) and `.usdz` files are NOT used | NASA's Goddard Space Flight Center; NASA SVS 14959; LRO imagery; color source CGI Moon Kit (SVS 4720) |
| `ldem_4.tif` (SVS 4720) | layer `lola-dem-4ppd-render` | `approved_candidate` | Metadata and link only, never served; visualization only | NASA SVS; LRO LOLA |
| `LDEM_80S_80M.IMG` (PDS `LRO-L-LOLA-4-GDR-V1.0`, V2.0) | layer `lola-ldem-80s-80m` | science source | Metadata and PDS link only; consumed offline by the science pipeline; never served or rendered as imagery. The label states no separate license: keep PDS/NASA/LOLA attribution and check reuse terms before any redistribution | LOLA Science Team, NASA GSFC; PDS Geosciences Node |
| LROC Featured Image 1276 (M1407524099LR) | media `LROC-1276` | `external_link_only` | Link to the LROC page only; no site association | NASA/GSFC/Arizona State University |
| LROC Featured Image 1247 (M1348682369LR) | media `LROC-1247` | `external_link_only` | Link only; related to `connecting-ridge` | NASA/GSFC/Arizona State University |
| LROC Featured Image 1294 (M1432398306LR) | media `LROC-1294` | `external_link_only` | Link only; related to `malapert-massif` | NASA/GSFC/Arizona State University |
| LROC Featured Image 237 | media `LROC-237` | `external_link_only` | Link only; regional overview, no site association | NASA/GSFC/Arizona State University |
| LROC Featured Image 1105 | media `LROC-1105` | `external_link_only` | Link only; related to `connecting-ridge` | NASA/GSFC/Arizona State University |

Website Featured Images stay copyrighted LROC content: the API returns links and
credits, never image bytes or thumbnails (`data/LUNAR_GALLERY.json` thumbnail policy).

## BS-052 acceptance mapping

- Source manifest: `data/ASSET_REGISTRY.json` contains exact URLs, IDs, bytes,
  dimensions, SHA-256, credits, use status and review date.
- NASA SVS 2K/4K albedo and LOLA-derived DEM renders: recorded and verified.
- Polar science DEM distinction: recorded; the SVS global render is not the
  selected polar GDR.
- LROC PDS versus website showcase: explicitly separated.
- Google restriction: no tiles downloaded or rehosted; policy recorded.
- Renderer handoff: 2K SVS asset identified as the low-bandwidth candidate.
- Scientific status: no asset is claimed as consumed by a running renderer.

## MoonProof v3 fonts (web/moonproof/fonts/, BR91)

| Asset | Source | License | Files (SHA-256) | Use |
|---|---|---|---|---|
| Manrope 400/500/600/700/800, latin subset | npm `@fontsource/manrope` 5.3.0 (files extracted with `npm pack`; not a dependency). Copyright 2019 The Manrope Project Authors | SIL OFL 1.1 (`web/moonproof/fonts/OFL-Manrope.txt`) | see `sha256sum web/moonproof/fonts/*.woff2` (BR91 relato) | UI text, self-hosted (`font-src 'self'`) |
| IBM Plex Mono 400/600, latin subset | npm `@fontsource/ibm-plex-mono` 5.3.0. Copyright 2017 IBM Corp. | SIL OFL 1.1 (`web/moonproof/fonts/OFL-IBMPlexMono.txt`) | see `sha256sum` (BR91 relato) | coordinates, hashes, seals |

Fonts are redistributed unmodified with their license; OFL allows bundling with software. Reserved Font Names are not used for derivatives.

## Moon HD viewer and page backdrop (web/data/moonhd/, PR #216)

These are project-derived files built by `science/build_moon_hd_assets.py` from the public NASA sources pinned in
`web/data/moonhd/manifest.json`. Unlike the candidates above, they are committed to the repository (about 31 MB) and
served by the static front: the viewer `web/moon-hd.html` uses all of them; the page backdrop
(`web/moon-hd/backdrop.js`) uses the colour, normal, height and star maps, `south_pole_320m.bin` and `ephemeris.bin`.
Display only: not independently validated, not a NASA product, not endorsed by NASA. NASA media are generally not
copyrighted; keep the credit lines. Details and limits: `docs/MOON_HD.md`.

| Asset | Registry entry | Status | Source | Credit | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `color_4k.jpg` (Moon HD) | `braspace-moonhd-color-4k` | `project_derived_from_nasa_svs` | https://svs.gsfc.nasa.gov/4720/ | NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LROC WAC colour mosaic (Arizona State University). Resampling: BRASPACE (science/build_moon_hd_assets.py). | `4d579d6e85e1f81e95ec8b9922f6fde251ec3ba8e63c8f3ce30c002abd99203c` |
| `color_8k.jpg` (Moon HD) | `braspace-moonhd-color-8k` | `project_derived_from_nasa_svs` | https://svs.gsfc.nasa.gov/4720/ | NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LROC WAC colour mosaic (Arizona State University). Resampling: BRASPACE (science/build_moon_hd_assets.py). | `5b8c60f57ef2b4f9c27b1eb3e73d2a9c472458dcd7a7c5f4e561ed8214aa3056` |
| `height_4k.jpg` (Moon HD) | `braspace-moonhd-height-4k` | `project_derived_from_nasa_svs` | https://svs.gsfc.nasa.gov/4720/ | NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LOLA 16 px/deg elevation (ldem_16.tif). Resampling: BRASPACE (science/build_moon_hd_assets.py). | `1b427d5c427dd58b74fdb85ff7ba3abfd2e7872d92c598818c969cd6064b7388` |
| `normal_4k.jpg` (Moon HD) | `braspace-moonhd-normal-4k` | `project_derived_from_nasa_svs` | https://svs.gsfc.nasa.gov/4720/ | NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LOLA 16 px/deg elevation (ldem_16.tif). Resampling: BRASPACE (science/build_moon_hd_assets.py). | `c8c7ab2e69edb179dabc5237bfd7476bdcffb591e943e0d85b9931a2ebee4837` |
| `stars_4k.jpg` (Moon HD) | `braspace-moonhd-stars-4k` | `project_derived_from_nasa_svs` | https://svs.gsfc.nasa.gov/4851/ | NASA's Scientific Visualization Studio (Deep Star Maps 2020, SVS 4851). Tone mapping: BRASPACE (science/build_moon_hd_assets.py). | `4328f598aade1a7fb868dd62d382d317e2fd214f1520d0faf0d155e8944f7bda` |
| `earth_2k.jpg` (Moon HD) | `braspace-moonhd-earth-2k` | `project_derived_from_nasa_blue_marble` | https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ | NASA Earth Observatory, Blue Marble Next Generation (December 2004 composite with topography and bathymetry). Resampling: BRASPACE (science/build_moon_hd_assets.py). | `5189fd3cebb90cf48495ae98aa92d6c695be9c776a9b3b7ab003ef6102834d97` |
| `south_pole_80m.bin` (Moon HD) | `braspace-moonhd-south-pole-80m` | `project_derived_from_nasa_pds` | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | Elevation: NASA LRO/LOLA Science Team, PDS Geosciences Node (LRO-L-LOLA-4-GDR-V1.0, LDEM_80S_80M). Centre crop: BRASPACE (science/build_moon_hd_assets.py). | `a1244e43cb392feb55aa63ee2289de5a7a098847f2511ce5fba2fcafceccf23c` |
| `south_pole_320m.bin` (Moon HD) | `braspace-moonhd-south-pole-320m` | `project_derived_from_nasa_pds` | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | Elevation: NASA LRO/LOLA Science Team, PDS Geosciences Node (LRO-L-LOLA-4-GDR-V1.0, LDEM_80S_80M). 4 x 4 block mean: BRASPACE (science/build_moon_hd_assets.py). | `2c44c11438246c878d82841047b859fcd394eccac0b61ca64a21746a5c1d0299` |
| `ephemeris.bin` (Moon HD) | `braspace-moonhd-ephemeris` | `project_derived_from_naif_spice` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | NASA/JPL NAIF SPICE generic kernels (DE440). Computation: BRASPACE (science/build_moon_hd_assets.py). | `bb2e7661e9de2c250543b237b5021692af4840a4abb32f0598c554774ad6044d` |
| `earth_orientation.bin` (Moon HD) | `braspace-moonhd-earth-orientation` | `project_derived_from_naif_spice` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | NASA/JPL NAIF SPICE generic kernels (DE440). Computation: BRASPACE (science/build_moon_hd_assets.py). | `80449193e0376819eacf35178c9632cde6e304c53c9254fb2afe7d62ec307073` |
| `features.json` (Moon HD) | `braspace-moonhd-features` | `public_domain_source_cited` | https://planetarynames.wr.usgs.gov/ | IAU Gazetteer of Planetary Nomenclature, USGS Astrogeology Science Center. Source file MOON_nomenclature_center_pts.zip (public domain). | `62361ecd3b0002b2be9c4efe9526df6ec0203e4bd1fca882b093ce36e7276826` |
| `manifest.json` (Moon HD) | `braspace-moonhd-manifest` | `project_metadata` | docs/MOON_HD.md | BRASPACE (science/build_moon_hd_assets.py). | `baab41d5f7f8a2e9f7fedcf7c18f1d391f018e5b73dfd13d8753dae4a5915ccc` |
| `pole-preview.webp` (Moon HD) | `braspace-moonhd-pole-preview` | `project_derived_from_nasa_pds` | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | NASA LRO/LOLA Science Team; Moon HD terrain integration Joel (@joeljato), BRASPACE; offline CPU preview BRASPACE. | `9eacf3af78202bb35ee41d5c795621ecb1cf168a30260e5cda39f26eba4e99b7` |
