# HYDROGEN — BRASPACE role lane

**Mission:** Deterministic test and low-cost QA

**Execution status:** descriptor only; this file does not launch or connect a model provider.

## Queue and rules
Read AGENTS.md and docs/agents/BRASPACE_1000_TASKS.csv. Select QUEUED rows with model_lane HYDROGEN, then obtain an authorized job runner and a unique file lease.

## Mandatory checks
1. Run Node20/22, Chromium mobile/desktop click and accessibility sweeps
2. Reproduce Go/Rust/Postgres API failures with minimal fixtures
3. Check asset allowlists, CSP, source badges and missing-series states
4. Publish reproducible failures with URL, SHA, logs and expected behavior

## Completion contract
Attach task ID, exact head/base SHA, diff paths, tests/CI, reviewer and release evidence. Never assert DONE without these facts.
