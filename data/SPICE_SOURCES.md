# BS-004 — SPICE and Sun/Earth ephemeris sources

Status: source inventory for future Sun/Earth geometry integration.

Inventory date: 2026-11-14 (America/Sao_Paulo)

This document selects and explains authoritative NAIF/JPL resources. It does
not claim that SPICE or JPL Horizons has already been integrated into BRASPACE,
and it does not present illumination or communication results.

## Recommended baseline kernel set

The recommended baseline is the DE440-based set below. It covers the expected
modern planning interval, contains the Sun, Earth and Moon ephemerides needed
for geometry, and provides a lunar frame variant closely aligned with the
DE421 Mean Earth/Polar Axis frame used by the selected LOLA raster.

| Kernel | Type | Role | Coverage / convention | Status |
| --- | --- | --- | --- | --- |
| `de440s.bsp` | SPK | Sun, Earth, Moon and planetary states | 1849-12-26 to 2150-01-22 ET; states in the JPL DE440 ephemeris frame | Recommended baseline |
| `moon_pa_de440_200625.bpc` | binary PCK | High-accuracy lunar orientation | Approximately 1550 to 2650; DE440 lunar orientation | Required with DE440 lunar frames |
| `moon_de440_250416.tf` | FK | Lunar PA/ME frame definitions | Defines `MOON_PA`, `MOON_ME`, `MOON_PA_DE440` and `MOON_ME_DE440_ME421` | Required with the DE440 lunar PCK |
| `naif0012.tls` | LSK | UTC ↔ ephemeris-time conversion | Required for accurate conversions after 2017-01-01 UTC | Required |
| `pck00011.tpc` | text PCK | Generic body constants and orientation data | Generic IAU/NAIF constants; not a replacement for the high-accuracy lunar PCK | Supporting |
| `gm_de440.tpc` | text PCK | Gravitational parameters | GM values based on DE440 and current satellite ephemeris memos | Supporting, if dynamics are needed |

The compact `de440s.bsp` is sufficient for the Sun/Earth/Moon body states
needed by the planned geometry workflow. The larger `de440.bsp` is an
alternative when the complete DE440 body set is required. Do not mix DE440
trajectory data with an unrelated lunar orientation/frame set without
recording the resulting convention and validation.

## Lunar frame convention and LOLA compatibility

The LOLA label for `LDEM_80S_80M.IMG` declares the body-fixed coordinate system
`MEAN EARTH/POLAR AXIS OF DE421`. The current NAIF DE440 frame kernel defines
the frame `MOON_ME_DE440_ME421`, a DE440-based mean-Earth/polar-axis variant
closely aligned with the DE421 ME frame. For the first integration, the
terrain-to-ephemeris contract should therefore be:

```text
LOLA raster coordinates: Mean Earth/Polar Axis of DE421
SPICE observer frame:    MOON_ME_DE440_ME421
Inertial frame:          J2000 (SPICE's ICRF realization)
```

The application must not silently substitute `IAU_MOON`, `MOON_PA_DE440`, or a
different generic body-fixed frame. A deliberate frame conversion and a
validation test are required if another frame is selected.

NAIF documents that the DE440 ME/DE421-aligned frame differs from the DE421 ME
frame by a small, time-dependent rotation; its documented maximum over
1900–2051 is about 5.82e-7 radians, corresponding to slightly more than 1 m
on a lunar great circle. This is a frame-convention consideration, not a claim
of end-to-end BRASPACE accuracy.

## Kernel URLs and provenance

All links below are official NASA/JPL NAIF archive locations:

- [NAIF SPICE data categories](https://naif.jpl.nasa.gov/naif/data.html)
- [Planetary SPK directory](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/)
- [`de440s.bsp`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp)
- [Planetary SPK summaries](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt)
- [Planetary SPK checksums](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_checksums.txt)
- [PCK directory](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/)
- [`moon_pa_de440_200625.bpc`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc)
- [`moon_pa_de440_200625.cmt`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.cmt)
- [`pck00011.tpc`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc)
- [`gm_de440.tpc`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/gm_de440.tpc)
- [Satellite FK directory](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/)
- [`moon_de440_250416.tf`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf)
- [`naif0012.tls`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls)
- [LSK README](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/aareadme.txt)

NAIF's own PCK documentation states that `moon_pa_de440_200625.bpc` must be
used with a compatible lunar frame kernel. The current frame directory lists
`moon_de440_250416.tf`; its internal comments identify the compatible binary
PCK and define the lunar frame IDs.

## Candidate DE421-aligned legacy set

The LOLA raster is explicitly tied to DE421, so the older aligned set remains
useful as a reproducibility or comparison baseline:

| Kernel | Role | Coverage |
| --- | --- | --- |
| `moon_pa_de421_1900-2050.bpc` | DE421 lunar orientation | 1900-01-01 to 2051-01-01 ET |
| `moon_080317.tf` | Compatible DE421 lunar frame definitions | Defines `MOON_ME_DE421` and `MOON_PA_DE421` |

URLs:

- [`moon_pa_de421_1900-2050.bpc`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc)
- [`moon_pa_de421_1900-2050.cmt`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.cmt)
- [`moon_080317.tf`](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf)

This legacy set should not be mixed with the DE440 set in one computation
without documenting the selected ephemeris/frame convention. The baseline
recommendation is DE440 with `MOON_ME_DE440_ME421`; the DE421 set is retained
for comparison and backward-compatible reproduction.

## Time scales and geometry contract

SPICE uses Ephemeris Time (ET), represented as seconds past J2000, for geometry
computations. The LSK provides the leap-second relationship needed to convert
UTC input to ET/TDB. Future BRASPACE queries must record:

- UTC input timestamp and timezone handling.
- Converted ET/TDB value.
- Target and observer IDs.
- Reference frame and aberration correction settings.
- Kernel filenames and versions/checksums.
- Whether the result is geometric or includes light-time and stellar
  aberration corrections.

For the planned surface observer, the geometry pipeline must transform the
Sun and Earth states into the selected lunar body-fixed frame before deriving
azimuth/elevation. Terrain horizon obstruction remains a separate calculation
using the LOLA raster.

## JPL Horizons alternative and cross-check

[JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) is an official JPL service
for generating ephemerides through web, command-line, email and API
interfaces. It can be used as an independent cross-check or as a future
ephemeris provider, but a reproducible request must preserve its target,
observer, reference plane/frame, time scale, time span, step size, quantities
and aberration settings.

No Horizons query is included in this commit because BRASPACE has not selected
a landing date, site, observer height or output sampling interval. Therefore
no Sun/Earth azimuth, elevation, illumination window or communication window
is claimed as a project result.

## Acquisition and integrity policy

Kernels are external scientific inputs and should not be committed as large
binary files. When a kernel is adopted for implementation, record:

1. Exact filename and official URL.
2. NAIF directory listing date or release reference.
3. File size and official checksum where available.
4. Kernel type and coverage.
5. Required companion kernels.
6. Frame and time-scale assumptions.
7. The validation test that loads and uses the kernel.

NAIF specifically advises downloading text kernels as files rather than
copying their browser-rendered contents. The future implementation should
download into an ignored data directory and validate the manifest before use.

## BS-004 acceptance mapping

- Official sources: NAIF, JPL Horizons and direct kernel URLs recorded.
- Kernel inventory: SPK, binary PCK, FK, LSK and supporting PCK roles recorded.
- Frames: `J2000`, `MOON_ME_DE440_ME421`, PA/ME alternatives and LOLA DE421
  compatibility recorded.
- Time scales: UTC input and ET/TDB conversion requirements recorded.
- Coverage: DE440s, lunar orientation and DE421 comparison intervals recorded.
- Assumptions: no landing window or observer query invented.
- Integration status: not integrated; no illumination or communication result
  claimed.
