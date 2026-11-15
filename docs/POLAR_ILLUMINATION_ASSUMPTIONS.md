# Polar illumination modeling: assumptions, and why Sun visibility is not power (BS-018, BS-040)

Status: documentation of what the repository does and does not model. Scientific status of every number it refers to: `PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED`.
Drafted by an AI agent (Renata, BR109); @joeljato (science owner) must review before it is cited.

## 1. What the code computes

For a site (latitude, longitude, height 2 m) and a UTC time, `api/cmd/threesitepipeline` (Go; formerly `science/three_site_pipeline.py`) computes:
1. the Sun and Earth direction as azimuth/elevation (`api/naif` + `api/spicelunar`, a pure-Go NAIF SPICE subset checked against CSPICE, apparent light-time + stellar aberration, frame `MOON_ME_DE440_ME421`);
2. the terrain horizon (`science/lola_horizon.py`): rays every 1 deg of azimuth over LOLA `LDEM_80S_80M`, 160 m steps, out to 100 km, lunar curvature included;
3. "visible" = the body's **centre** is above the horizon at that azimuth, plus a straight-horizon solar-disc fraction (radius about 0.27 deg).

## 2. Assumptions by topic

| Topic | What is assumed | Consequence |
|---|---|---|
| Surface normal | The observer's local up is the radial direction of the spherical reference (R = 1,737,400 m) plus DEM height. The local slope of the ground under the lander is **not** used. | Elevations are angles above the local tangent plane of the sphere, not above a tilted pad. |
| Libration | Orientation comes from the NAIF lunar PCK (`moon_pa_de440_200625.bpc`) and frame kernel, so libration is included in Sun/Earth directions. Earth moves a few degrees in the sky over a libration cycle, which matters for Earth visibility near the horizon. | Libration is not modelled separately and no libration uncertainty is reported. |
| Reference frames | DEM and sites in `MOON_ME` (Mean Earth/Polar Axis), planetocentric latitude, east-positive longitude. Ephemerides in `MOON_ME_DE440_ME421`. | The label says DE421 for the DEM and DE440 for the ephemeris: the difference between the two ME realisations is not quantified here. |
| Terrain shadows | Only the skyline from a point observer: a ray is cast outward along each azimuth. | Shadows cast **onto** the lander by nearby rocks and the lander's own geometry are not modelled; features below about 160 m are not resolved by an 80 m DEM. |
| Range | 100 km horizon range (earlier runs used 30 km). | A range change moves results; the choice is a pending decision for the science owner. |
| Sun | Centre plus a disc-fraction approximation. No penumbra model, no limb darkening. | Visible fractions near 0 or 1 are least reliable. |
| Time | Hourly samples, 2025-01-01 to 2028-12-31. | A rise/set shorter than one hour is not seen. |

## 3. Geometric Sun visibility is not usable solar energy

`sun_visible = true` means only: the straight line from the site to the Sun centre clears the computed skyline. It does **not** tell how much power an array produces. What is missing, none of it modelled in this repository:

- the incidence angle on the panel: at the poles the Sun stays within a few degrees of the horizon, so a flat panel receives roughly sin(elevation) of the full flux, and vertical or tilted panels need their own geometry;
- shadowing by the lander, mast, neighbouring rocks and panel self-shadow;
- dust, degradation and temperature effects;
- the power system itself (array area and efficiency, battery, loads, thermal limits);
- lunar night duration and energy storage; "longest darkness" values (for example 345 to 670 h in `science/results/README.md`) are geometric, not an energy-balance result.

Same for Earth: `earth_visible` is line of sight only. No antenna pattern, link budget or DSN availability is computed.

So the interface and documents must say "Sun above the terrain horizon" or "geometric visibility", never "powered", "energy available" or "mission-ready". `docs/LANDING_LAB.md` §6 already states "No power, thermal or RF link-budget model"; this note gives the reasons.

## 4. How to read the published percentages
`science/results/README.md` gives, for example, "Peak Near Shackleton: Sun visible 80.4%". That is the share of hourly samples in 2025-2028 with the Sun centre above the horizon. It is not the share of time with usable power and it is not validated: against PGDA the Sun difference ranges from -0.86 to +9.00 pp (`science/results/validation_pgda.json`).

## 5. Sources
- NASA GSFC PGDA illumination products: <http://imbrium.mit.edu/EXTRAS/ILLUMINATION/>; Mazarico et al. 2011, *Icarus* 211:1066.
- LOLA `LDEM_80S_80M`: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/>.
- NAIF: <https://naif.jpl.nasa.gov/naif/> (kernels listed in `science/results/README.md`).
- `docs/SCIENTIFIC_ACCEPTANCE.md`, `docs/LANDING_LAB.md`, `science/README.md`.
