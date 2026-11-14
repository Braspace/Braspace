# BRASPACE — Five-module Moon experience and game design

Product/UX owner: @lisanogueira (#60). Developer: @gustavofullstack (#54/#58). QA: @Ninzinhu (#59). **Status: product design only; no completed UI is implied.**

## Five principal navigation areas

1. **Explore** — 2D/3D Moon with NASA-derived color/terrain layers, site picker, coordinate entry, Sun/Earth sky positions and actual local horizon, where scientifically available.
2. **Compare** — compare two or more sites/dates at common UTC horizon, separately showing sunlight hours, Earth visibility hours, longest darkness and longest communications obstruction.
3. **Recover** — select +24/+48/+72h landing delay or changed hardware assumption; recalculate constraints, expose active failure, show real viable alternatives or state none was found.
4. **Science & Engineering** — mission objectives and engineering thresholds displayed together; explicitly show trade-offs rather than a universal weighted score.
5. **Evidence & Learn** — citations, source IDs, computational limitations, beginner explanations, verified versus synthetic badges, source-linked educational images, risk report and export HTML/PDF.

## Original educational mini-challenge

**Save the lunar mission after a missed window**: choose a site and nominal date; inspect the real terrain-constrained visibility timeline; simulate a 48-hour slip; explain how light/communication changed; choose alternative date/site or mission resource; request a mission report; review the evidence. The interface rewards the learner for substantiated decisions, not for fictional NASA mission readiness.

### Optional educational achievements

- Horizon Explorer — inspected Sun/Earth skyline and named a terrain obstruction.
- Window Analyst — compared distinct solar and geometric Earth visibility intervals.
- Recovery Planner — tested a delayed case and explained the binding constraint.
- Evidence Keeper — viewed the dataset provenance, model assumptions and validation limitations.

These are BRASPACE educational labels. Do not imply NASA accreditation, safety certification or measured engineering success. If inputs are synthetic, the interface says so prominently and does not fabricate results. A game scenario with no actual NASA-derived values is a clearly labelled tutorial only.

## Product artifacts from Heloísa (no coding required)

- [ ] Original desktop/mobile wireframes for the five navigation modules and first-time user flow.
- [ ] Simple versus Expert progressive disclosure sharing one source of calculation truth.
- [ ] 90-second self-guided walkthrough storyboard and final English <=7-slide presentation copy.
- [ ] Clear typography, keyboard navigation, high contrast, low motion and 2D fallback.
- [ ] Educational explanations of lunar polar illumination, apparent Earth position, terrain obstruction, power versus light, RF link versus geometric line-of-sight and lunar orbital cycles.
- [ ] Permission and attribution review for all NASA/LROC photo cards, plus SI-generated artwork markings.
- [ ] A PR-linked visual QA package with screenshot/wireframes and explicit unavailable states for missing NASA science.

**Important research fact:** competing projects already have lunar-night games and 3D terrain. Distinguish BRASPACE by an accessible **science–engineering recovery decision** with auditable source evidence, not simply by a game or large globe.

## Handoff order

Maccachero supplies legitimate NASA/LROC assets and coordinates; Joel validates coordinate frames; Gabriel Freire supplies typed scenario API; Gustavo implements renderer/export; Heloísa reviews layout and teaching value; João signs off reports/public URL/accessibility. **Deadline rule:** verified science and a working public demo outrank game polish.
