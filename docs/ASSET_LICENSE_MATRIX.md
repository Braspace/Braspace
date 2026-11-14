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
