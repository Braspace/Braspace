# NASA data sources

Status: source inventory for BS-001. This document records the sources and the
one dataset selected for the first terrain/horizon demonstration. It does not
claim that the BRASPACE application has already integrated NASA data.

Inventory date: 2026-11-14 (America/Sao_Paulo)

## Selected MVP terrain dataset

The selected dataset is the south-polar LOLA gridded digital elevation product:

| Field | Value |
| --- | --- |
| Mission / instrument | NASA Lunar Reconnaissance Orbiter (LRO) / Lunar Orbiter Laser Altimeter (LOLA) |
| Product file | `LDEM_80S_80M.IMG` |
| Product label | `LDEM_80S_80M.LBL` |
| PDS dataset ID | `LRO-L-LOLA-4-GDR-V1.0` |
| Product version | `V2.0` |
| Product type | Gridded Data Record (GDR), shape/radius map |
| Coverage | Lunar south polar region, 80°S to 90°S |
| Resolution | 80 m/pixel by 80 m/pixel, true at the pole |
| Raster dimensions | 7,600 lines × 7,600 samples |
| File size | 115,520,000 bytes |
| Sample type | 16-bit little-endian signed integer (`LSB_INTEGER`) |
| Units | metres relative to the reference radius |
| Scaling | `HEIGHT_m = DN × 0.5` |
| Reference radius | 1,737,400 m |
| Planetary radius | `PLANETARY_RADIUS_m = HEIGHT_m + 1,737,400` |
| Projection | Polar Stereographic |
| Latitude convention | Planetocentric |
| Centre | latitude −90°, longitude 0° |
| Longitude direction | East |
| Body-fixed frame | Mean Earth/Polar Axis of DE421 |
| Map scale | 80 m/pixel |

The authoritative PDS label also reports a binary, pixel-registered image,
height values from −14,592 m to 14,052 m relative to the reference radius,
and a product creation date of 2017-06-15. The label states that the map is
based on LOLA altimetry and that values are relative to a 1,737.4 km reference
radius.

### Local acquisition evidence

The source file supplied for this work is outside the Git repository:

```text
ldem_80s_80m.img
size: 115520000 bytes
SHA-256: e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc
```

The same `.IMG` was downloaded from the PDS URL into a temporary directory and
produced the identical SHA-256. This confirms that the supplied local bytes
match the bytes currently served by the cited PDS URL. The downloaded label was
4,986 bytes and was used to verify the metadata recorded above; neither file is
committed to Git. The `.LBL` must be retained alongside any local copy as the
authoritative interpretation of the binary raster.

Reproducible source URLs:

- [PDS LOLA mission page](https://pds-geosciences.wustl.edu/missions/lro/lola.htm)
- [PDS archived polar IMG directory](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/)
- [IMG file](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img)
- [PDS label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl)
- [PDS XML label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.xml)

Example download commands (do not commit the 115 MB binary to Git):

```bash
mkdir -p data/raw/lola
curl -fL -o data/raw/lola/ldem_80s_80m.img \
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img
curl -fL -o data/raw/lola/ldem_80s_80m.lbl \
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl
sha256sum data/raw/lola/ldem_80s_80m.img
```

## NASA LOLA source and scope

LOLA is the laser altimeter on LRO. The NASA PDS Geosciences Node identifies
the LOLA products as being produced by the LOLA Science Team at NASA Goddard
Space Flight Center and provides archived EDR, RDR, RADR, GDR, SHADR and
SLDEM product families. The PDS archive is a release-based copy; the PDS page
directs users who need the most recent LOLA data to the LOLA Data Node / Lunar
Orbital Data Explorer.

For this MVP, the archived GDR polar product above is the **used/selected
dataset**. The following are **candidate or future references**, not datasets
claimed as currently integrated:

- Higher-resolution polar LOLA products such as 40 m, 20 m, 10 m and 5 m
  products listed in the same PDS directory.
- LOLA RDR point products for a future point-cloud or uncertainty workflow.
- SLDEM products for comparison or validation against a combined SELENE/LRO
  DEM.
- LOLA Data Node / ODE holdings for future updates beyond the archived release.

## Ephemeris and SPICE references (future integration)

These are authoritative candidate resources for BS-004. They are not used by
the terrain file itself and are not evidence that Sun/Earth positions have
already been computed in BRASPACE.

| Resource | Intended use | Status |
| --- | --- | --- |
| [NAIF SPICE Data](https://naif.jpl.nasa.gov/naif/data.html) | Select archived, operational and generic SPICE kernels; record frames and coverage | Candidate reference |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | Generate Sun, Earth and lunar ephemerides through web, command-line or API interfaces | Candidate reference |
| [NAIF SPICE documentation](https://naif.jpl.nasa.gov/naif/documentation.html) | Document time systems, reference frames and kernel usage | Candidate reference |

Kernel selection, time scales, frame conventions and exact query parameters
must be recorded before any illumination or communication result is presented
as scientific output.

## Coordinate and processing cautions

- The raster is not a latitude/longitude array. It is a polar stereographic
  map and must be geolocated using the PDS map-projection metadata.
- Latitude is planetocentric, with the south pole at −90° and positive
  longitude toward the east.
- The stored value is not directly the planetary radius: apply the scaling
  factor first, then add the 1,737,400 m reference radius when a radius is
  required.
- The elevation raster contains terrain only. It does not contain the Sun's
  position, Earth's position, illumination, or communication visibility.
- A horizon calculation must account for the Moon's curvature and must state
  its azimuth sampling, observer height, interpolation method and treatment of
  missing/flagged samples.

## Attribution and licensing note

The PDS label identifies NASA LRO/LOLA, the LOLA team and Goddard Space Flight
Center as the product provenance. This inventory does not assign a separate
license that is not stated by the product label. BRASPACE should retain the
original PDS label, cite the PDS Geosciences Node and NASA/LRO/LOLA provenance,
and verify the applicable PDS/NASA reuse terms before redistributing derived
assets. No NASA endorsement is implied.

## Reproducibility and current limitations

- The repository currently contains no terrain-processing implementation;
  this document is an inventory, not an integration result.
- The large `.IMG` file is intentionally kept outside Git. A future manifest
  should record its URL, checksum, size, product ID and label URL.
- The `.LBL` was downloaded and verified during this review but is not stored
  in this checkout. A future BS-002 evidence package should preserve the label
  and record any PDS-provided checksum or immutable archive reference.
- A checksum alone identifies the local bytes; it does not validate the
  scientific interpretation without the matching PDS label.

## Verified source entries added by BR36 (2026-11-14)

Read from the official pages on 2026-11-14; fields the page does not state are
marked `NÃO VERIFICADO` in `data/ASSET_REGISTRY.json`, where the full entries
(URL, bytes, SHA-256 where downloaded, credit and use sentences) live. None of
these is ingested; `LDEM_80S_80M` remains the only selected terrain dataset.

| Product | Page | Representative file | Registry id |
| --- | --- | --- | --- |
| PGDA 78 high-resolution LOLA topography, 5 m/pix per site | <https://pgda.gsfc.nasa.gov/products/78> | `Site01_final_adj_5mpp_surf.tif` (40,980,810 bytes) | `pgda-78-site01-5mpp-ldem` |
| PGDA 81 south pole LOLA DEM mosaic, 87S-90S, 5 m/pix | <https://pgda.gsfc.nasa.gov/products/81> | `ldem_87s_5mpp.tif` (3,465,285,714 bytes) | `pgda-81-south-pole-87s-mosaic-5mpp` |
| PGDA 69 lunar polar illumination (average Sun, 60 m/px) | <https://pgda.gsfc.nasa.gov/products/69> | `AVGVISIB_85S_060M_201608.TIF` (33,994,464 bytes, SHA-256 `ccf67d4f...b05806`) | `pgda-69-avgvisib-85s-60m` |
| NASA SVS 5127 | <https://svs.gsfc.nasa.gov/5127> | `lola_sp_still_print.jpg` | `nasa-svs-5127-lola-south-pole-coded-color` |
| LROC curated NAC south pole mosaic / polar illumination map | <https://lroc.im-ldi.com/images/downloads> | `NAC_POLE_P900S0000.zip`, `LROC_Polar_Illumination_Map.tif` | `lroc-curated-*` |
| SLDEM2015 (not for the pole: +/-60 deg only) | <https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m> | none | `usgs-sldem2015-60n60s-not-polar` |

`data/manifest.json` is unchanged: its schema and `api/cmd/verifylola/data_contract_test.go`
describe one dataset (`LDEM_80S_80M`).
