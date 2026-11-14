# BRASPACE — PR integration and controlled merge review (2026-11-14)
**Source:** live linked GitHub API; all URLs refer to private `Braspace/Braspace`. **Scientific state:** preliminary, NOT NASA flight-certified. **Deadline:** user-provided NASA submission 2026-11-15 23:59 America/Sao_Paulo.

## Actual main merges verified
- #92 LOLA polar elevation asset already merged by parallel actors.
- #115 Onboard live source bridge already merged by parallel actors.
- #131 / #134 native-step transitions and traversal hardening already merged by parallel actors.
- #166 Dockerfile all-tests test stages + single CI (Go/Rust/Web/Science, Compose/Postgres), merged by parallel agent. Important: GHCR publication was initially unconditional on main.
- #168 Polar Lab live API + scientific-seal hardening, merged by parallel agent.
- **#174 security(ci): GHCR publish explicit opt-in**, merged by this integration session into main with squash commit `1444691e88138c04b366335c20dbe97bc216e6c8`; readback of `.github/workflows/ci.yml` confirmed `vars.BRASPACE_GHCR_RELEASE_ENABLED == 'true'`.

## Current open set and disposition
| PR | Function, dependencies | Gate / disposition |
| --- | --- | --- |
| [#148](https://github.com/Braspace/Braspace/pull/148) | Parent V3 Heloísa full-screen source/terrain/tokens; based on main | `mergeable=false` as of audit after main CI changes; reconcile parent vs main and author @lisanogueira review. No blind merge. |
| [#165](https://github.com/Braspace/Braspace/pull/165) | Draft child of #148, consolidated A–H + kits + Docker/Chromium and 1,000 V3 extra tasks | 106+ changed files; source and original agent PRs preserved; final-head CI currently failed before steps, human review requested @lisanogueira/@Ninzinhu/@gfreiresjrp/@joeljato. Do not merge until parent and CI ready. |
| [#164](https://github.com/Braspace/Braspace/pull/164) | Specialist A Mission Control + B Explore on #148 | Exact source files and tests incorporated in #165; avoid duplicate merging unless parent integration strategy is agreed. |
| [#163](https://github.com/Braspace/Braspace/pull/163) | Specialist C Compare + D Recover on #148 | Exact source files and tests incorporated in #165; compare/replan engine data source PRE; avoid duplicate merges. |
| [#167](https://github.com/Braspace/Braspace/pull/167) | Specialist E Cockpit + H Evidence on #148 | Exact source files and tests incorporated in #165; model assumptions marked SIM, source PRE. |
| [#169](https://github.com/Braspace/Braspace/pull/169) | Specialist F Landing Lab + G Debrief on #148 | Exact source files and tests incorporated in #165; actual educational 3DOF simulation / sessionStorage attempt transfer. Review @lisanogueira/@Ninzinhu. |
| [#160](https://github.com/Braspace/Braspace/pull/160) | Specialist K1 Planning, K2 Present, K3 Activity on #148 | Exact source files/tests incorporated in #165. Planning API schema, CSV and escape defects repaired in integration branch. |
| [#102](https://github.com/Braspace/Braspace/pull/102) | Heloísa source-science/LOLA/NAIF 21-file current diff | Updated since an earlier 8-green-group SHA; now `mergeable=false`. Needs fresh science/author review and source-byte comparison; no outdated green claim. |
| [#170](https://github.com/Braspace/Braspace/pull/170) | README/API/provenance/test/deploy documentation; based on main | Source docs-only. Local tests cited by author but human reviewer request pending; verify scientific claims before merge. |
| [#136](https://github.com/Braspace/Braspace/pull/136) | Alternative initial Mission Studio 7 screens + Go sky validation flag | Remains draft, diverges from Heloísa's terrain-first design. Carry source-safe API contract and documentation forward deliberately, not duplicate home page. |
| [#149](https://github.com/Braspace/Braspace/pull/149) | Fail-closed API impossible metrics fix stacked on #136 | Preserve science guard; retarget/reconcile with current V3 before superseding old UI. |
| [#142](https://github.com/Braspace/Braspace/pull/142) | Baked NASA GLB texture correction and markers | Draft, main conflict at audit; source licensing, WebGL and public-asset paths need review. |
| [#91](https://github.com/Braspace/Braspace/pull/91) | Alternative dashboard shell and i18n | Mechanically mergeable but UI duplication vs Heloísa V3; deduplicate in product review. |
| [#135](https://github.com/Braspace/Braspace/pull/135) | False science-validated label guard on #116 | Draft original stack remains open; already replayed through merged #168; do not merge duplicate patch. |
| [#116](https://github.com/Braspace/Braspace/pull/116) | API live bridge on original team integration branch | Already replayed into main via merged #168; consider closing original stacked PR only after authored review, do not merge twice. |
| [#89](https://github.com/Braspace/Braspace/pull/89) | Independent Horizons benchmark | 53 files, draft, reviewer @joeljato; numerical source method differences and attribution. |
| [#75](https://github.com/Braspace/Braspace/pull/75) | LOLA terrain-horizon science parent | Draft; `mergeable=false` as of audit, source transform verification required. |
| [#82](https://github.com/Braspace/Braspace/pull/82) | Three-site Sun/Earth pipeline on #75 | Parent-dependent; regenerate against #86 correction before merging NASA-derived files. |
| [#86](https://github.com/Braspace/Braspace/pull/86) | Pixel registration and LT+S correction on #75 | Parent-dependent scientific math, reviewer @joeljato; no false certification. |
| [#98](https://github.com/Braspace/Braspace/pull/98) | PGDA benchmark on #86 | Different pixel/epoch/visibility denominators; reviewer @joeljato/@maccachera required. |
| [#90](https://github.com/Braspace/Braspace/pull/90) | NASA source catalog / visual-reference rights | Draft, `mergeable=false`; @maccachera data and image rights review. |
| [#80](https://github.com/Braspace/Braspace/pull/80) | NASA kernel/source SHA integrity tests on #75 | Parent-dependent; reproducible hash does not certify science; reviewer @joeljato. |

## Controlled merge order
1. Main security and source integrity already merged (#134, #166, #168, #174) remains source of truth.
2. Correct #148 parent conflicts against the latest main in an owner-approved branch, preserve Heloísa original screens and source labels.
3. Verify #165 integration against that exact parent SHA. It includes specialized files without changing their original PR branches. Decide whether to squash #165 as a single feature or merge specialist PRs individually; **never both**, preventing duplicated commits and accidental same-file overwrites.
4. Restore operational GitHub Actions runner and job logs (tracking [#146](https://github.com/Braspace/Braspace/issues/146)); run Dockerfile all-tests, PostgreSQL, Go -race, Rust --locked, Node20/22, source manifest checks, Chromium desktop and 390px mobile on exact final HEAD.
5. Obtain named reviews of visual fidelity, API, science and QA, then merge without force-push and verify deployed anonymous demo, seven-slide deck and NASA submission proof.
6. Preserve private repository until agreed public release; GHCR publishing is opt-in (variable `BRASPACE_GHCR_RELEASE_ENABLED`) and must be separately authorized.

## Evidence accounting
The linked GitHub PRs are concrete work by assigned coding agents; their quoted local test successes are **not** newly re-executed in this integration environment. The connected desktop runner was offline, and the GitHub Actions jobs returned pre-step failures; do not label current integration as CI green. The new V3 `DESIGNER.mds` is grounded in the screenshots and source code; the Claude artifact's hidden system prompt was not retrievable from its login-protected page.
