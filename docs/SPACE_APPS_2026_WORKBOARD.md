# BRASPACE — NASA Space Apps Challenge 2026 — Live Team Workboard

> **Repository:** https://github.com/Braspace/Braspace  
> **Challenge:** Lunar Landing Site Navigator  
> **Deadline:** 2026-11-15 23:59, Uberlândia time (America/Sao_Paulo)  
> **Owner:** @gustavofullstack  
> **Source of truth:** GitHub Issues #1–#43; original NASA submission form remains authoritative.

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
| @gustavofullstack | Tech lead / architecture / integration | `gustavofullstack` | [#7](https://github.com/Braspace/Braspace/issues/7), [#8](https://github.com/Braspace/Braspace/issues/8), [#9](https://github.com/Braspace/Braspace/issues/9), [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11), [#12](https://github.com/Braspace/Braspace/issues/12), [#37](https://github.com/Braspace/Braspace/issues/37), [#43](https://github.com/Braspace/Braspace/issues/43) |
| @maccachera | NASA data and provenance | `team/maccachera/spaceapps-2026` | [#1](https://github.com/Braspace/Braspace/issues/1), [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#4](https://github.com/Braspace/Braspace/issues/4), [#5](https://github.com/Braspace/Braspace/issues/5), [#6](https://github.com/Braspace/Braspace/issues/6), [#38](https://github.com/Braspace/Braspace/issues/38) |
| @gfreiresjrp | Go API / ingestion / database | `team/gfreiresjrp/spaceapps-2026` | [#19](https://github.com/Braspace/Braspace/issues/19), [#20](https://github.com/Braspace/Braspace/issues/20), [#21](https://github.com/Braspace/Braspace/issues/21), [#22](https://github.com/Braspace/Braspace/issues/22), [#23](https://github.com/Braspace/Braspace/issues/23), [#24](https://github.com/Braspace/Braspace/issues/24), [#39](https://github.com/Braspace/Braspace/issues/39) |
| @joeljato | Rust geometry / science validation | `team/joeljato/spaceapps-2026` | [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16), [#17](https://github.com/Braspace/Braspace/issues/17), [#18](https://github.com/Braspace/Braspace/issues/18), [#40](https://github.com/Braspace/Braspace/issues/40) |
| @lisanogueira | UI/UX / data visualization / demo | `team/lisanogueira/spaceapps-2026` | [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26), [#27](https://github.com/Braspace/Braspace/issues/27), [#28](https://github.com/Braspace/Braspace/issues/28), [#29](https://github.com/Braspace/Braspace/issues/29), [#30](https://github.com/Braspace/Braspace/issues/30), [#41](https://github.com/Braspace/Braspace/issues/41) |
| @Ninzinhu | QA / CI / NASA form / event status | `team/Ninzinhu/spaceapps-2026` | [#31](https://github.com/Braspace/Braspace/issues/31), [#32](https://github.com/Braspace/Braspace/issues/32), [#33](https://github.com/Braspace/Braspace/issues/33), [#34](https://github.com/Braspace/Braspace/issues/34), [#35](https://github.com/Braspace/Braspace/issues/35), [#36](https://github.com/Braspace/Braspace/issues/36), [#42](https://github.com/Braspace/Braspace/issues/42) |

## GitHub Projects routing

**Important:** The GitHub Issues were created and assigned via the connected GitHub app. **Project-item membership has NOT yet been confirmed**. Each issue body contains its board targets for manual/project automation routing. Do not mark cards as synced without readback.

| Existing organization board | Issue references |
|---|---|
| [Kanban #2](https://github.com/orgs/Braspace/projects/2) | All 43 issues: primary tracking and in-progress overview |
| [Team Planning #4](https://github.com/orgs/Braspace/projects/4) | [#1](https://github.com/Braspace/Braspace/issues/1), [#4](https://github.com/Braspace/Braspace/issues/4), [#7](https://github.com/Braspace/Braspace/issues/7), [#37](https://github.com/Braspace/Braspace/issues/37), [#42](https://github.com/Braspace/Braspace/issues/42) |
| [Feature Release #5](https://github.com/orgs/Braspace/projects/5) | [#9](https://github.com/Braspace/Braspace/issues/9), [#23](https://github.com/Braspace/Braspace/issues/23), [#29](https://github.com/Braspace/Braspace/issues/29), [#33](https://github.com/Braspace/Braspace/issues/33), [#38](https://github.com/Braspace/Braspace/issues/38) |
| [Bug Tracker #6](https://github.com/orgs/Braspace/projects/6) | [#6](https://github.com/Braspace/Braspace/issues/6), [#17](https://github.com/Braspace/Braspace/issues/17), [#22](https://github.com/Braspace/Braspace/issues/22), [#28](https://github.com/Braspace/Braspace/issues/28), [#31](https://github.com/Braspace/Braspace/issues/31), [#35](https://github.com/Braspace/Braspace/issues/35), [#39](https://github.com/Braspace/Braspace/issues/39), [#40](https://github.com/Braspace/Braspace/issues/40) |
| [Interactive Development #7](https://github.com/orgs/Braspace/projects/7) | [#2](https://github.com/Braspace/Braspace/issues/2), [#3](https://github.com/Braspace/Braspace/issues/3), [#8](https://github.com/Braspace/Braspace/issues/8), [#13](https://github.com/Braspace/Braspace/issues/13), [#14](https://github.com/Braspace/Braspace/issues/14), [#15](https://github.com/Braspace/Braspace/issues/15), [#16](https://github.com/Braspace/Braspace/issues/16), [#19](https://github.com/Braspace/Braspace/issues/19), [#20](https://github.com/Braspace/Braspace/issues/20), [#21](https://github.com/Braspace/Braspace/issues/21), [#25](https://github.com/Braspace/Braspace/issues/25), [#26](https://github.com/Braspace/Braspace/issues/26) |
| [Product Launch #8](https://github.com/orgs/Braspace/projects/8) | [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11), [#27](https://github.com/Braspace/Braspace/issues/27), [#32](https://github.com/Braspace/Braspace/issues/32), [#34](https://github.com/Braspace/Braspace/issues/34), [#41](https://github.com/Braspace/Braspace/issues/41) |
| [Roadmap #9](https://github.com/orgs/Braspace/projects/9) | [#1](https://github.com/Braspace/Braspace/issues/1), [#4](https://github.com/Braspace/Braspace/issues/4), [#5](https://github.com/Braspace/Braspace/issues/5), [#12](https://github.com/Braspace/Braspace/issues/12), [#18](https://github.com/Braspace/Braspace/issues/18), [#24](https://github.com/Braspace/Braspace/issues/24), [#30](https://github.com/Braspace/Braspace/issues/30) |
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

At task kickoff, `main` contained `README.md` and `LICENSE`; the local prototype is **not yet pushed** to the organization repository by this coordination PR. Existing `gustavofullstack` branch is preserved. A 7-slide Google Slides presentation has been produced separately; the scientific calculation claims must remain clearly labeled as illustrative until validation. This coordination PR does not imply deployed or scientifically validated software.

## Project and mission notes

First reproducible milestone: choose **one** authoritative NASA lunar terrain/elevation resource, document its source/version/format/frame/checksum, compute **one** terrain-based horizon for **one** site and time interval, compare with trusted references, then expose that provenance in the UI and final demo. Additional metrics can follow if time and validation allow.

