# BS-005 — Lunar south-pole sites and coordinate provenance

Status: coordinate provenance inventory. The entries below are reference
feature centers and candidate regions; they are not BRASPACE landing
recommendations or validated touchdown points.

Inventory date: 2026-11-14 (America/Sao_Paulo)

## Coordinate convention

The NASA Lunar Surface Data Book states that the coordinates in its south-pole
feature table were generated from DEM files at the NASA GSFC Planetary Geodesy
Data Archive (PGDA). It reports that the center points of the original feature
polygons are accurate to approximately 5–10 m. The NASA NSSDC describes the
planetocentric Mean Earth/Polar Axis Lunar Reference System associated with the
DE421 ephemeris. This is compatible with the coordinate convention recorded in
the LOLA product label.

For this inventory:

- Latitude is planetocentric, in degrees.
- Longitude is east-positive and represented in the source's −180° to +180°
  style where applicable.
- `feature_center` means the center point of a source polygon/feature, not a
  landing ellipse or a selected touchdown coordinate.
- The 5–10 m statement is source accuracy for the feature center points; it is
  not an uncertainty estimate for a spacecraft landing.
- Coordinates must be transformed through the LOLA polar-stereographic map
  projection before raster extraction. They must not be used as direct row and
  column indices.

Sources:

- [NASA Lunar Surface Data Book, ACD-50044 Rev. A, Appendix A2](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf)
- [NASA NSSDC lunar coordinate convention](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html)
- [NASA GSFC PGDA south-pole products](https://pgda.gsfc.nasa.gov/products/78)

## Candidate landing regions

NASA describes the following 13 Artemis III candidate landing regions. NASA
states that each region is approximately 15 km × 15 km and contains multiple
potential landing sites; therefore a region name must not be presented as a
single precise point.

| Candidate region | Coordinate status in BRASPACE |
| --- | --- |
| Faustini Rim A | Region name only; use a cited feature center or polygon when needed |
| Peak Near Shackleton | Region name only; use a cited feature center or polygon when needed |
| Connecting Ridge | Region name only; use a cited feature center or polygon when needed |
| Connecting Ridge Extension | Region name only; use a cited feature center or polygon when needed |
| de Gerlache Rim 1 | Region name only; use a cited feature center or polygon when needed |
| de Gerlache Rim 2 | Region name only; use a cited feature center or polygon when needed |
| de Gerlache-Kocher Massif | Region name only; use a cited feature center or polygon when needed |
| Haworth | Region name only; use a cited feature center or polygon when needed |
| Malapert Massif | Region name only; use a cited feature center or polygon when needed |
| Leibnitz Beta Plateau | Region name only; use a cited feature center or polygon when needed |
| Nobile Rim 1 | Region name only; use a cited feature center or polygon when needed |
| Nobile Rim 2 | Region name only; use a cited feature center or polygon when needed |
| Amundsen Rim | Region name only; use a cited feature center or polygon when needed |

Source: [NASA Marshall candidate-region announcement](https://www.nasa.gov/centers-and-facilities/marshall/the-marshall-star-361/).

## Source feature centers

The table below transcribes the NASA Lunar Surface Data Book's south-pole
feature table. Every coordinate is tagged as a source feature center. The
shorthand is preserved to make the provenance traceable to the document.

| Shorthand | Feature name | Latitude (°) | Longitude (°) | Coordinate role | Source accuracy |
| --- | --- | ---: | ---: | --- | --- |
| DM1 | Amundsen Rim | -84.2287 | 69.44396 | feature_center | approx. 5–10 m |
| DM2 | Nobile Rim 2 | -83.9540 | 58.82206 | feature_center | approx. 5–10 m |
| Haworth | Haworth | -86.7639 | -22.77700 | feature_center | approx. 5–10 m |
| LM1 | Shackleton Rim B | -89.5244 | 56.30993 | feature_center | approx. 5–10 m |
| LM2 | Shoemaker Rim A | -88.0792 | 11.88866 | feature_center | approx. 5–10 m |
| LM3 | Shoemaker Rim B | -88.3828 | 16.58734 | feature_center | approx. 5–10 m |
| LM4 | Shoemaker Rim C | -88.9645 | 37.23483 | feature_center | approx. 5–10 m |
| LM5 | Shoemaker Rim D | -88.6320 | 74.62375 | feature_center | approx. 5–10 m |
| LM6 | Shoemaker Rim E | -87.9458 | 71.27421 | feature_center | approx. 5–10 m |
| LM7 | Faustini Rim A | -87.8897 | 90.00000 | feature_center | approx. 5–10 m |
| LM8 | Shoemaker Rim F | -87.3417 | 60.25512 | feature_center | approx. 5–10 m |
| NPA | Cabeus Exterior Wall 1 | -86.9243 | -71.56510 | feature_center | approx. 5–10 m |
| NPB | Amundsen 1 | -83.9046 | 89.53545 | feature_center | approx. 5–10 m |
| NPC | Idel'son L Crater 1 | -84.5397 | 126.90450 | feature_center | approx. 5–10 m |
| NPD | Malapert Crater 1 | -84.8034 | 8.387032 | feature_center | approx. 5–10 m |
| R01 / Site01 | Connecting Ridge | -89.4632 | -137.49000 | feature_center | approx. 5–10 m |
| R04 / Site04 | Shackleton Rim | -89.7668 | -171.87000 | feature_center | approx. 5–10 m |
| R06 / Site06 | Nobile Rim 1 | -85.4381 | 37.36667 | feature_center | approx. 5–10 m |
| R07 / Site07 | Peak Near Shackleton | -88.8110 | 123.69010 | feature_center | approx. 5–10 m |
| R11 / Site11 | de Gerlache Rim 1 | -88.6834 | -67.93210 | feature_center | approx. 5–10 m |
| R20 / Site20 | Leibnitz Beta Plateau | -85.4266 | 31.74276 | feature_center | approx. 5–10 m |
| R20v2 / Site20v2 | Leibnitz Beta Plateau, extended boundaries | -85.4266 | 31.74276 | feature_center | approx. 5–10 m |
| R23 / Site23 | Malapert Massif | -85.9948 | -0.23578 | feature_center | approx. 5–10 m |
| R42 / Site42 | de Gerlache-Kocher Massif | -85.8296 | -116.32200 | feature_center | approx. 5–10 m |
| Shoemaker | Shoemaker | -87.1835 | 62.83502 | feature_center | approx. 5–10 m |
| SL2 | de Gerlache Rim 2 | -88.2300 | -64.62840 | feature_center | approx. 5–10 m |
| SL3 | Connecting Ridge Extension | -89.0324 | -101.99900 | feature_center | approx. 5–10 m |

## Use in BRASPACE

The table is suitable as a provenance-backed input list for later comparison,
but it is not yet a computational site model. Before a coordinate is used by
the application, the implementation must record:

1. The source row and document revision.
2. Whether the user selected a feature center, polygon, landing ellipse or
   another point.
3. The coordinate frame and longitude normalization.
4. The raster transformation parameters used to map the coordinate to LOLA.
5. The elevation sample, interpolation method and any no-data handling.
6. The uncertainty propagated into the result.

No site in this file is labeled “best,” “safe,” or “validated for landing.”

## BS-005 acceptance mapping

- Site table: source feature centers and NASA candidate region names recorded.
- Coordinate provenance: source document, PGDA origin and DE421 ME/PA context recorded.
- Uncertainty: approximately 5–10 m feature-center accuracy recorded and kept
  separate from landing uncertainty.
- Naming distinction: region names, feature centers and exact touchdown points
  are explicitly separated.
- Scientific status: no landing recommendation claimed.
