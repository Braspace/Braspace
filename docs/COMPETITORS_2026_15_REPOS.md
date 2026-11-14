# BRASPACE — Competitive intelligence: 15 lunar-planning repositories

**Last documentation read:** 2026-11-14. **Evidence type:** GitHub public READMEs and repository metadata only (not independent builds, runtime QA, scientific verification or award certification). This document summarizes external projects for ethical research and original design; **do not scrape private data, copy code or graphics without checking applicable licenses, or claim the competition is inferior**.

**Official NASA challenge:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

## Verified / qualified matrix

| # | Project | README-declared characteristics | Implication for BRASPACE | Verification |
|---|---|---|---|---|
| 01 | [SIGHTLINE](https://github.com/WarRinOP/sightline) | LOLA/SPICE skyline, 3D, Sun/Earth timeline, validation; some story/window/AI features explicitly future in stated status | A basic skyline is not a unique selling proposition | README inspected |
| 02 | [PolarWindow](https://github.com/MdAhbab/PolarWindow) | Four separate surface metrics, LOLA/SPICE, power/battery, thermal, rover mesh, link budget, dispersion, explainable AI | Do not claim batteries or multi-system planner are unprecedented | README inspected |
| 03 | [LUNAR//OPS](https://github.com/RootVandal/lunar-ops) | Mission constraint solver, failures/margins, minimal single-requirement relaxation, 19-point robustness checks | Our potential wedge is combined schedule/hardware/science negotiation, not generic replan | README inspected; repository states independent non-hackathon project |
| 04 | [Lunar Horizon (CLPS Moon Browser)](https://github.com/localizedprojects/CLPS-MOON-BROWSER) | Web/Flutter Android, 3D shadows, site/date comparison, NASA ephemerides, site rankings, reproducibility and validation | Broader geography/platform coverage is not a deadline priority | README inspected |
| 05 | [Lunar Navigator](https://github.com/daniel27-space/lunar-navigator) | 3D terrain, free-coordinate finder, solar/Earth horizon, 60-day windows, site/date search and NASA validation | Free coordinate entry and 3D already exist | README inspected |
| 06 | [Lunar Horizon Wheel](https://github.com/NetRunnerXD/lunar-horizon-wheel) | South/north poles; horizon wheel, P10–P90 uncertainty, cross-DEM comparisons, energy, traverses and DSN | Sensitivity, uncertainty and traverse are not BRASPACE-exclusive innovations | README inspected |
| 07 | [EmanuelAbasto — CLPS Lunar Mission Browser](https://github.com/EmanuelAbasto/CLPS-Lunar-Mission-Browser) | Compare 2–4 sites; simple/expert modes; flat vs LOLA terrain horizon; 3D; validation; references | Our dual-audience UI needs a compelling decision workflow, not just a toggle | README inspected; catalog precision/limitations need case-specific review |
| 08 | [dundaryusuf566-maker — CLPS Lunar Browser](https://github.com/dundaryusuf566-maker/clps-lunar-browser) | Earth-to-Moon transfers, delta-v and orbit wait, surface lighting/communications/energy, mission planning; test table includes failures | No need to replicate transfer optimization; isolate direct lunar surface problem | README inspected; pass/fail validation claims are not certified |
| 09 | [LunarSite Compass](https://github.com/partofcosmos-site/lunarsite-compass) | Operational site matrix, Sun/comm windows, topographic horizons, slope, PSR distance, rankings and descent-related models | Avoid composite readiness score unsupported by transparent requirement margins | README inspected; badges/award claims independently unverified |
| 10 | [Lunar Mission Planner](https://github.com/Iftee07/lunar-sp-browser) | Offline preprocessed ephemerides/LOLA; lunar sky, site/calendar/antenna and local playback | Offline runtime alone is not distinctive | README inspected |
| 11 | [BroBYW — CLPS Lunar Mission Browser](https://github.com/BroBYW/CLPS-Lunar-Mission-Website) | 3D, terrain shadows, Sun/Earth comparison, offline pipeline, educational 'Survive the lunar night' game and daily challenge | A stand-alone educational game is not unique; integrate accessible explanations with measured decision changes | README inspected |
| 12 | [M9nx — Lunar Landing Site Navigator](https://github.com/M9nx/lunar-landing-site-navigator) | User-supplied notes describe static prototype, API scaffold and research/JupyterHub, no validated lunar calculations yet | Treat provisional: GitHub returned a repository redirect and no directly readable README at the requested path | Repository metadata readable; README not verified |
| 13 | [Flourisha14 — Lunar Landing Site Navigator](https://github.com/Flourisha14/lunar-landing-site-navigator) | Separate Python science backend/frontend and planned SPICE, coordinate/horizon and site comparison features | Modular architecture by itself is not a unique innovation | README inspected; planned features not equivalent to demonstrated |
| 14 | [suhaslord — CLPS Lunar Browser](https://github.com/suhaslord/clps-lunar-browser) | In-progress picker, Sun/Earth, horizon and timeline; terrain blocking planned | Separate planned work from functioning behavior | README inspected; incomplete |
| 15 | [SeleneSight](https://github.com/0Aaheed0/SeleneSight) | In-development interactive lunar planning; planned SPICE, LOLA, terrain, data provenance and web visualization | General integrated lunar dashboard overlaps many submissions | README inspected; planned features not equivalent to demonstrated |

## What is already common

- Sun and Earth azimuth/elevation relative to site terrain; NASA LOLA and JPL/SPICE geometry; time series; long dark and communication gaps.
- Site/date comparison, ranked alternatives, free-coordinate picking, 2D/3D maps, models/assumptions and NASA references.
- Multiple competitors additionally state tests against Horizons, uncertainty bounds, power/battery, operational constraints and autonomous re-planning.
- A competitor even includes **educational gameplay**; do not claim games or public-oriented UIs are new by themselves.
- These capabilities are **not necessarily independently verified**; readme claims must not be repeated as test evidence.

## Design hypothesis: BRASPACE MoonProof / Mission Resilience Explorer

**Core question:** *If the mission is delayed, duration changes, the hardware budget shrinks, or a science target becomes stricter, which site + date + configuration retains acceptable operating margins, and why?*

**Distinctive user journey — as an integrated combination, not a claimed global invention:**

1. Select **science objectives** (e.g. candidate ice-access proximity when a verified PSR data layer exists) and **engineering limits** (slope, Sun/Earth visibility, max outage, battery, observation height), with explicit assumptions.
2. **Explore** a NASA-anchored Moon south-pole site/date with actual terrain skyline and Sun/Earth positions.
3. **Compare** configurations using consistent timestamps, source versions and constraints; show which one violates which requirement. Avoid magic readiness/viability scores.
4. **Recover** from a hypothetical +24/+48/+72 h launch delay or lost communication period: re-evaluate *dates plus near-site alternatives and hardware conditions*, showing all failed requirements and margins, not only a black-box answer.
5. **Negotiate science × engineering** with a small non-dominated/Pareto comparison and a reproducible **decision receipt** showing the scenario inputs, data checksum, model version and calculation status.
6. **Learn** from tooltips and animations appropriate for students/educators; keep explicit *Engineering / Education* modes and a five-area navigation hub.

## Competitive novelty honesty

- PolarWindow already models hardware, energy and operational constraints.
- LUNAR//OPS already models failures, smallest **single** constraint relaxation and robustness to landing dispersion.
- Lunar Horizon Wheel already models uncertainty and energy.
- BroBYW already uses educational play.
- The plausible BRASPACE differentiation is **a coherent, intuitive negotiation and contingency workflow** connecting science and engineering needs to a traceable decision record, supported by a concise scientifically valid demo.
- Novelty is **hypothesis pending further testing**, not a claim of first-in-the-world or superiority.

## Research protocol and reproducibility

For any attempted reuse, record per repository: exact source URL, file or algorithm reference, commit/tag, license and intended use. Attribute external code, images, datasets and prompts. Do not copy official NASA identity/branding into AI-generated assets. Competitor README statistics are *claims by the maintainers* until independently reproduced. Research outcomes are independent of their award status. Update this matrix only with evidence and timestamp.

## Five-item information architecture agreed for exploration

`Explore` · `Compare` · `Recover` · `Science & Engineering` · `Evidence & Learn`.

Three audiences share the same calculation outputs: **Mission Planner**, **Educator/Student**, **Public Explorer**, displayed at different explanation depths without changing the physics.

## Time-critical decision

> NASA deadline 2026-11-15 23:59 local. A verified single-site, science-backed vertical slice demonstrating contingency and transparent limitations is worth more than 15 superficial features. The entire team checklist is captured in `PRODUCT_REQUIREMENTS_TRACEABILITY.md`; implementation is explicitly staged, never claimed complete before tested.
