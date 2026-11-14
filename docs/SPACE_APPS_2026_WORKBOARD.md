# BRASPACE — NASA Space Apps Challenge 2026 — Live Team Workboard

> **Repository:** https://github.com/Braspace/Braspace  
> **Challenge:** Lunar Landing Site Navigator  
> **Deadline:** 2026-11-15 23:59, Uberlândia time (America/Sao_Paulo)  
> **Owner:** @gustavofullstack  
> **Source of truth:** GitHub Issues #1–#43, #46–#52 and #54–#61 (58 issues total; #44, #45 and #53 are pull requests); original NASA submission form remains authoritative.

## Do this first (P0)

1. **Actual NASA data:** [#1](https://github.com/Braspace/Braspace/issues/1), [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#4](https://github.com/Braspace/Braspace/issues/4), [#38](https://github.com/Braspace/Braspace/issues/38) — @maccachera.
2. **Typed Go API / NASA loader:** [#19](https://github.com/Braspace/Braspace/issues/19), [#20](https://github.com/Braspace/Braspace/issues/20), [#21](https://github.com/Braspace/Braspace/issues/21) — @gfreiresjrp.
3. **Rust geometry / terrain horizon:** [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16) — @joeljato.
4. **Integration / reproducible Docker:** [#7](https://github.com/Braspace/Braspace/issues/7), [#8](https://github.com/Braspace/Braspace/issues/8), [#9](https://github.com/Braspace/Braspace/issues/9) — @gustavofullstack.
5. **Lunar visualization / seven-slide story:** [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26), [#27](https://github.com/Braspace/Braspace/issues/27) — @lisanogueira.
6. **CI / scientific honesty / NASA form / registration:** [#31](https://github.com/Braspace/Braspace/issues/31), [#32](https://github.com/Braspace/Braspace/issues/32), [#33](https://github.com/Braspace/Braspace/issues/33), [#34](https://github.com/Braspace/Braspace/issues/34), [#42](https://github.com/Braspace/Braspace/issues/42) — @Ninzinhu.
7. **Publication and final submission:** [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11) — @gustavofullstack (with explicit review of terms, licensing and evidence).

## Full ownership matrix

| Teammate | Scope | Work branch | Issues |
|---|---|---|---|
| @gustavofullstack | Code-first technical lead / Go-Rust integration / 3D / reports | `team/gustavofullstack/spaceapps-2026` | [#8](https://github.com/Braspace/Braspace/issues/8), [#9](https://github.com/Braspace/Braspace/issues/9), [#11](https://github.com/Braspace/Braspace/issues/11), [#12](https://github.com/Braspace/Braspace/issues/12), [#48](https://github.com/Braspace/Braspace/issues/48), [#54](https://github.com/Braspace/Braspace/issues/54), [#58](https://github.com/Braspace/Braspace/issues/58) |
| @maccachera | NASA/LROC data, images and source provenance | `team/maccachera/spaceapps-2026` | [#1](https://github.com/Braspace/Braspace/issues/1), [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#4](https://github.com/Braspace/Braspace/issues/4), [#5](https://github.com/Braspace/Braspace/issues/5), [#6](https://github.com/Braspace/Braspace/issues/6), [#38](https://github.com/Braspace/Braspace/issues/38), [#52](https://github.com/Braspace/Braspace/issues/52), [#55](https://github.com/Braspace/Braspace/issues/55), [#61](https://github.com/Braspace/Braspace/issues/61) |
| @gfreiresjrp | Go API, ingestion, licensed layer adapter and recovery | `team/gfreiresjrp/spaceapps-2026` | [#19](https://github.com/Braspace/Braspace/issues/19), [#20](https://github.com/Braspace/Braspace/issues/20), [#21](https://github.com/Braspace/Braspace/issues/21), [#22](https://github.com/Braspace/Braspace/issues/22), [#23](https://github.com/Braspace/Braspace/issues/23), [#24](https://github.com/Braspace/Braspace/issues/24), [#39](https://github.com/Braspace/Braspace/issues/39), [#46](https://github.com/Braspace/Braspace/issues/46), [#57](https://github.com/Braspace/Braspace/issues/57) |
| @joeljato | Scientific Rust, horizon and lunar coordinates | `team/joeljato/spaceapps-2026` | [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16), [#17](https://github.com/Braspace/Braspace/issues/17), [#18](https://github.com/Braspace/Braspace/issues/18), [#40](https://github.com/Braspace/Braspace/issues/40), [#49](https://github.com/Braspace/Braspace/issues/49), [#56](https://github.com/Braspace/Braspace/issues/56) |
| @lisanogueira | Product, UX, competition research, innovation and team planning | `team/lisanogueira/spaceapps-2026` | [#7](https://github.com/Braspace/Braspace/issues/7), [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26), [#27](https://github.com/Braspace/Braspace/issues/27), [#28](https://github.com/Braspace/Braspace/issues/28), [#29](https://github.com/Braspace/Braspace/issues/29), [#30](https://github.com/Braspace/Braspace/issues/30), [#37](https://github.com/Braspace/Braspace/issues/37), [#41](https://github.com/Braspace/Braspace/issues/41), [#47](https://github.com/Braspace/Braspace/issues/47), [#51](https://github.com/Braspace/Braspace/issues/51), [#60](https://github.com/Braspace/Braspace/issues/60) |
| @Ninzinhu | QA, risks, publication links and submission readiness | `team/Ninzinhu/spaceapps-2026` | [#10](https://github.com/Braspace/Braspace/issues/10), [#31](https://github.com/Braspace/Braspace/issues/31), [#32](https://github.com/Braspace/Braspace/issues/32), [#33](https://github.com/Braspace/Braspace/issues/33), [#34](https://github.com/Braspace/Braspace/issues/34), [#35](https://github.com/Braspace/Braspace/issues/35), [#36](https://github.com/Braspace/Braspace/issues/36), [#42](https://github.com/Braspace/Braspace/issues/42), [#43](https://github.com/Braspace/Braspace/issues/43), [#50](https://github.com/Braspace/Braspace/issues/50), [#59](https://github.com/Braspace/Braspace/issues/59) |

## GitHub Projects routing

**Important:** The GitHub Issues #1–#43, #46–#52 and #54–#61 were created and assigned via the connected GitHub app. **Project-item membership has NOT yet been confirmed**. Each issue body contains its board targets for manual/project automation routing. Do not mark cards as synced without readback.

| Existing organization board | Issue references |
|---|---|
| [Kanban #2](https://github.com/orgs/Braspace/projects/2) | All 58 open issues: primary tracking and in-progress overview |
| [Team Planning #4](https://github.com/orgs/Braspace/projects/4) | [#1](https://github.com/Braspace/Braspace/issues/1), [#4](https://github.com/Braspace/Braspace/issues/4), [#7](https://github.com/Braspace/Braspace/issues/7), [#37](https://github.com/Braspace/Braspace/issues/37), [#42](https://github.com/Braspace/Braspace/issues/42), [#50](https://github.com/Braspace/Braspace/issues/50), [#51](https://github.com/Braspace/Braspace/issues/51), [#52](https://github.com/Braspace/Braspace/issues/52), [#55](https://github.com/Braspace/Braspace/issues/55), [#60](https://github.com/Braspace/Braspace/issues/60), [#61](https://github.com/Braspace/Braspace/issues/61) |
| [Feature Release #5](https://github.com/orgs/Braspace/projects/5) | [#9](https://github.com/Braspace/Braspace/issues/9), [#23](https://github.com/Braspace/Braspace/issues/23), [#29](https://github.com/Braspace/Braspace/issues/29), [#33](https://github.com/Braspace/Braspace/issues/33), [#38](https://github.com/Braspace/Braspace/issues/38), [#46](https://github.com/Braspace/Braspace/issues/46), [#48](https://github.com/Braspace/Braspace/issues/48), [#54](https://github.com/Braspace/Braspace/issues/54), [#58](https://github.com/Braspace/Braspace/issues/58) |
| [Bug Tracker #6](https://github.com/orgs/Braspace/projects/6) | [#6](https://github.com/Braspace/Braspace/issues/6), [#17](https://github.com/Braspace/Braspace/issues/17), [#22](https://github.com/Braspace/Braspace/issues/22), [#28](https://github.com/Braspace/Braspace/issues/28), [#31](https://github.com/Braspace/Braspace/issues/31), [#35](https://github.com/Braspace/Braspace/issues/35), [#39](https://github.com/Braspace/Braspace/issues/39), [#40](https://github.com/Braspace/Braspace/issues/40), [#49](https://github.com/Braspace/Braspace/issues/49), [#50](https://github.com/Braspace/Braspace/issues/50), [#56](https://github.com/Braspace/Braspace/issues/56), [#59](https://github.com/Braspace/Braspace/issues/59) |
| [Interactive Development #7](https://github.com/orgs/Braspace/projects/7) | [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#8](https://github.com/Braspace/Braspace/issues/8), [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16), [#19](https://github.com/Braspace/Braspace/issues/19), [#20](https://github.com/Braspace/Braspace/issues/20), [#21](https://github.com/Braspace/Braspace/issues/21), [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26), [#46](https://github.com/Braspace/Braspace/issues/46), [#47](https://github.com/Braspace/Braspace/issues/47), [#49](https://github.com/Braspace/Braspace/issues/49), [#52](https://github.com/Braspace/Braspace/issues/52), [#54](https://github.com/Braspace/Braspace/issues/54), [#56](https://github.com/Braspace/Braspace/issues/56), [#57](https://github.com/Braspace/Braspace/issues/57), [#60](https://github.com/Braspace/Braspace/issues/60) |
| [Product Launch #8](https://github.com/orgs/Braspace/projects/8) | [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11), [#27](https://github.com/Braspace/Braspace/issues/27), [#32](https://github.com/Braspace/Braspace/issues/32), [#34](https://github.com/Braspace/Braspace/issues/34), [#41](https://github.com/Braspace/Braspace/issues/41), [#47](https://github.com/Braspace/Braspace/issues/47), [#50](https://github.com/Braspace/Braspace/issues/50), [#58](https://github.com/Braspace/Braspace/issues/58), [#59](https://github.com/Braspace/Braspace/issues/59), [#61](https://github.com/Braspace/Braspace/issues/61) |
| [Roadmap #9](https://github.com/orgs/Braspace/projects/9) | [#1](https://github.com/Braspace/Braspace/issues/1), [#4](https://github.com/Braspace/Braspace/issues/4), [#5](https://github.com/Braspace/Braspace/issues/5), [#12](https://github.com/Braspace/Braspace/issues/12), [#18](https://github.com/Braspace/Braspace/issues/18), [#24](https://github.com/Braspace/Braspace/issues/24), [#30](https://github.com/Braspace/Braspace/issues/30), [#48](https://github.com/Braspace/Braspace/issues/48), [#51](https://github.com/Braspace/Braspace/issues/51), [#55](https://github.com/Braspace/Braspace/issues/55), [#57](https://github.com/Braspace/Braspace/issues/57) |
| [Team Retrospective #10](https://github.com/orgs/Braspace/projects/10) | [#36](https://github.com/Braspace/Braspace/issues/36), [#43](https://github.com/Braspace/Braspace/issues/43) |

## Team execution rules

- **One branch per teammate**; never force-push or replace another teammate's branch. Do not merge without review.
- Open one focused pull request per deliverable, link its `BS-xxx` issue, and attach the successful command/test output.
- Review source authenticity (NASA PDS / LRO LOLA / NAIF SPICE) and license before reporting a resource as used.
- Site positions, dates, reference frames and units must be explicit; no illustrative metrics presented as scientific validation.
- Data and integration blockers take priority over features not required for the official demo.
- Deliverable for global judging: public project + English demo of **no more than 7 slides** (or 30-second video) + real NASA data used; independently test both links signed out.
- Declare AI-assisted assets and mark AI-generated images/video visibly. Do not create AI-derived NASA insignia.
- Check all six Space Apps participants are registered/confirmed at the Uberlândia event.
- Final action requires the authorized team owner to read/agree to submission terms and click **Submit for Judging** before the local deadline.

## Current verifiable baseline

At task kickoff, `main` contained `README.md` and `LICENSE`; the local prototype is **not yet pushed** to the organization repository by this coordination PR. Existing `gustavofullstack` branch is preserved as a legacy backup; Gustavo's active branch is `team/gustavofullstack/spaceapps-2026`. A 7-slide Google Slides presentation has been produced separately; the scientific calculation claims must remain clearly labeled as illustrative until validation. This coordination PR does not imply deployed or scientifically validated software.

## Project and mission notes

First reproducible milestone: choose **one** authoritative NASA lunar terrain/elevation resource, document its source/version/format/frame/checksum, compute **one** terrain-based horizon for **one** site and time interval, compare with trusted references, then expose that provenance in the UI and final demo. Additional metrics can follow if time and validation allow.


## Expanded scope 2026-11-14 — Heloísa + 15 competitors

**58 open issues / 6 leads.** The seven additional assigned issues below extend but **do not invalidate or close** the original 43. Keep focus on scientifically valid P0 results before expanding.

| Tracker | Issue | Lead | Priority | Need / tangible result |
|---|---|---|---|---|
| BS-044 | [#46](https://github.com/Braspace/Braspace/issues/46) | @gfreiresjrp | P0 | Recover from launch date slip; same science, new constraints and margins |
| BS-045 | [#47](https://github.com/Braspace/Braspace/issues/47) | @lisanogueira | P0 | Five-area hub, 2D/3D explanation, professional/educational modes |
| BS-046 | [#48](https://github.com/Braspace/Braspace/issues/48) | @gustavofullstack | P1 | Science/engineering conflicts, counterfactual Pareto and decision receipt |
| BS-047 | [#49](https://github.com/Braspace/Braspace/issues/49) | @joeljato | P1 | Observer-height, DEM and date-resolution sensitivity with numerical evidence |
| BS-048 | [#50](https://github.com/Braspace/Braspace/issues/50) | @Ninzinhu | P0 | Verify all 19 required baseline items and 9 extensions, public link gates |
| BS-049 | [#51](https://github.com/Braspace/Braspace/issues/51) | @lisanogueira | P1 | Research and licensing audit across 15 competitor repositories |
| BS-050 | [#52](https://github.com/Braspace/Braspace/issues/52) | @maccachera | P1 | Lunar illumination cycles, candidate sites/dates and source provenance |

### Primary research/requirements documents

- [15-repository competitive matrix](COMPETITORS_2026_15_REPOS.md)
- [All 19 team-required baseline items + 9 extensions, mapped to GitHub issues](PRODUCT_REQUIREMENTS_TRACEABILITY.md)
- [Heloísa's reported meeting inputs, privacy strategy and five-part UX](TEAM_MEETING_HELOISA_2026-11-14.md)
- [MoonProof differentiation and evidence-first release cutline](COMPETITIVE_DIFFERENTIATION_MOONPROOF.md)

**Important differentiation caveat:** competitors already describe terrain uncertainty, battery, educational game experiences, site/date comparison and sometimes replan constraints. The candidate innovation is our **coupled, explainable decision and recovery workflow**; never assert a first-ever invention without proof.

**Privacy:** `Braspace/Braspace` is currently private. Do not change repository visibility without team approval. The *NASA project and <=7-slide English demo links*, however, **must** be accessible without login before submission.

**Scope status:** tracking in an issue is **not** evidence of implementation. Science, release tests and final NASA form confirmation remain separately gated. We did **not** add cards to GitHub Projects v2 in this update; board URLs in issue bodies are routing proposals until verified.

## Source-backed Super Moon and report sprint — 2026-11-14

**PR #45 merged** into `main` after green Go/Rust/Docker integration CI. Squash commit `093c0771448b8515db0f13478ef49d4587e67d4a`; note the Go/Rust engine still uses **UNVERIFIED_INPUTS** and no NASA DEM/SPICE physical input is yet integrated.

**Product roles were redistributed at the user's request**: Gustavo code-first; Gabriel Freire Go/API; Joel Rust and science; Gabriel Maccachero source and image research (no coding obligation); Heloísa product/UX/gamification and sync (no coding obligation); João QA/risks/links (no coding obligation). Changes to #7, #10, #37 and #43 are confirmed through issue-assignee updates.

| Issue | Owner | Deliverable |
|---|---|---|
| [#54](https://github.com/Braspace/Braspace/issues/54) | @gustavofullstack | Original 3D Moon/WebGL |
| [#55](https://github.com/Braspace/Braspace/issues/55) | @maccachera | NASA/LROC asset licensing and source registry |
| [#56](https://github.com/Braspace/Braspace/issues/56) | @joeljato | 3D coordinate/terrain-frame validation |
| [#57](https://github.com/Braspace/Braspace/issues/57) | @gfreiresjrp | Licensed official lunar layer and image metadata API |
| [#58](https://github.com/Braspace/Braspace/issues/58) | @gustavofullstack | Mission Report HTML / print PDF |
| [#59](https://github.com/Braspace/Braspace/issues/59) | @Ninzinhu | Risk classification / report and public NASA release QA |
| [#60](https://github.com/Braspace/Braspace/issues/60) | @lisanogueira | Original 5-area hub and educational mission challenge |
| [#61](https://github.com/Braspace/Braspace/issues/61) | @maccachera | Official region imagery/gallery provenance |

### Technical and UX decision records

- [Roles and handoffs](TEAM_ROLES_AND_HANDOFFS_2026.md)
- [Super Moon 3D specification](SUPER_MOON_3D_TECHNICAL_SPEC.md)
- [Mission Report HTML/PDF and risk categories](MISSION_REPORT_AND_RISK_SPEC.md)
- [Lunar imagery rights and sources](LUNAR_ASSETS_RIGHTS_AND_SOURCES.md)
- [Gamification and five-module UX](GAMIFIED_LUNAR_UX_AND_HUB.md)
- [Prioritized delivery roadmap](SUPERMOON_DELIVERY_ROADMAP_2026.md)

**CRITICAL:** Google Moon/Google Maps imagery must **not** be scraped, used to derive an independent globe or copied pixel-for-pixel. NASA SVS CGI Moon Kit and approved LROC PDS data are potential source-backed visual/science assets; feature plans do not mean implementation. Keep GitHub repo private. Release demo/project links must be accessible without sign-in.

**Delivery priority:** real NASA science provenance and validated Sun/Earth/terrain → working comparison/recovery → minimal accessible 3D/2D experience → report HTML/PDF → gamification and optional 4K imagery. Claims are NOT DONE until PR, tests and source readback exist.
