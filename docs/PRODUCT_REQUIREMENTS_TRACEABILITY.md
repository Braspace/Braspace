# BRASPACE 2026 — Requirements traceability and acceptance matrix

**Challenge:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/  
**Source:** Team's consolidated lunar-project notes and reported meeting contributions (Heloísa de Paula Nogueira), provided 2026-11-14.  
**Scope policy:** These **19 baseline requirements** are **team-mandated**, even when the original NASA challenge might describe an element as optional. The nine extensions are team-proposed differentiators and release controls. **A requirement listed here is not a declaration that it has been implemented.**  
**Current evidence default:** *Evidence pending*; require independently reproduced tests/links for each row.

## Baseline requirements — 19 from team notes

| ID | Requirement | Sprint priority | Assigned GitHub issues | Acceptance evidence needed | Current verified status |
|---|---|---|---|---|---|
| R-01 | Curated known landing sites and custom lunar lat/lon inputs | P0 | [#5](https://github.com/Braspace/Braspace/issues/5), [#19](https://github.com/Braspace/Braspace/issues/19), [#26](https://github.com/Braspace/Braspace/issues/26), [#52](https://github.com/Braspace/Braspace/issues/52) | One sourced known site and valid custom coordinates with datum; reject invalid coordinate inputs | Evidence pending |
| R-02 | Side-by-side and sequential multi-site comparison | P0 | [#21](https://github.com/Braspace/Braspace/issues/21), [#26](https://github.com/Braspace/Braspace/issues/26) | Two sites or independently reproducible scenarios share units and common time grid | Evidence pending |
| R-03 | UTC landing date, time and mission duration | P0 | [#19](https://github.com/Braspace/Braspace/issues/19), [#21](https://github.com/Braspace/Braspace/issues/21), [#26](https://github.com/Braspace/Braspace/issues/26) | Controls update calculations and enforce supported ephemeris time limits | Evidence pending |
| R-04 | Temporal exploration across days, months, illumination cycles and date alternatives | P1 | [#4](https://github.com/Braspace/Braspace/issues/4), [#15](https://github.com/Braspace/Braspace/issues/15), [#21](https://github.com/Braspace/Braspace/issues/21), [#46](https://github.com/Braspace/Braspace/issues/46), [#52](https://github.com/Braspace/Braspace/issues/52) | Representative, source-covered epochs and documented lunar geometry, not terrestrial seasons | Evidence pending |
| R-05 | Sun azimuth/elevation relative to local terrain horizon | P0 | [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16), [#25](https://github.com/Braspace/Braspace/issues/25) | Actual Sun direction and terrain height with independent validation, units and source | Evidence pending |
| R-06 | Earth azimuth/elevation and unobstructed geometric visibility | P0 | [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16), [#25](https://github.com/Braspace/Braspace/issues/25) | Actual Earth direction and skyline intersections; no implied radio link guarantee | Evidence pending |
| R-07 | Time until next light/visibility transition | P1 | [#16](https://github.com/Braspace/Braspace/issues/16), [#21](https://github.com/Braspace/Braspace/issues/21), [#25](https://github.com/Braspace/Braspace/issues/25) | Transition times include interpolation/discretization assumptions and sample bounds | Evidence pending |
| R-08 | Sunlit hours, maximum darkness and illumination geometry | P0 | [#14](https://github.com/Braspace/Braspace/issues/14), [#16](https://github.com/Braspace/Braspace/issues/16), [#21](https://github.com/Braspace/Braspace/issues/21), [#25](https://github.com/Braspace/Braspace/issues/25) | Time-series intervals and max continuous darkness derived from real horizons | Evidence pending |
| R-09 | Geometric direct-to-Earth windows and maximum blackout | P0 | [#16](https://github.com/Braspace/Braspace/issues/16), [#21](https://github.com/Braspace/Braspace/issues/21), [#25](https://github.com/Braspace/Braspace/issues/25) | Event times and longest Earth-obstruction interval; no claim of DSN schedule or RF budget | Evidence pending |
| R-10 | LOLA terrain, elevation, crater walls, slope and topographic horizon | P0 | [#1](https://github.com/Braspace/Braspace/issues/1), [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#14](https://github.com/Braspace/Braspace/issues/14), [#20](https://github.com/Braspace/Braspace/issues/20) | Real NASA surface data used in calculation and product/resolution documented | Evidence pending |
| R-11 | Lunar geometry without Earth-like atmospheric refraction | P0 | [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#40](https://github.com/Braspace/Braspace/issues/40) | Document reference radius/body frame and no artificial terrestrial refraction | Evidence pending |
| R-12 | Lunar libration/orientation and orbital effects | P0 | [#4](https://github.com/Braspace/Braspace/issues/4), [#15](https://github.com/Braspace/Braspace/issues/15), [#18](https://github.com/Braspace/Braspace/issues/18), [#52](https://github.com/Braspace/Braspace/issues/52) | SPICE frame/epoch/orientation provenance and JPL Horizons validation evidence | Evidence pending |
| R-13 | 2D map and explanatory 3D terrain view | P1 | [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26), [#47](https://github.com/Braspace/Braspace/issues/47) | 3D must correspond to actual NASA data or be prominently labeled illustrative | Evidence pending |
| R-14 | Time series and animation | P0 | [#21](https://github.com/Braspace/Braspace/issues/21), [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26), [#47](https://github.com/Braspace/Braspace/issues/47) | Timeline linked to same numerical results, event labels and accessibility | Evidence pending |
| R-15 | Nearby alternative sites and alternate dates | P0 | [#5](https://github.com/Braspace/Braspace/issues/5), [#21](https://github.com/Braspace/Braspace/issues/21), [#46](https://github.com/Braspace/Braspace/issues/46), [#52](https://github.com/Braspace/Braspace/issues/52) | Show a source-backed alternative or explicitly explain no validated alternative | Evidence pending |
| R-16 | Replanning under delays and hardware changes | P0 | [#46](https://github.com/Braspace/Braspace/issues/46), [#48](https://github.com/Braspace/Braspace/issues/48) | Input delay, recalculate, show changed constraint and margin; real physics not static examples | Evidence pending |
| R-17 | Professional, educational and public audience modes | P0 | [#26](https://github.com/Braspace/Braspace/issues/26), [#27](https://github.com/Braspace/Braspace/issues/27), [#47](https://github.com/Braspace/Braspace/issues/47) | Same values with accessible technical explanations and minimal user controls | Evidence pending |
| R-18 | Science and engineering stakeholder trade-offs | P1 | [#7](https://github.com/Braspace/Braspace/issues/7), [#21](https://github.com/Braspace/Braspace/issues/21), [#48](https://github.com/Braspace/Braspace/issues/48) | Explicit threshold definitions, competing objectives, non-dominated choices where validated | Evidence pending |
| R-19 | NASA datasets, parameters, uncertainty and traceability | P0 | [#1](https://github.com/Braspace/Braspace/issues/1), [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#4](https://github.com/Braspace/Braspace/issues/4), [#17](https://github.com/Braspace/Braspace/issues/17), [#20](https://github.com/Braspace/Braspace/issues/20), [#34](https://github.com/Braspace/Braspace/issues/34), [#50](https://github.com/Braspace/Braspace/issues/50) | Inputs, source IDs and checksums, assumptions, validation status and limitations visible | Evidence pending |

## Product and innovation / compliance extensions

| ID | Requirement | Sprint priority | Assigned GitHub issues | Acceptance evidence needed | Current verified status |
|---|---|---|---|---|---|
| D-01 | Five-area hub: Explore, Compare, Recover, Science & Engineering, Evidence & Learn | P0 | [#47](https://github.com/Braspace/Braspace/issues/47) | 5 prominent navigational entries, good mobile/keyboard hierarchy | Evidence pending |
| D-02 | Recovery under +24/+48/+72 h schedule slippage | P0 | [#46](https://github.com/Braspace/Braspace/issues/46) | Reproducible scenario input/output and named violated constraints | Evidence pending |
| D-03 | Observer height, location, DEM resolution and time-step sensitivity | P1 | [#49](https://github.com/Braspace/Braspace/issues/49) | Quantified deltas without unearned probabilistic confidence | Evidence pending |
| D-04 | Reproducible science–engineering Pareto / negotiation | P1 | [#48](https://github.com/Braspace/Braspace/issues/48) | No opaque universal ranking or conflation of light and electric power | Evidence pending |
| D-05 | Decision history, export and evidence receipts | P1 | [#48](https://github.com/Braspace/Braspace/issues/48), [#50](https://github.com/Braspace/Braspace/issues/50) | Versioned scenario parameters, source manifest and model status | Evidence pending |
| D-06 | Pedagogical explanations and optional lightweight guided demo | P1 | [#27](https://github.com/Braspace/Braspace/issues/27), [#47](https://github.com/Braspace/Braspace/issues/47), [#51](https://github.com/Braspace/Braspace/issues/51) | Explain lunar horizon, libration, power/communication distinction, original assets | Evidence pending |
| D-07 | Ethical research of 15 rival repositories and documented licensing | P0 | [#51](https://github.com/Braspace/Braspace/issues/51) | Source links, timestamp, verification qualifiers; no unauthorized copying | Evidence pending |
| D-08 | Keep source private until reviewed; deliver public judge-readable demo and final project | P0 | [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11), [#32](https://github.com/Braspace/Braspace/issues/32), [#34](https://github.com/Braspace/Braspace/issues/34), [#50](https://github.com/Braspace/Braspace/issues/50), [#51](https://github.com/Braspace/Braspace/issues/51) | Can keep private code repo with separate public project/web page; no passwords for judges | Evidence pending |
| D-09 | Submission in English, <=7-slide deck or <=30-second video, correct AI attribution | P0 | [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11), [#27](https://github.com/Braspace/Braspace/issues/27), [#32](https://github.com/Braspace/Braspace/issues/32), [#34](https://github.com/Braspace/Braspace/issues/34), [#41](https://github.com/Braspace/Braspace/issues/41), [#50](https://github.com/Braspace/Braspace/issues/50) | Official public URL works anonymously and claims reflect working code | Evidence pending |

## Stage gates (required scope remains recorded)

- **P0 / judging minimum:** real NASA data, documented lunar frames, Sun/Earth relative to *actual terrain*, time/date selection, comparison/timeline, a **small actual contingency case** if computationally valid, accessible user interface, and public evidence links. Scientific issues that cannot be validated must be transparently reported, not claimed completed.
- **P1 / valuable but cannot risk submission:** broader sites/months, full 3D representation, probabilistic-looking sensitivity excluded until justified, complete Pareto analysis, exportable histories, richer educational modules.
- **Later / research:** fleet/mesh planning, transfer optimization, high-fidelity thermo/RF budgets and generalized agent/RAG features are **outside the 2026 deadline build** unless independently tested. Do not erase from research backlog.
- **P0 gate before NASA form submission:** report exactly what ran/tested, which NASA resource it actually consumed, and which design elements are unfinished.

## Five-module hub — acceptance

1. **Explore**: lat/lon, site/time/duration, 2D map, local 3D evidence, Sun/Earth horizon, next transition, timeline.
2. **Compare**: uniform time scale, two-to-four sites where sources permit, four operational metrics separately, source/limits on every value.
3. **Recover**: change launch/landing date or assumptions and automatically analyze alternate sites/dates; show the active failure and remaining margin.
4. **Science & Engineering**: separate science value (e.g. access to candidate shadowed ice areas when verified) from energy, battery, communications, slope and thermal limits; explicitly show conflict.
5. **Evidence & Learn**: dataset IDs/versions, formulas, reproducibility, AI usage and citations; plain-language explanations and technical mode.

## Mission simulation semantics and scientific safeguards

**Typical outputs:** `sun_azimuth_deg`, `sun_elevation_deg`, `earth_azimuth_deg`, `earth_elevation_deg`, `local_horizon_deg`, `lit_duration_h`, `longest_darkness_h`, `earth_geometric_visibility_h`, `longest_dte_obstruction_h`. Never show a scalar "feasibility rating" without explainable criteria.

- **Light availability ≠ generated electrical power** unless panel orientation, efficiency, area and losses are modeled and labeled.
- **Earth visibility ≠ radio communication availability** unless link margin and actual ground-station timing are modeled.
- **LOLA horizon ≠ flat horizon**; compute terrain-aware angular masks and report DEM resolution/footprint.
- **Uncertainty sensitivity ≠ calibrated probability**; beware fake percent confidence.
- **Lunar polar seasonal variability** must be traced to Sun/Earth geometry, libration and topography, **not to terrestrial weather seasons**.
- **Results in English in NASA submission**; technical notes can remain bilingual for internal collaboration.

## Who collects the verification?

| Responsibility | Lead | Focus |
|---|---|---|
| NASA source registry and site/time provenance | @maccachera | #1–#6, #38, #52 |
| Rust geometry and DEM sensitivity | @joeljato | #13–#18, #40, #49 |
| Go API and replan contract | @gfreiresjrp | #19–#24, #39, #46 |
| UX five sections, demo, competitor visual research | @lisanogueira | #25–#30, #41, #47, #51 |
| Product science/engineering tradeoffs and release coordination | @gustavofullstack | #7–#12, #37, #43, #48 |
| QA, scope coverage, publicly accessible links and originality | @Ninzinhu | #31–#36, #42, #50 |

## Referenced docs

- [Competitor audit — 15 repositories](COMPETITORS_2026_15_REPOS.md)
- [MoonProof product differentiation](COMPETITIVE_DIFFERENTIATION_MOONPROOF.md)
- [Team meeting notes / Heloísa feedback](TEAM_MEETING_HELOISA_2026-11-14.md)
- [Existing team workboard](SPACE_APPS_2026_WORKBOARD.md)
- [NASA source register template](../data/NASA_SOURCES_TEMPLATE.md)

**Last updated:** 2026-11-14. Private working planning artifact, no claim of deployed features.
