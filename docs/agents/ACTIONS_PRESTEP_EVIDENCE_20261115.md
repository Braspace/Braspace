# P0: GitHub Actions pre-step failure — evidence and release gate

**Observed:** 2026-11-15 (America/Sao_Paulo). **Scope:** internal BRASPACE release diagnostics. This is not a scientific validation or a release approval.

## Reproducible evidence

- Historical workflow run: https://github.com/Braspace/Braspace/actions/runs/43693751924
- Job `132749671767`: `conclusion=failure`, `steps=null` in the jobs API response.
- Job `132749682481`: `conclusion=skipped`, `steps=null`.
- Main HEAD at inspection: `e7561eadacfd82bf6049cfa42cf52cde09deb291` (merge PR #302).
- Commit-scoped PR workflow-run query for this HEAD returned `[]`; combined commit statuses returned `[]`. **These queries are not exhaustive check-run or push-workflow inventories.**
- Root cause: **UNKNOWN**. A failed job with no steps is not evidence of application-test failure or runner outage.

## Operator reproduction (authenticated `gh` with repository access)

```sh
gh api 'repos/Braspace/Braspace/actions/runs/43693751924/jobs?per_page=100' > /tmp/braspace-actions-jobs.json
python3 scripts/check_actions_prestep.py /tmp/braspace-actions-jobs.json
echo "classifier_exit=$?"
gh run view 43693751924 --repo Braspace/Braspace --json status,conclusion,jobs
gh api 'repos/Braspace/Braspace/commits/e7561eadacfd82bf6049cfa42cf52cde09deb291/check-runs' --jq '.check_runs[] | [.name,.status,.conclusion,.head_sha] | @tsv'
```

The classifier returns `1` for a pre-step anomaly, `2` for invalid input, or `0` if no such anomaly is detected. **Exit 0 never certifies CI green.** The jobs API may be paginated; fetch every page before declaring the inventory complete.

## Release gate (fail closed)

1. Re-fetch the final PR head SHA, target branch SHA, branch protection/ruleset and required check names; confirm no intervening push.
2. Inspect **check runs and workflow runs**, including push and PR triggers, for that exact final SHA. A missing run, pending check, skipped required check, or pre-step anomaly is **BLOCKED**, not PASS.
3. Reproduce relevant Go, Rust, Python and frontend tests in the actual committed tree; record commands, exit codes, platform and logs. Never infer execution from committed test files.
4. Preserve scientific source status as `PRELIMINARY/UNVERIFIED`; require independent scientific review before stronger claims.
5. Require explicit human review and approval before merge or NASA submission. Do not publish private repository content or change teammate-owned frontend branches.

## Backlog linkage

`BR-T0001`–`BR-T0010` in `docs/agents/BRASPACE_1000_TASKS.csv` are `QUEUED`, not completed. This document supports release evidence collection only; it does not close any task. No Opus/Sonnet/Haiku/Hydrogen worker is `RUNNING` without an actual execution and job ID.
