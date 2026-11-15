# P0 — Horizon reach scientific release decision (2026-11-15)

Status: **BLOCKED / PRELIMINARY / UNVERIFIED**. This note is an audit and decision gate, not independent scientific validation or permission to publish.

## Evidence and conflict

- Baseline main observed: `11cd66bf6bce42c1884c4385531dd60e8b49d00a` (merge PR #264); recheck before any integration.
- Scientific review: PR #263 https://github.com/Braspace/Braspace/pull/263 reports a controlled horizon ray-march study comparing 100 km and 200 km reach. **These are author-reported results, not independently reproduced in this audit.**
- At Malapert Massif, reported sunlight fraction changes **38.44% → 33.84%** and longest Sun-centre darkness **670 h → 3,389 h**. At Peak Near Shackleton, reported sunlight fraction **80.38% → 75.52%**. The 100 km cap can understate terrain obstruction.
- The report says 200–250 km stability for Peak Near Shackleton, but the DEM north-of-80°S coverage limit, solar disc/centre distinction, 0.05° margin, and unexplained PGDA difference remain material uncertainty.
- PR #143's API series are explicitly PRELIMINARY; a pinned SHA establishes file identity, **not** physical correctness. Existing web, API, scenario and educational output may still reflect the 100 km horizon.

## Required human decision before NASA release

1. Science owner selects **(A)** regenerate and independently review all affected series, checksums, API exports, web metrics and derived energy/night verdicts, or **(B)** retain the 100 km series with prominent Malapert **and** Peak Near Shackleton caveats on each affected screen and slide. Neither option is approved by this note.
2. Verify every affected product value against selected data revision and explicitly disclose centre-vs-disc and model coverage limitations. No claim of validated power/communications or mission-grade accuracy.
3. Require CI checks on **final HEAD**, reproducible logs, and human approval including appropriate scientific and design owners. Missing workflow runs/statuses are **NOT VERIFIED**, not green.
4. Keep NASA submission and public release blocked until the team signs off on the scientific decision, demonstration and submission receipt.

## Audit scope / bounded task routing

- Backlog source: `docs/agents/README.md` and `docs/agents/BRASPACE_1000_TASKS.csv` from PR #136.
- Relevant P0 queue: BR-T0001, BR-T0002, BR-T0003, BR-T0004, BR-T0005, BR-T0006, BR-T0007, BR-T0008, BR-T0009, BR-T0010; all remain **QUEUED** absent independently verified completion evidence.
- Related P0 issue: #31 (scientific honesty). No worker Opus/Sonnet/Haiku/Hydrogen is asserted RUNNING without an actual provider job ID.
- Audit observation: main SHA 11cd66bf6bce42c1884c4385531dd60e8b49d00a; commit workflow-runs (PR-triggered, first page) returned none, combined statuses returned none. This does not establish a pre-step failure for this SHA.

## Non-executed verification

No local science pipeline, Go, Rust, Node, Chromium, or GitHub Actions test was executed by this audit. Proposed review commands, **not executed**: `python3 -m unittest discover -s science/tests`; verify SHA-256 of LOLA inputs; replay horizon study on the pinned DEM; compare generated site and API exports. Recheck run/job step logs before claiming CI execution.

No changes to scientific data or teammate-authored code. No merge, deploy, or NASA submission authorized.
