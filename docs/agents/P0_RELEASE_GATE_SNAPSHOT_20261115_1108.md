# P0 release gate — evidence snapshot (2026-11-15 11:08 America/Sao_Paulo)

This document is a **read-only audit snapshot**, not a release approval. Source: GitHub connector, repository `Braspace/Braspace` (private). Do not publish this document outside the private repository.

## Observed refs and competing work
- Recent main commit returned by commit search: `20e6ef8825c3dc963ca439927bf6fd2acfe1dfe2` (merge PR #313). **Re-read main HEAD before release**: commit search is not an atomic ref read.
- Open PR search included #315, #314, #312, #311, #309, #307, #306, #303, #299, #298, #296, #292, #291, #289, #288, #287, #279, #237, #177, #165, #102. Search output is a snapshot, not a complete CI or approval inventory.
- Legacy requested PRs #136, #149, #143, #115, #137, #139, #142, #116 were not individually revalidated for merged/closed state in this cycle. Do not infer merge from absence in open results.
- Open P0 issues observed: #7, #13, #16, #25, #26, #31, #34, #42. Ownership is recorded in each issue; do not take over Heloísa/João Victor files.
- `docs/agents/README.md` and `docs/agents/BRASPACE_1000_TASKS.csv` were read. The first ten P0 records are BR-T0001 through BR-T0010, all QUEUED in the observed CSV. They are **not** evidence of external workers.

## Release blockers (fail closed)
1. Record the **exact final** main SHA, branch protections, required check names, and the check-run conclusions for that SHA. An empty status or workflow-run list is **UNKNOWN**, not PASS.
2. For every required check, require conclusion `success` on the **same** final SHA. `skipped`, `neutral`, `cancelled`, missing, or stale SHA are not sufficient without an explicitly documented protection policy.
3. Retrieve failed Actions job detail and step array. Historical jobs with `steps=null` must be classified `PRE_STEP_SUSPECTED`, not evidence that tests ran or proof of root cause. GitHub billing/runner allocation should be investigated with repository administrators.
4. Obtain human reviewer sign-off and scientific provenance review. Retain `PRELIMINARY/UNVERIFIED` for unvalidated science and `SYNTHETIC` for simulation.
5. Confirm public demo access, assets, NASA form, attribution and AI disclosure with authorized owners. **Do not deploy or submit** from this audit.

## Reproduction commands (not executed by this automation)
```bash
set -euo pipefail
REPO=Braspace/Braspace
gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha'
# Replace SHA with the value returned above, not a cached value.
SHA="<FINAL_MAIN_SHA>"
gh api "repos/$REPO/commits/$SHA/check-runs" -H "Accept: application/vnd.github+json" --jq '.check_runs[] | [.name,.head_sha,.status,.conclusion] | @tsv'
gh api "repos/$REPO/commits/$SHA/status" --jq '{state, statuses: [.statuses[] | {context,state,sha}]}'
gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=100" --jq '.workflow_runs[] | [.id,.name,.status,.conclusion] | @tsv'
gh api "repos/$REPO/actions/runs/43693751924/jobs" --jq '.jobs[] | {id,name,status,conclusion,steps}'
gh pr list -R "$REPO" --state open --json number,title,headRefOid,baseRefOid,isDraft
```

## Evidence status
- Local application tests: **NOT RUN in this cycle**.
- GitHub Actions on final main SHA: **NOT VERIFIED in this cycle**.
- Human approval: **NOT VERIFIED**.
- External Opus/Sonnet/Haiku/Hydrogen worker job IDs: **NONE VERIFIED**.
- Merge/deploy/NASA submission: **NOT AUTHORIZED**.

This snapshot is for reviewer triage only; it must be refreshed against the actual final SHA.
