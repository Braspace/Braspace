# BS-050 — Candidate sites and representative epochs

The three feature centers in [`SCENARIOS.json`](../data/SCENARIOS.json) come from NASA's Lunar Surface Data Book, Table A2-2. They are polygon centers, not touchdown sites. The source reports approximately 5–10 m accuracy for these centers; that is not landing uncertainty. The selected LOLA GDR covers 90°S–80°S at 80 m/pixel at the pole in planetocentric, east-positive, DE421 Mean Earth/Polar Axis coordinates. All three points fall within its stated latitude range. Pixel lookup and usable-sample checks have not yet been performed.

| UTC epoch | Purpose | Scientific status |
| --- | --- | --- |
| 2026-11-15T00:00:00Z | Initial sampling epoch | Proposed; no Sun/Earth angles computed |
| 2027-02-15T00:00:00Z | Roughly three months later | Proposed; no illumination classification |
| 2027-05-15T00:00:00Z | Roughly six months later | Proposed; no illumination classification |

These dates are inside the stated DE440s SPK coverage (1849–2150) and DE440 lunar PCK coverage (about 1550–2650), as documented in [`SPICE_SOURCES.md`](../data/SPICE_SOURCES.md). Exact kernel coverage at each ET and frame transformation remain runtime checks. The timestamps are UTC; SPICE must convert UTC using the LSK to ephemeris time before geometric evaluation. No epoch is asserted to be a solstice, illumination maximum, or Earth visibility extreme.

The Moon has no terrestrial atmosphere or Earth-like meteorological seasons. Its small axial tilt keeps the Sun low at polar sites; solar azimuth and elevation vary as the Moon orbits and as the Sun–Moon geometry changes. Lunar libration changes the apparent Earth direction. The approximately 29.5-day synodic phase cycle is context, not a substitute for site-specific ephemerides or a terrain horizon. Evaluate actual variation with pinned SPICE kernels and an observer coordinate before assigning any period a descriptive label.

The machine-readable scenario file links each site and epoch to the terrain product and exact candidate kernel URLs. It marks calculations as planned and `usable_for_calculation` as false until coordinate conversion, raster sampling, and no-data handling pass tests. A future recovery flow may propose the two other feature centers as nearby *candidates*, but proximity and physical suitability have not been evaluated. No illumination, Earth line of sight, power or safe landing result is currently available.

Sources: [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf), [LOLA product label](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl), [NAIF planetary SPK summaries](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt), [NAIF lunar PCK comments](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.cmt), [NASA Moon phases](https://science.nasa.gov/moon/moon-phases/).
