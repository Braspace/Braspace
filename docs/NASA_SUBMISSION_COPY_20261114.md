# BRASPACE — NASA Space Apps 2026 project entry (ready-to-review draft)

> **DRAFT ONLY. NOT SUBMITTED.** Fields must be matched to the actual Team → Project form by the authorized registered member. Scientific statements must be approved by @joeljato and links/media by @Ninzinhu / @lisanogueira. Seven-slide content is currently outdated; see [visual review](SLIDES_VISUAL_REVIEW_20261114.md). Do not click final Submit before reviewing declared rights, credits and every field.

Official challenge: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/  
Official event/submission timeline: https://www.spaceappschallenge.org/2026/ (closes **Nov 15, 2026 11:59 PM local time**, from NASA website)

## Project title

**BRASPACE MoonProof — Lunar Landing Site Navigator & Mission Resilience Lab**

## Summary / short description (English)

MoonProof is an interactive educational prototype for exploring the environmental constraints of landing near the Moon's south pole. Using a verified-source NASA LRO/LOLA digital elevation product and JPL/NAIF SPICE ephemeris kernels, our pipeline produces a preliminary terrain horizon and a 72-hour Sun/Earth visibility snapshot for Connecting Ridge. The public interface explains local illumination, geometric Earth line of sight, and how delayed arrival scenarios affect simplified power and communication assumptions. Every result separates source evidence from modeling assumptions. This prototype is **not independently scientifically validated** and is **not a landing recommendation or flight system**.

## Details / what we built (English)

At the lunar south pole, shallow solar elevation, extended terrain shadows and obstructed direct-to-Earth geometry can change a mission plan. BRASPACE brings scientific data provenance together with an inspectable user experience rather than treating lunar landing regions as a single opaque score.

We built a Go HTTP API and Rust geometric visibility engine, a site catalogue, scenario/delay comparison, educational onboard energy/communication risk assessment, reproducible reports, and a responsive 3D MoonProof interface. A separate Python science pipeline uses the NASA Lunar Reconnaissance Orbiter Lunar Orbiter Laser Altimeter (LRO/LOLA) 80 m south polar DEM and JPL/NAIF SPICE kernels to derive a **preliminary 72-hour sequence** at Connecting Ridge. The public demonstration contains this fixed series, its provenance, hourly horizon-relative Sun/Earth center angles, and a reproducible recovery scenario.

The public app is a static, read-only presentation of *precomputed* evidence; it is **not a live NASA service**, and the public app does not expose or operate the private backend repository. The Go/Rust integration and PostgreSQL support are separately tested in CI. The three-site comparison based on genuine sources is still an engineering review item; the public version must not imply three independently validated sites.

The prototype's visibility results approximate the Sun and Earth as point centers. Power/consumable figures use explicit **user-entered educational assumptions**, not calibrated spacecraft parameters. Direct geometric line of sight is not an RF budget or a guarantee of DSN contact. Terrain-horizon accuracy, planetary frame details and Sun/Earth angles need independent reference comparison and an uncertainty budget. We do not model eclipses, solar disc width, panel incidence, thermal loads or certified landing safety. We display this status as `UNVERIFIED` in the app.

## Public project and presentation links (English)

- **Public working demo:** https://braspace-moonproof-mxyowk.v2.appdeploy.ai/
- **Seven-slide read-only presentation:** https://docs.google.com/presentation/d/1Nnv1C1XU2SQCmnPam1REc5_2Wix_Uo4x3u5Smmk3tLs/edit
- **NASA challenge:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

The private repository https://github.com/Braspace/Braspace is **not a public source-code URL** and must not be offered as an anonymous public code link. Only add a public code URL if the team explicitly publishes an appropriately reviewed, secret-free subset.

Link evidence from an unauthenticated GitHub runner: [workflow #43618268519](https://github.com/Braspace/Braspace/actions/runs/43618268519) — HTML/JS HTTP 200 and seven-slide PDF HTTP 200, all five offline tests passed. **Not a full signed-out human browser or portal submission verification.**

## NASA data / source citations (English)

1. **NASA LRO/LOLA, LDEM_80S_80M.IMG**, Version 2.0, PDS dataset `LRO-L-LOLA-4-GDR-V1.0`, 80 m/pixel south polar digital elevation. Original image SHA-256: `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`. Source/label: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ ; https://pds-geosciences.wustl.edu/missions/lro/lola.htm .
2. **JPL/NAIF SPICE ephemerides and reference frames:** `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`. Source: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ . The modeled directions are geometric, using `NONE` aberration correction, and need independent validation.
3. **Site feature-center coordinate**: Connecting Ridge latitude **−89.4632°**, longitude **−137.49°** (planetocentric east-positive), cited in NASA Lunar Surface Data Book ACD-50044 Rev. A / team data inventory. This is **not a landing touchdown point**.
4. **Visual-only Moon texture:** NASA Scientific Visualization Studio CGI Moon Kit, https://svs.gsfc.nasa.gov/4720/ ; is illustrative and not the calculation DEM.
5. **LROC QuickMap** is linked as a research/reference viewer, not silently copied as an unlicensed tile layer.

## Results: optional paragraph only after science-owner approval

At Connecting Ridge, the preliminary hourly geometric classifier reports **72 of 72 modeled hours** with the Sun center above the interpolated local horizon, **24 of 72 hours** with the Earth center above that horizon, and a **48-hour** longest continuous geometric Earth obstruction. These are computed at one specific feature center and epoch using a 2 m observer height and a finite-resolution LOLA horizon; they are **not independently cross-validated**, do not quantify robustness or RF communications, and must not be generalized to other sites or actual missions.

## Originality / AI assistance disclosure (English)

BRASPACE is an original educational integration project created by our multidisciplinary team. We researched public lunar exploration software for competitive analysis; third-party implementations were **not copied into the team bootstrap**. NASA/JPL datasets and external visual references remain attributed to their respective publishers.

**AI-assisted development disclosure:** Generative AI/coding agents assisted with portions of software implementation, code review, test generation, technical documentation, and potentially presentation illustration or copy. Humans remain responsible for selecting the scientific methods and sources, verifying calculations and licensing, integrating and reviewing code, and deciding what to submit. **Team owner must inventory and disclose the actual AI tools and generated assets used before accepting the NASA form's declarations; no unsupported assertion of fully human authorship.** AI does not imply NASA validation or agency endorsement.

## Specific known limitations (English)

- Source bytes and model output are traceable, but **scientific predictions are UNVERIFIED** against an independent ephemeris and horizon reference.
- The public live demo uses one source-backed location; candidate scores on old slides are illustrative and not a physically validated site ranking.
- Terrain height/registration, frame transforms, observer height and temporal resolution introduce unquantified uncertainty.
- Geometric Earth-center visibility excludes RF link budgets, antenna dynamics, DSN scheduling and spacecraft obscuration.
- Power and crew consumable figures are simplified user assumptions; not flight-ready safety models.
- BRASPACE is independent and not affiliated with or certified by NASA.

## Final human/portal gate — never auto-check

- [ ] Update slide 3 (placeholder scores), slides 4–6 (stale science/engineering status), slide 7 (public URL), preserve exactly 7 slides.
- [ ] Confirm 6 team registrations and all names/permissions; protect personal details.
- [ ] Team review NASA data/attribution, all assets and AI-assistance declarations.
- [ ] Open both deliverables in a **fresh signed-out browser**, check navigation, text and 3D fallback; save screenshot.
- [ ] Copy Summary/Details/NASA Data/References/Links into the actual form, edit to match any differing mandatory field labels.
- [ ] Registered authorized team member clicks **Submit for Judging** by the **official deadline** and archives the portal confirmation, project URL, exact time zone and screenshot.
- [ ] Only then mark BS-011 as completed.

This draft deliberately does **not** claim that the project won, the science is certified, that a NASA portal submission exists, or that the private code is publicly accessible.
