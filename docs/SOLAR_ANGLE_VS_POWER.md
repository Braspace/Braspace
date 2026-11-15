# Solar angle versus achievable power (BS-040)

Drafted by an AI agent (Renata, BR109); @joeljato must review. Status of all numbers cited: preliminary, not validated.

**Rule for UI and docs:** a Sun elevation, or "Sun visible", is geometry. It is never reported as energy produced.

## What the repository gives
- `sun_visible` / `earth_visible` (Rust engine, Go API): the body centre is at or above the supplied terrain horizon. `UNVERIFIED_INPUTS`, caller-supplied angles.
- `science/results/*.json`: the same test over 2025-2028 on real LOLA + SPICE inputs, `PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED`.

## What turns an angle into power (and where we stop)
1. Flux on a flat panel scales with sin(elevation). At a polar site the Sun sits within a few degrees of the horizon (`max_sun_elevation_deg` is 6.78 for Mons Mouton in `science/results/summary.json`), so the cosine factor is small and tilt/orientation dominate. Not modelled.
2. Self-shadow and lander shadow, nearby rocks below the 80 m DEM resolution. Not modelled.
3. Array area, efficiency, temperature, dust, battery and load. Not modelled; in the web form `Assumed solar power (W)` is a user input "assumed constant whenever the synthetic Sun is visible" (`web/index.html`).
4. Night length is geometric (for example the longest darkness in `science/results/README.md`), not an energy balance.

## Uncertainty that carries over
The geometric answer itself differs from the NASA PGDA reference by -0.86 to +9.00 percentage points for the Sun (`science/results/validation_pgda.json`); power would add the unmodelled terms above on top. No combined interval is given because it would be invented.

## Wording
Use: "Sun above the terrain horizon", "geometric visibility". Do not use: "power available", "energy generated", "mission-grade", "validated".

See also the assumptions note in the BS-018 PR (`docs/POLAR_ILLUMINATION_ASSUMPTIONS.md`, if merged) and `docs/LANDING_LAB.md` §6.
