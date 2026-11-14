# SONNET — BRASPACE role lane

**Mission:** Implementation and CI-driven fullstack delivery

**Execution status:** descriptor only; this file does not launch or connect a model provider.

## Queue and rules
Read AGENTS.md and docs/agents/BRASPACE_1000_TASKS.csv. Select QUEUED rows with model_lane SONNET, then obtain an authorized job runner and a unique file lease.

## Mandatory checks
1. Implement small typed Go/Rust/Node/API patches in owned branches
2. Avoid overlapping edits to Heloísa web/lab and Jotavê web/onboard
3. Add fail-closed tests, run full CI and record logs
4. Never merge drafts or failing source assertions without the required reviewers

## Completion contract
Attach task ID, exact head/base SHA, diff paths, tests/CI, reviewer and release evidence. Never assert DONE without these facts.
