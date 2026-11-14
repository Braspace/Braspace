# BRASPACE — Super Moon 3D, mission reports and recovery delivery roadmap

**Updated:** 2026-11-14. **NASA deadline:** 2026-11-15 23:59 Uberlândia local. This document is the implementation plan. Feature issue creation and documentation do NOT mean that code is implemented.

## Verified project foundation

- [x] PR #45 merged into main, commit 093c0771448b8515db0f13478ef49d4587e67d4a: baseline Go HTTP API + Rust geometry classifier for **caller-supplied** look angles, Docker and integration CI.
- [x] Source PR CI green: https://github.com/Braspace/Braspace/actions/runs/43602906660 (Go tests, Rust tests, Go→Rust smoke, Compose smoke).
- [ ] NASA LOLA numerical terrain used in running calculations — not yet verified.
- [ ] NASA/JPL SPICE Sun/Earth numerical input used — not yet verified.
- [ ] 3D Moon globe with authorized NASA visual assets — future implementation.
- [ ] Mission Report HTML / print PDF — future implementation.
- [ ] Mission replan UI + a realistic recovery example — future implementation.
- [ ] Public final application URL and independently anonymous-accessible English 7-slide deck — release gate.
- [ ] Official NASA Submit for Judging confirmation — human owner gate.

## Shortest credible vertical slice for NASA judging (P0)

1. **Science source**: Maccachero #1/#2/#3/#55 delivers exact NASA LOLA DEM/NAIF resource, frame, URL, checksum; Joel #14/#15/#16 validates horizon and ephemerides.
2. **Typed service**: Gabriel Freire #19/#20/#21/#46 joins true science calculations to a date-based scenario and replan response.
3. **Usable view**: Gustavo #54 implements minimal source-backed lunar globe or 2D fallback; Heloísa #47/#60 provides intuitive 5-area design.
4. **Evidence**: Gustavo #58 implements a deterministic mission HTML report and browser PDF; João #59 validates risk reporting and public links.
5. **Release**: Heloísa #27 reviews 7-slide English demo; João #10/#32 checks anonymous access; Gustavo #11 performs authorized NASA submission.

**Hard rule:** if actual NASA scientific dataset and validation are behind, stop adding visual effects, PDF and games until the scientific and public submission gates are met. The source repo can remain private while a separately hosted project and demo are public.

## New issue map / responsibility

| GitHub issue | Owner | Deliverable | Sprint |
|---|---|---|---|
| [#54](https://github.com/Braspace/Braspace/issues/54) | @gustavofullstack | Original high-performance WebGL Moon globe with source-backed asset handling | P0 |
| [#55](https://github.com/Braspace/Braspace/issues/55) | @maccachera | NASA/LROC/Google source and reuse-rights manifest | P0 |
| [#56](https://github.com/Braspace/Braspace/issues/56) | @joeljato | Lunar coordinate and polar DEM mesh alignment science checks | P1 |
| [#57](https://github.com/Braspace/Braspace/issues/57) | @gfreiresjrp | Typed official lunar imagery/layers adapter, no Google scraping | P1 |
| [#58](https://github.com/Braspace/Braspace/issues/58) | @gustavofullstack | Mission Report HTML + print-to-PDF with evidence and risk categories | P0 |
| [#59](https://github.com/Braspace/Braspace/issues/59) | @Ninzinhu | Non-code risk taxonomy, report QA, release checks | P0 |
| [#60](https://github.com/Braspace/Braspace/issues/60) | @lisanogueira | Gamified mission challenge storyboard and five-screen navigation | P1 |
| [#61](https://github.com/Braspace/Braspace/issues/61) | @maccachera | NASA/LROC regional gallery and credits catalog | P1 |

## Ownership changes from user's request

- #7 MVP planning → Heloísa.
- #10 public link coordination → João.
- #37 six-person progress sync → Heloísa.
- #43 scientific-debt archive/post-submission → João.
- **Gustavo retains technical coding tasks** (#8, #9, #12, #48, #54, #58) plus the authorized submission action (#11). This does not require every teammate to code.
- Gabriel Freire codes Go and map API; Joel owns science/Rust; Gabriel Maccachero handles sources only; Heloísa handles product/UX; João handles QA/release.

## New documentation register

- [TEAM_ROLES_AND_HANDOFFS_2026.md](TEAM_ROLES_AND_HANDOFFS_2026.md)
- [SUPER_MOON_3D_TECHNICAL_SPEC.md](SUPER_MOON_3D_TECHNICAL_SPEC.md)
- [MISSION_REPORT_AND_RISK_SPEC.md](MISSION_REPORT_AND_RISK_SPEC.md)
- [LUNAR_ASSETS_RIGHTS_AND_SOURCES.md](LUNAR_ASSETS_RIGHTS_AND_SOURCES.md)
- [GAMIFIED_LUNAR_UX_AND_HUB.md](GAMIFIED_LUNAR_UX_AND_HUB.md)
- [PRODUCT_REQUIREMENTS_TRACEABILITY.md](PRODUCT_REQUIREMENTS_TRACEABILITY.md)
- [COMPETITORS_2026_15_REPOS.md](COMPETITORS_2026_15_REPOS.md)

## Explicit scope exclusions

No copied Google Maps Moon/QuickMap tiles, no NASA endorsement, no AI-generated NASA branding, no mission flight-grade claim without validated DEM/ephemerides, no arbitrary generic readiness score and no automatic claim that API calls, Google widgets, gallery or mission reports are working until there is running evidence.

## Project management synchronization

GitHub Issues #1–#43, #46–#52 and #54–#61 are tracked in GitHub. The eight existing GitHub Projects are used as target links in issue bodies/workboard; actual Projects v2 board item creation is **not** verified with this connector. Keep that limitation visible.
