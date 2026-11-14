# Competitive source audit — Lunar Landing Site Navigator

**Observed 2026-11-14:** Public repository READMEs, source trees and representative implementation/test files inspected through the GitHub connector. The implementations were **not executed**. Numerical performance claims are from maintainers, not independently reproduced. No competitor code was imported.

| Public repository | Observed claimed strengths | Limits and opportunities for BRASPACE |
|---|---|---|
| [WarRinOP/sightline](https://github.com/WarRinOP/sightline) | SPICE/LOLA, 3 terrain-backed sites, visual 3D, JPL Horizons comparisons, reproducible data hashes, horizon profiles, evidence page | README distinguishes built versus roadmap; proposed story/analyst and best-window finding absent from its stated stage. Avoid claiming their tested values are NASA certifications. |
| [MdAhbab/PolarWindow](https://github.com/MdAhbab/PolarWindow) | Site/mission dashboards, SPICE, LOLA, 3D, metrics with bounds, battery/thermal/link/mesh/dispersion models, comprehensive tests, self-hosting, evidence-controlled AI | Broad end-to-end product. BRASPACE must emphasize usability and an inspectable decision trail rather than copying feature count. |
| [RootVandal/lunar-ops](https://github.com/RootVandal/lunar-ops) | Hourly mission-window search, constraints and margin-by-requirement, DSN geometry, 19-point dispersion, validation vs Horizons and Barker 2021, explain-why-fail | Project explicitly describes itself as pre-hackathon educational open source, **not** a 2026 hackathon submission. Mission-blocker analysis is not a novel BRASPACE claim. |
| [localizedprojects/CLPS-MOON-BROWSER](https://github.com/localizedprojects/CLPS-MOON-BROWSER) | Lunar Horizon: 19 south-pole sites plus 20 whole-Moon landed sites in described version, terrain/time plots, web and Android, exports, guides, SPICE and LOLA | Rich mobile UX and scientific traceability; a bare 3D moon or CSV export will not differentiate. |
| [daniel27-space/lunar-navigator](https://github.com/daniel27-space/lunar-navigator) | Singapore: 3D terrain/shadows, site finder by terrain/mission constraint, 41 mission sites, landing-date rank, three-site comparison, published validation claims | Site selection and ranked landing dates are already claimed; require independent head-to-head tests and truthful sourcing before claiming superiority. |

## Feature-by-feature response

| Dimension | Existing examples | BRASPACE position |
|---|---|---|
| 3D terrain, horizon, live Sun/Earth | All five describe some form | Required core capability, **not** differentiator |
| Site/date recommendation | Lunar Ops, Lunar Horizon, Singapore | Build only after real NASA data and transparent constraints |
| DSN/blackout and energy | Lunar Ops and PolarWindow | Do not make speculative values; add only with reviewed models |
| Validation/provenance | All five document at least some science checks | Evidence Passport: one shareable trace from source checksum through decision and measured residual |
| Uncertainty, landing dispersion | Lunar Ops and PolarWindow | Robustness **Pareto frontier** against correlated terrain/landing/power assumptions, with counterexamples |
| Education and accessibility | Lunar Horizon, PolarWindow, others | Decision explainer as step-by-step reproducible lesson, localized pt-BR/en-US and screen-reader checks |
| One-click deploy | PolarWindow; web static examples | Reproducible minimal **Go + Rust** Compose, no required cloud account, no fake data claims |

## Prioritized unique product hypothesis (NOT IMPLEMENTED)

**Mission Evidence Passport:** for a chosen candidate, epoch and objective, emit an offline-reviewable JSON + printable provenance page with manifest hash, ephemeris/DEM identities, frame, observer height, per-constraint margin, uncertainty perturbation suite, test residuals, failure cause, and replay command. Reviewers can recompute and challenge every figure. Add side-by-side `candidate A vs B` sensitivity/explainability view and unit-aware glossary. This is a design hypothesis; **not a novelty guarantee** and no real science pipeline is available yet.

## Evidence required before scientific release

- Acquire real NASA LOLA elevation product, exact georeference, hash, license, and cite it.
- Use actual NAIF SPICE kernels and correct moon frame/epoch; independently compare look angles against Horizons.
- Recompute terrain obstruction from DEM, cross-check horizon samples, evaluate disc/penumbra approximations.
- Test at least 3 published coordinates with declared observer heights, 2 independent references and pre-registered tolerances.
- Publish failure cases, sensitivity to grid resolution/observer height, explicit limitations and AI-assisted development disclosure.

## External upstreams and citation ethics

Do not wholesale copy upstream files or transplant outputs under a new name. If reusing source under an allowed license, preserve original attribution and notices, and isolate independently authored changes. Their README results remain *reported, not verified here*. NASA/JPL reference: https://naif.jpl.nasa.gov/ ; challenge: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/ .

## Source-level checks (read only; not benchmarked)

- **SIGHTLINE:** [Python terrain horizon](https://github.com/WarRinOP/sightline/blob/main/pipeline/sightline_pipeline/horizon.py) handles great-circle ray casting, a 5 m near-field tile plus 80 m distant DEM and explicit truncation; [TS horizon contract](https://github.com/WarRinOP/sightline/blob/main/packages/engine/src/horizon/horizon.ts) validates per-bin hull lines as a function of mast height. This is deeper than a generic 3D renderer.
- **PolarWindow:** [horizon.py](https://github.com/MdAhbab/PolarWindow/blob/main/backend/app/core/horizon.py) abstracts the DEM behind a height sampler and warns against near-field interpolation artifacts; [compare_service.py](https://github.com/MdAhbab/PolarWindow/blob/main/backend/app/services/compare_service.py) intentionally reuses the metrics code path and uncertainty-aware ranking.
- **LUNAR//OPS:** [horizon.py](https://github.com/RootVandal/lunar-ops/blob/main/pipeline/lunarops/horizon.py) uses nested DEM ranges, spherical geometry and records the occluding distance; [Horizons tests](https://github.com/RootVandal/lunar-ops/blob/main/pipeline/tests/test_vs_horizons.py) carry a numerical angular tolerance.
- **Lunar Horizon:** [Python skyline](https://github.com/localizedprojects/CLPS-MOON-BROWSER/blob/main/pipeline/lunarsp/horizon.py) documents exact spherical geometry and resolution-dependent bias; [on-device horizon](https://github.com/localizedprojects/CLPS-MOON-BROWSER/blob/main/app/lib/core/horizon_compute.dart) marks coarse 400 m DEM computations as approximate.
- **Singapore Lunar Navigator:** [horizon.ts](https://github.com/daniel27-space/lunar-navigator/blob/main/web/src/lib/horizon.ts) uses spherical great-circle rays and discloses terrain resolution. [Compare.tsx](https://github.com/daniel27-space/lunar-navigator/blob/main/web/src/ui/Compare.tsx) aligns the same metrics across three sites and handles unavailable data and timeline views.

**Engineering consequence for BRASPACE:** a future DEM implementer should test (a) exact spherical geometry, (b) near-field DEM noise, (c) DEM resolution convergence, (d) wraparound azimuth interpolation, (e) frame/epoch agreement, (f) uncertainty-aware comparison consistency between detail and compare. These are independent test requirements, not copied algorithms. The current Rust code implements only item (d) on caller-supplied data.
