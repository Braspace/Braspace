# BRASPACE — Operating roles, ownership and handoffs

**Status:** working team allocation, 2026-11-14. **Engineering project:** Lunar Landing Site Navigator / MoonProof. **Deadline:** November 15, 2026, 23:59 (Uberlândia local). This document is a proposed responsibility model published in GitHub; actual teammate acceptance requires their acknowledgment.

## Explicit decision: Gustavo is code-first

| GitHub owner | Main responsibility | Owns coding? | Focused issue examples | Handoff |
|---|---|---|---|---|
| @gustavofullstack — **Technical Lead** | **WRITE CODE:** Go/Rust integration, technical architecture, Moon globe renderer, mission HTML/PDF exporter, Docker/CI and technical deployment | **Primary** | #8 #9 #11 #12 #48 #54 #58 | Integration PR, CI evidence, backend/UI release artifact |
| @gfreiresjrp — **Backend/API Engineer** | Go API contracts, data normalization, NASA/LROC layer adapters, actual data ingestion and mission recovery | **Primary for backend** | #19–#24 #39 #46 #57 | Validated DTO/OpenAPI + API tests |
| @joeljato — **Scientific Computing Lead** | NASA terrain/ephemerides, Rust geometry, horizon and Moon coordinate accuracy, scientific test fixtures | **Code + science** | #13–#18 #40 #49 #56 | Verified frames, units, scientific validation report |
| @maccachera — **Research & Data Source Lead** | NASA/JPL/LRO/LROC/QuickMap resource research, product IDs, datasets, image catalog, attribution and licenses; **no coding requirement** | **Not required** | #1–#6 #38 #52 #55 #61 | Source manifest with direct links, SHA-256, CRS, permitted rights, IDs and local coordinates |
| @lisanogueira — **Product/UX and Innovation Lead** | Five-section IA, UI/UX, original gamification storyboard, competition review, team planning and demo storytelling; **no coding requirement** | **Not required** | #7 #25–#30 #37 #41 #47 #51 #60 | Original wireframes, user stories, acceptance examples, slides and review feedback |
| @Ninzinhu — **QA, Release and Submission Lead** | Non-code QA, accessibility and risk acceptance, public demo/project URLs, mission report review, documentation, retro; **no coding requirement** | **Not required** | #10 #31–#36 #42 #43 #50 #59 | Evidence ledger, QA signoff, screenshots, accurate NASA form checklist |

**Exception:** #11 official NASA final submission remains assigned to @gustavofullstack (authorized team owner); João prepares verification and release materials, but declarations must be accepted by an authorized human.

### Changes actually made in GitHub

- #7 MVP scope and prioritization → @lisanogueira (was @gustavofullstack).
- #10 public project/demo link QA and publication coordination → @Ninzinhu; deployment engineering remains @gustavofullstack.
- #37 six-person sync → @lisanogueira.
- #43 post-submission evidence archive → @Ninzinhu.
- #48 Pareto computation/technical decision receipts **remains @gustavofullstack** because it is code-heavy.
- New code tickets: #54 Super Moon 3D and #58 HTML/PDF reports are assigned to @gustavofullstack.
- All other old issues remain owned as recorded unless team chooses a different owner explicitly.

## Asynchronous handoff contract

Each non-code handoff should link **one issue**, an owner, a source-backed artifact (URL/JSON/MD/wireframe/screenshot), version/date, and one reproducible acceptance condition. Developer work uses its own PR, not shared branch commits. Engineering owner confirms assumptions before consuming researched data. Test evidence, not anecdotes, closes issues.

**Work branching:** `team/<username>/spaceapps-2026` or separate `feat/<owner>/<focus>` branch derived from latest main. Never force-push coworkers, never copy competitors' code/assets without compatible license/credit, and never merge unreviewed source claims.

**Scientific handoff:** @maccachera → @joeljato (DEM/frames) → @gfreiresjrp (data types and API) → @gustavofullstack (integration/3D) → @Ninzinhu (QA). @lisanogueira determines the simplest understandable end-user path throughout, without blocking engineering on unapproved visual complexity.

## Five-module navigation

**Explore** (2D/3D lunar maps) · **Compare** (candidate sites/dates) · **Recover** (delays/alternatives) · **Science & Engineering** (objective/constraint negotiation) · **Evidence & Learn** (proof, citations, mission report and guided educational challenges).

## Release and privacy

The GitHub repository remains private; the **demo URL and project URL must be publicly accessible anonymously** for NASA judging. Do not infer the repository must be public: publish a standalone web experience and verify anonymous access. Do not represent synthetic Go/Rust classifier output as NASA-validated calculations. 7-slide maximum or video 30 seconds maximum, English written materials, SI declarations and proper media credits.
