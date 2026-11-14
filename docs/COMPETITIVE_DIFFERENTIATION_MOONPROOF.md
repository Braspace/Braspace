# BRASPACE MOONPROOF — Competitive analysis and focused NASA Space Apps 2026 MVP

**Decision:** Proposal for BRASPACE's Lunar Landing Site Navigator. **NOT IMPLEMENTED.**  
**Date:** 2026-11-14 | **Owner:** @gustavofullstack | **Deadline:** 2026-11-15 23:59 America/Sao_Paulo.  
**Grounding:** Official challenge https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ and the five competitors' public README files reviewed on 2026-11-14. Their claimed validation was not independently reproduced here.

## Strategic conclusion

Don't compete with another generic Moon globe, site ranking, AI chatbot or sky chart. The reviewed projects already document sophisticated implementations. Our product direction is **BRASPACE MoonProof — Lunar Mission Resilience Lab**: **"From finding a landing site to proving a mission scenario."**

Define a mission by **site + landing date + mission duration + solar array + battery + continuous load + mast height + allowed blackout**, then show **coupled sunlight, Earth visibility, energy survival and operational constraint margins**. Compare **alternative configurations that are not dominated on resource use and risk**; explain why a candidate fails and what changes improve it. Every result must provide its NASA source and computation assumptions; avoid composite, arbitrary "mission suitability scores". This is a proposed combination and workflow, **not a claim of worldwide novelty or superiority**.

## Competitive matrix (README-documented functionality, not fully independently tested)

| Project | Capabilities stated in README | Strategy implication |
|---|---|---|
| https://github.com/WarRinOP/sightline | LOLA terrain, SPICE, Sun/Earth skyline, 3D, barcode timeline, validation; story, window finder and AI analyst listed as unfinished as of its stated stage | A skyline/terrain chart alone is no differentiator |
| https://github.com/MdAhbab/PolarWindow | Real NASA terrain/SPICE, time windows, power and battery, thermal approximation, rover mesh, link budget, landing dispersion, AI with constrained numerical claims | Do **not** claim power, battery or AI are inventions; integrate these concepts around a narrow decision workflow |
| https://github.com/RootVandal/lunar-ops | Mission constraints, date/site windows, margins, cause of failures, smallest **single** relaxation, robustness via multiple landing locations/DEM clones; explicitly states not a hackathon entry | Explainability/robustness already exists: focus on **coupled, multi-variable scenarios and Pareto options**, not just cause of failure |
| https://github.com/localizedprojects/CLPS-MOON-BROWSER | Flutter Web/Android, site ranking, visibility and energy proxy, same-time Sun+Earth, history and shadow maps, validation | Bigger coverage and multi-platform apps are lower priority for our deadline |
| https://github.com/daniel27-space/lunar-navigator | 3D terrain with shadows, site finder, date selection, 60-day windows, comparative shortlists, NASA/JPL validation | Site/date picker and 3D are baseline functionality, not the differentiator |

**Research caution:** README content is a description of claimed implementations, not a guarantee of runtime behavior or scientific validity; lack of a feature mention does not prove its absence.

## MoonProof differentiated user experience

**One screen, one question:** "With these hardware constraints, when and where could my lander operate, and which changes make it more resilient?"

User can alter: (1) site, (2) landing date, (3) 7-day vs 14-day mission, (4) mast height, (5) panel area and assumed efficiency, (6) battery Wh and continuous load W. Update:
- **Sun vs terrain skyline**: angular elevation, obscuration events, time series;
- **Earth vs skyline**: line-of-sight windows and longest blackout, clearly *not* an RF link budget or scheduled DSN availability unless explicitly computed;
- **Energy state of charge** (experimental simplified lander model): time-resolved generation, consumption, battery Wh/SoC, minimum reserve and breach times; show all assumptions and input values;
- **Joint constraints**: simultaneous light and Earth visibility, maximum blackout, minimum battery reserve, mission feasibility **per stated threshold**, with pass/fail reasoning rather than arbitrary weighted scores;
- **Counterfactual and Pareto comparison**: compare configurations `A`, `B`, `C` (for example change date, increase mast, increase battery) and reveal trade-offs. Use strictly identical input datasets and model versions for fair comparisons;
- **Scientific evidence drawer**: exact DEM product ID/version, kernel identity, coordinate frame, time standard, source URL, checksum, resolution, numerical units, validation status, explicit limitations.

## Physical and numerical model boundaries

- Derive horizon `h(azimuth)` from a reproducibly acquired NASA LRO/LOLA DEM for one documented site, with coordinate conversion/observation height and errors recorded.
- Compute Sun/Earth directions using NASA/JPL SPICE or precomputed verified ephemerides. Check representative epochs against JPL Horizons. Distinguish mean-Earth lunar frame from site local ENU.
- `solar_geometric_visibility(t) = [Sun limb above actual skyline]` (with documented disc approximation); **this is not equal to actual usable electrical power**.
- A first-order energy model may use `P_gen = solar_irradiance * panel_area * efficiency * incidence_factor * visible_fraction` with explicitly assumed dust, degradation, incidence and losses; `E_battery(t+dt) = clip(E_t + (P_gen - P_load)*dt, 0, capacity)`. Declare it **scenario/educational only**, not a qualified hardware or flight model.
- `DTE_geometry(t) = Earth visible above terrain skyline`; **not** a link-budget calculation or guaranteed scheduled Earth contact.
- **Sensitivity** across input assumptions is not a calibrated probability or confidence interval. Use NASA DEM clones only when actual files were ingested and results verified.
- Prefer **non-dominated options** over a misleading universal scalar ranking; report each mission-specific threshold and margin.

## Hackathon cut line — REAL MVP before deadline

**P0 / must demonstrably work:**
1. **Authentic source**: acquire, parse, use and cite **one real** NASA LOLA DEM for **one site** (prefer PGDA product 78, site 01 Connecting Ridge) and selected SPICE/JPL ephemeris source. Include checksums and direct URLs. Owner @maccachera with @joeljato. [BS-001](https://github.com/Braspace/Braspace/issues/1), [BS-002](https://github.com/Braspace/Braspace/issues/2), [BS-003](https://github.com/Braspace/Braspace/issues/3).
2. **Verified calculation**: horizon and Sun/Earth geometry for one site/date range, cross-checked against JPL Horizons and a reference. Owner @joeljato. [BS-013](https://github.com/Braspace/Braspace/issues/13), [BS-014](https://github.com/Braspace/Braspace/issues/14), [BS-015](https://github.com/Braspace/Braspace/issues/15).
3. **Typed API**: Go exposes time-series with scientific units, provenance, model status and error boundaries. Integrate standalone Rust when reliably tested; avoid holding up an actually working vertical slice solely for an unverified multi-language integration. Owner @gfreiresjrp + @gustavofullstack. [BS-008](https://github.com/Braspace/Braspace/issues/8), [BS-019](https://github.com/Braspace/Braspace/issues/19), [BS-021](https://github.com/Braspace/Braspace/issues/21).
4. **Decision demo**: at least two verified configurations for the *same* site/date (e.g. change mission date OR battery), compare time-resolved Sun/Earth/energy, show the active failure constraint and one counterfactual; keep a clear scientific/assumed label. Owner @lisanogueira + @gfreiresjrp. [BS-025](https://github.com/Braspace/Braspace/issues/25), [BS-026](https://github.com/Braspace/Braspace/issues/26).
5. **Evidence and handoff**: tests + README + public app/project URL + English <=7-slide public demo that shows **actual implemented** flows and credits AI-generated assets; owner @Ninzinhu + @gustavofullstack. [BS-031](https://github.com/Braspace/Braspace/issues/31), [BS-032](https://github.com/Braspace/Braspace/issues/32), [BS-034](https://github.com/Braspace/Braspace/issues/34), [BS-010](https://github.com/Braspace/Braspace/issues/10), [BS-011](https://github.com/Braspace/Braspace/issues/11).

**P1 if P0 validated:** two to three physically distinct sites, 7-/14-day mission window chooser, panel/mast/energy configuration trade-off and a 2–3 point Pareto chart. Robustness over NASA DEM error clones only if real data and independent validation exist.

**DO NOT spend deadline time on:** broad full-Moon 3D planet, bespoke chatbot, LLM narratives without traceable numeric data, rover mesh, thermal field models, real RF budget, generic pgvector RAG, auth/login, multi-cloud, or artificial benchmark claims. Keep Docker+PostgreSQL available but do not overengineer if blockers appear.

## Acceptance gates and scorecard

- **Validity:** NASA data actually used; provenance and framing; independently checked representative geometry; visible limitations.
- **Relevance:** date/site Sun and Earth relative to horizon plus power/contact implications.
- **Creativity:** show coupled hardware/site/date decision and counterfactual, not only sites with a single score.
- **Impact:** a non-expert can explain the difference between a favorable photo, geometric line of sight and mission viability.
- **Presentation:** <=7 slides in English, public link without login, accurate screenshot of actual working MVP.
- One clicked, replayable scenario must take **less than 90 seconds** for a judge to understand; not a claimed measured performance KPI before it is tested.
- No passage into NASA's official submission that claims a feature, dataset, test or app deployment that has not been verified. No merge without team review.

## Proposed 7-slide narrative (revise only after features exist)

1. Problem: sunlight AND Earth communications near lunar polar terrain.
2. Why existing maps don't answer engineering feasibility from one scenario.
3. MoonProof mission inputs: site, date, hardware and limits.
4. Verified real-data skyline and joint timeline (show sources/units).
5. Counterfactual: what changed, what margin moved, what remains unproven.
6. Transparent architecture and reproducibility: Go, Rust, NASA, Docker, PGvector provisioned but optional.
7. Educational/mission-planning impact, limitations, team, source links and AI credits.

**Version control:** Draft-only strategy in `ops/spaceapps-2026-coordination` and PR #44. It should not silently alter implementation, claims or NASA submission.
