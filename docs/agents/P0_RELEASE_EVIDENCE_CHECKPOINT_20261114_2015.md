# P0 release evidence checkpoint — 2026-11-14 20:15 America/Sao_Paulo

This is an AI-assisted **audit checkpoint**, not a NASA submission or scientific validation. No teammate source files were modified.

## Source readback
- `docs/agents/README.md` on main: 10 plans, 100 objectives, 1000 queued tasks. Model lanes are recommendations, **not running workers**.
- `docs/agents/BRASPACE_1000_TASKS.csv` on PR #136: BR-T0001 through BR-T0010 are P0, OBJ-001 (LOLA south-pole DEM hash and PDS3 label). Dependencies are sequential. No completion claimed.
- Latest repository commit returned by commit search: `5cb89a36ecb68848067fec14a8470e3ae5354507` (merge #228). **Search recency alone is not proof of the main ref SHA**; re-read main HEAD at release.
- PRs observed open in search include #233 (CI public smoke/Chromium), #232 (Polar Lab), #231 (visibility engine), #230 (visual fidelity), #221 (science integration), #220 (reduced motion), #219 (solar wording), #218 (illumination assumptions). Review each against main before integration.
- Commit `5cb89a36ecb68848067fec14a8470e3ae5354507`: connector returned zero PR-triggered workflow runs and zero combined commit statuses. **This is missing evidence, not a PASS and not proof that jobs failed pre-step.**
- Previous GitHub Actions pre-step failures (#145/#146) remain a separate investigation; do not infer root cause from absent steps.

## Focus: at most ten P0 tasks
| ID | Scope | Status |
|---|---|---|
| BR-T0001 | Specify LOLA DEM hash/PDS3 acceptance | QUEUED |
| BR-T0002 | Inspect authoritative source and hashes | QUEUED |
| BR-T0003 | Design minimal provenance change | QUEUED |
| BR-T0004 | Implement isolated change | QUEUED |
| BR-T0005 | Negative tests for missing/malformed data | QUEUED |
| BR-T0006 | Integration regression | QUEUED |
| BR-T0007 | UI source/status validation | QUEUED |
| BR-T0008 | Scientific/security review | QUEUED |
| BR-T0009 | Record reproducible evidence | QUEUED |
| BR-T0010 | Final SHA, CI and human gate | QUEUED |

## Fail-closed release gate
1. Pin exact final main/PR HEAD SHA, branch ancestry, changed paths and merge conflicts. No force push or duplicate integration.
2. Collect GitHub Actions **job IDs, attempt, steps, logs and required checks** on that final SHA. If pre-step failure, mark BLOCKED and do not claim tests ran.
3. Collect local tests separately with exact command, environment, exit code and output. PR descriptions about other agents' local tests are not a substitute for independent rerun.
4. Keep all LOLA/SPICE/PGDA metrics `PRELIMINARY` or `UNVERIFIED` until independently verified with source, hash, units, epoch and uncertainty. Never infer RF link or power generation from geometric visibility alone.
5. Obtain Heloísa's UI/product review and João Victor's owned-area review where applicable; retain original authorship.
6. Require human approval before merge, public Pages/deploy, repository visibility changes or NASA form submission. Official target: 2026-11-15 23:59 America/Sao_Paulo.
7. No Opus/Sonnet/Haiku/Hydrogen worker is `RUNNING` without provider execution proof and job ID.

## Verification scope
Documentation-only change. No Go, Rust, Node, browser, Docker or scientific test executed in this checkpoint. Verify by GitHub file readback and PR diff; do not interpret a documentation-only readback as runtime QA.
