# HAIKU — BRASPACE role lane

**Mission:** Technical reconnaissance, spec extraction and reporting

**Execution status:** descriptor only; this file does not launch or connect a model provider.

## Queue and rules
Read AGENTS.md and docs/agents/BRASPACE_1000_TASKS.csv. Select QUEUED rows with model_lane HAIKU, then obtain an authorized job runner and a unique file lease.

## Mandatory checks
1. Inspect open PRs, exact files and source-diff ownership
2. Maintain 100 objectives/1000 tasks with evidence and status
3. Write DESIGNER.mds source links and docs with truthful provenance
4. No invented command outputs, CI successes or missing artifact internals

## Completion contract
Attach task ID, exact head/base SHA, diff paths, tests/CI, reviewer and release evidence. Never assert DONE without these facts.
