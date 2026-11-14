# P0 final-HEAD release evidence gate (2026-11-14)

Scope: BRASPACE MoonProof, NASA Space Apps 2026. This is an **audit checklist**, not certification, deployment, or submission.

## Immutable reference snapshot
- Observed recent main commit: `dd2cd622526f8d4fca7a3d9fa21680be05eae887` (MoonProof core integration #182). Re-read `main` before any release decision; this snapshot can become stale.
- Mission Studio #136 and fail-closed metrics #149 are still listed as open, although integration #175 was merged to main as `4c04bfa2344989663a5080ff0f64a20521ddc74e`. **Do not merge both source PRs again** without an exact diff and ancestry check.
- CI infrastructure blocker: #145 / #146. Reported zero-step failures are **NOT test failures**; root cause not independently confirmed in this document.
- Scientific output remains PRELIMINARY / UNVERIFIED unless separately source-gated; never relabel as VALIDATED based on UI or screenshot evidence.

## Release gate — fill in evidence, never infer
| Gate | Required evidence | Current result |
| --- | --- | --- |
| Final source | main SHA + selected PR head SHA + compare/diff, collision review | NOT VERIFIED |
| CI startup | Actions run/job URL showing at least one executed step and downloadable logs | BLOCKED (#145/#146) |
| Web / mobile | Node 20/22 commands, logs, 390px and desktop screenshots on exact HEAD | NOT VERIFIED |
| Backend/science | Go race, Rust tests, data hashes, provenance and error-path checks | NOT VERIFIED |
| Fullstack | Docker/Postgres/API/Chromium runs on same commit | NOT VERIFIED |
| Ownership | Heloísa visual approval; João Victor onboard/mobile approval; science owner source review | NOT VERIFIED |
| Public demo | Anonymous-access URL, asset smoke, no private repo/data exposure | NOT VERIFIED |
| NASA submission | Human-reviewed final text, seven slides, disclosure, portal receipt | NOT SUBMITTED |

## Ordered recovery
1. Repo/org owner checks Actions billing, spending limit, runner policy and job annotations without disclosing secrets; attach exact run IDs to #145.
2. Rerun **one** web job; require a visible executed step and logs before running the full matrix.
3. Re-fetch latest main and candidate PR heads; avoid duplicate integration of #136/#149 after #175 and preserve original Heloísa/João Victor branches.
4. Execute and link exact-HEAD web, Go, Rust, science and browser regressions; retain UNKNOWN and source limitations in the product.
5. Obtain explicit human sign-off; only then consider merge, public demo, or NASA submission. Deadline is not authorization to bypass gates.

Backlog references: `docs/agents/README.md`, `docs/agents/BRASPACE_1000_TASKS.csv`. Candidate P0 evidence tasks: BR-T0001, BR-T0002, BR-T0009, BR-T0010. These remain QUEUED unless actual worker job IDs and results exist; this document does not claim they were executed by Opus/Sonnet/Haiku/Hydrogen.
