# BS-006 — Dataset, code and external-asset attribution

Status: attribution and licensing inventory for BRASPACE.

Inventory date: 2026-11-14 (America/Sao_Paulo)

This report records the current sources and the attribution rules that apply to
them. It does not grant rights beyond the terms of the original source and does
not imply NASA endorsement.

## Asset inventory

| Asset / source | Current use in repository | Provenance | Required handling | Status |
| --- | --- | --- | --- | --- |
| BRASPACE source code and documentation | `README.md`, `data/` and `docs/` files | Braspace | Preserve the repository MIT notice in `LICENSE` | In repository |
| NASA LRO/LOLA GDR | `LDEM_80S_80M.IMG` is external; metadata and verification are documented | NASA LOLA Science Team / Goddard Space Flight Center / PDS Geosciences Node | Cite NASA, LRO, LOLA and PDS; retain the PDS label; verify applicable reuse terms before redistribution | Selected and verified; binary not committed |
| NASA Lunar Surface Data Book | Coordinate provenance for BS-005 | NASA NTRS, document ACD-50044 Rev. A | Cite document number, revision and source URL; do not convert region names into precise sites without a source coordinate | Referenced |
| NASA GSFC PGDA south-pole products | Origin of feature polygons/center coordinates cited by the Lunar Surface Data Book | NASA GSFC Planetary Geodesy Data Archive | Cite product page and preserve product-specific terms if assets are downloaded | Referenced |
| NAIF SPICE kernels | Candidate ephemeris/frame resources in `data/SPICE_SOURCES.md`; no kernels committed | NASA/JPL Navigation and Ancillary Information Facility | Preserve exact filename, URL, kernel type, coverage and checksum; retain internal kernel comments | Referenced; not integrated |
| JPL Horizons | Future ephemeris query/cross-check | JPL Solar System Dynamics Group | Preserve target, observer, frame, time scale, interval, step, quantities and aberration settings for any query used | Referenced; no query output committed |
| NASA/LROC images or media | None committed or used by the current documents | NASA/GSFC/ASU or other credited provider depending on asset | Follow NASA media guidance and check for third-party copyright notices | Not currently used |
| AI assistance | Documentation drafting assistance only | AI tool used during development | Disclose AI assistance; do not attribute AI-generated content to NASA; validate scientific claims against primary sources | Disclose below |

## Source-specific guidance

### NASA LOLA and PDS data

The LOLA product label identifies the LRO instrument, the LOLA team and NASA
Goddard Space Flight Center. The PDS Geosciences Node is the archive used for
the selected product. The PDS label does not state a separate license in the
fields used by this project; therefore BRASPACE must not invent a license.

The project should:

- Keep the original `.LBL` beside any local binary copy.
- Cite the PDS product URL, dataset ID and product version.
- Preserve the checksum and acquisition date in the manifest.
- Cite NASA/LRO/LOLA/PDS in user-facing scientific output.
- Check the product-specific PDS terms before redistributing derived data.

Sources: [LOLA PDS page](https://pds-geosciences.wustl.edu/missions/lro/lola.htm),
[selected product directory](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/),
and [PDS policies](https://pds.nasa.gov/datastandards/documents/policy/).

### NASA documents and coordinate references

The Lunar Surface Data Book is a NASA NTRS document approved for public
release. BRASPACE should cite its title, document number `ACD-50044`, revision,
page/table and URL whenever its coordinates or terminology are used. The
source's 5–10 m statement applies to feature-center coordinates generated from
source DEM polygons; it does not authorize a landing claim.

Source: [NASA Lunar Surface Data Book Rev. A](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf).

### NAIF SPICE and JPL Horizons

NAIF kernels are scientific data files with their own internal comments and
release context. BRASPACE should preserve the original files' provenance and
checksums rather than retyping or modifying kernel contents. For Horizons,
the query itself is part of the provenance; save the request parameters with
any output used in a scientific result.

Sources: [NAIF SPICE data](https://naif.jpl.nasa.gov/naif/data.html),
[NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/),
and [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/).

### NASA images, logos and identifiers

NASA's media guidance says NASA content is generally usable for educational or
informational purposes when used factually and without implying endorsement,
but NASA insignia, logotype and identifiers are protected and third-party
copyrighted material may appear on NASA websites. BRASPACE should not copy the
NASA logo into the application without checking the specific guidance, and it
must retain the credit of any third-party asset.

Source: [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

## Repository code license

The repository's `LICENSE` file applies the MIT License to BRASPACE code and
documentation copyright 2026 Braspace. This license covers project-authored
materials only; it does not re-license NASA/PDS/NAIF data or third-party
assets.

## AI-content disclosure

AI assistance was used to help organize and draft this documentation. The
scientific values, URLs and interpretations recorded here were checked against
the cited primary NASA/PDS/NAIF sources. No AI-generated terrain, ephemeris,
coordinate or landing recommendation is represented as NASA data, and NASA is
not responsible for AI-assisted content.

## Current external-asset status

- No LOLA binary, SPICE kernel or NASA image is committed to the repository.
- No third-party image, logo or copied external code is currently identified in
  the repository beyond the project-authored files and MIT license.
- Future additions must update this report before being used in the product.
- A later implementation should expose attribution in the UI or documentation
  wherever NASA-derived scientific results are shown.

## BS-006 acceptance mapping

- Dataset provenance: NASA/PDS/LOLA recorded.
- Code license: repository MIT license separated from external data rights.
- External assets: NASA media and third-party copyright handling recorded.
- Kernel/Horizons attribution: NAIF/JPL provenance and reproducibility rules recorded.
- AI disclosure: included, with no NASA endorsement or fabricated validation claim.
