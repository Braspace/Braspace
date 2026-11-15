# P0 CI pre-step evidence — 2026-11-14 19:12 America/Sao_Paulo

Scope: read-only audit of main and selected PRs; this document is the only proposed change, isolated from frontend/science ownership.

## Snapshot (do not treat as release approval)
- Latest observed main commit: `bb171b5e5c8302070f75cfba4e0ce1a589e63e00` (merge PR #209). This is a point-in-time observation, not a locked release HEAD.
- #136 closed, head `7a0b9a2f256a6128d1a73d70ff993e1ec6fdd009`; #149 open draft `0a06abab4e8f0b658f412a868e5a713a6a81892f`; #143 closed `8b54c128e507d4b5173c43b65c7e054cd07fbdde`; #115 closed `733462ccd98a004693331d5ecdd5268d56412ce4`.
- #137 closed `98278b0e375eec5bc632d1b23e11c1e3e1143413`; #139 closed `75f95398f71b11baa40c1ebf20d3be28c5c0a1b5`; #142 open draft `e608daeac268f7d1747495541d85dc08fefe16a1`; #116 open `0d0abc4099dc886666a97c5a177444b24d059e45`.
- #189 open draft `81046534131976797bec0621c445edc7da94f516`. Its workflow run [43641622055](https://github.com/Braspace/Braspace/actions/runs/43641622055) concluded failure; job [132590224939](https://github.com/Braspace/Braspace/actions/runs/43641622055/job/132590224939) failed with `steps=null` in connector response; release job 132590241059 skipped. This **does not establish that any test step executed**, nor conclusively identify root cause.
- Commit combined-status endpoint for the observed main SHA returned zero statuses; absence is NOT success.

## Bounded backlog mapping
Read `docs/agents/README.md` and `docs/agents/BRASPACE_1000_TASKS.csv` at #136 head. Relevant queued P0 identifiers: BR-T0001 (specify LOLA provenance), BR-T0002 (inspect source evidence), BR-T0003 (minimal acceptance design). These remain QUEUED; no Opus/Haiku/Sonnet/Hydrogen job ID was verified. This audit is not evidence those tasks are complete.

## Required follow-up, fail closed
1. GitHub Actions administrator checks runner allocation, workflow permissions, billing/limits, and Actions job logs for run 43641622055; capture actual failure message and retry on the **final** PR SHA.
2. Capture required check conclusions and test artifacts on final HEAD, not on an earlier SHA. Treat missing/empty steps as NOT VERIFIED, not PASS.
3. Require science provenance and PRELIMINARY/UNVERIFIED badges, source timestamps, explicit units, and unavailable states for LOLA/SPICE metrics.
4. Request Heloísa/João Victor review of their owned UI work. No merge, public release, or NASA submission without explicit human authorization and verified green required checks.

Evidence scope: GitHub connector metadata only. No local Go/Rust/Node/browser tests were run in this audit.
