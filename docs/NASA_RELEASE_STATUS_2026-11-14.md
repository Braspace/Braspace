# BRASPACE NASA Space Apps 2026 — Submission and release control

**Snapshot:** 2026-11-14 (America/Sao_Paulo). **Official deadline:** 2026-11-15 23:59 local; check the actual portal countdown. Repo **private**. **Do not claim submitted until NASA portal confirms.**

## Confirmed engineering

| Evidence | Scope | Verification |
|---|---|---|
| [PR #45](https://github.com/Braspace/Braspace/pull/45) | Typed Go↔Rust smoke and Docker | Merged and CI passed; calculations consume caller-provided unverified angles |
| [PR #62](https://github.com/Braspace/Braspace/pull/62) | QA docs | Merged |
| [PR #70](https://github.com/Braspace/Braspace/pull/70) | Battery/earth-visibility onboard **educational** simulator | Merged, `POST /api/onboard/evaluate`, `UNVERIFIED_INPUTS` |
| [PR #53](https://github.com/Braspace/Braspace/pull/53) | Site catalog, delay recovery, PostgreSQL migrations/ingest, typed source series and OpenAPI | Merged after CI green, main squash `a4bffcf687457e644c5f69d526ad2d83e7861c6a`; only two synthetic series currently |
| [PR #72](https://github.com/Braspace/Braspace/pull/72) | Printable mission HTML report / browser PDF with risk ledger | Merged after resolved branch collisions and full Go/Rust/Postgres CI green, squash `71d27336ce082e6681dbf7bce18b4eaf3d952313` |
| [PR #73](https://github.com/Braspace/Braspace/pull/73) | Original MoonProof 3D web UI, five-module navigation, NASA SVS aesthetic map and Go simulator | Draft at snapshot; Node UI CI passed; post-reconcile full Go/Rust/PostgreSQL pipeline awaiting final status and visual QA |
| [PR #71](https://github.com/Braspace/Braspace/pull/71) | Authentic NASA LOLA DEM source manifest, label interpretation and source-image rights | Draft; data verification reported SHA-256 match; **not integrated** into physical calculations |
| [PR #44](https://github.com/Braspace/Braspace/pull/44) | Six-person workboard, 65 issues, sources/licenses, 15 competitors, scientific/UX design and branch conflict audit | Draft; documentation only |

## Critical NASA judging blockers — P0

- [ ] **Real science:** Use the downloaded official `LDEM_80S_80M.IMG` from NASA PDS in a traceable terrain-horizon calculation for at least one real, sourced south-polar site. Preserve product label, projection, height units, SHA-256 and original frame.
- [ ] **Ephemerides:** Integrate verified Sun/Earth direction (SPICE/JPL) at that site/date. Independently check reference values and report angular/time-grid error. Do not display synthetic values as NASA-derived.
- [ ] **UI evidence:** Load verified scientific results to Explore/Compare/Recover view; keep separate from educational synthetic ground simulation, which may be demonstrated but must be labelled.
- [ ] **Deploy real project:** Publish independent anonymous-readable HTTPS web project without exposing private repo secrets or credentials; test in private/incognito browser. GitHub private repository link alone is not public project URL.
- [ ] **Public demo:** Existing candidate deck https://docs.google.com/presentation/d/1Nnv1C1XU2SQCmnPam1REc5_2Wix_Uo4x3u5Smmk3tLs/edit includes seven English slides, but contents must be updated to reflect **current verified** implementation; test anonymously. AI-generated visuals must be marked per NASA rules.
- [ ] **Release QA:** Check report printable HTML / Save as PDF, 3D fallback on low-end/browser, accessibility, crediting of NASA SVS/LROC sources and code/asset originality.
- [ ] **NASA form:** Confirm Project Name, Summary, Project Demonstration public URL, Project public URL, Project Details, SI declaration, actually used NASA data links, other sources, terms and originality checkboxes. Authorized team owner must click **Submit for Judging** and capture portal confirmation before local deadline.
- [ ] **Team registration:** João confirms all six members and local event registration in NASA portal.

## Work ownership — no forced coding for non-developers

| Person | Focus |
|---|---|
| @gustavofullstack | Code-first: Go/Rust integration, 3D UI, mission report, Docker, tech QA/release owner |
| @gfreiresjrp | Go API, source ingestion, delay/resource adapter and Postgres |
| @joeljato | Verified Rust/NASA LOLA terrain horizon, frames, SPICE angular geometry and science accuracy |
| @maccachera | NASA resource URLs, PDS manifest and rights/credits, data handoff (coding optional) |
| @lisanogueira | Product/UX, educational gameplay, coherent 7-slide English narrative (coding optional) |
| @Ninzinhu | QA, risks, accessibility, anonymous links and NASA form validation (coding optional) |

## Engineering merge order — avoid lost work

1. #53 merged; Go+Postgres source of truth now on main, don't merge older copies of teammate branches.
2. #72 report merged with all Go/mission routes preserved.
3. #73 use only new `web/` paths and `.github/workflows/moonproof-web.yml`; merge after both Node and Go CI pass, and confirm production integration is still separate.
4. #71: reconcile CI changes **additively**, preserve Postgres jobs, review source claims/rights; do not force-push teammate branch.
5. #44 can be merged after owner review, refresh issue/PR state first.
6. Once genuine LOLA+SPICE series are verified in the app, update NASA form and release deck accordingly.

## Release honesty

**No flight-grade promise:** onboard is an *educational ground simulator*, not autonomous spacecraft avionics. Solar geometry is not generated electricity, Earth's geometric visibility is not guaranteed radio contact, NASA SVS global texture is not high-resolution LOLA terrain. **If science integration cannot be verified, disclose that explicitly** in all public materials.

**User's source-vs-demo privacy:** private GitHub source can remain private while a separate public project/demo is made accessible; public judging links are mandatory.

Tracking issues: [#1–#69](https://github.com/Braspace/Braspace/issues), [release checklist #34](https://github.com/Braspace/Braspace/issues/34), [submission #11](https://github.com/Braspace/Braspace/issues/11), [site API #21](https://github.com/Braspace/Braspace/issues/21), [science #65](https://github.com/Braspace/Braspace/issues/65), [3D #54](https://github.com/Braspace/Braspace/issues/54), [report #58](https://github.com/Braspace/Braspace/issues/58).
