# BRASPACE — AGENT EXECUTION CONTRACT (2026-11-14)

Scope: NASA Space Apps 2026 Lunar Landing Site Navigator, lunar South Pole. This is the shared onboarding context for Claude Code, Codex, Gemini/Antigravity, Hermes, GitHub agents and any other authorized worker. **Reading this file is not evidence a model agent is connected or executing.**

## Sources of truth
- Private GitHub repo: `Braspace/Braspace`; default branch `main`.
- **Product surface (2026-11-15, owner decision): MoonProof only** — `web/moonproof/` (Preact TSX screens, design @lisanogueira/Heloísa) plus the Three.js viewer `web/moon-hd.html` (Joel). Public demo: `https://braspace-moonproof.almeida-me.workers.dev/moonproof/`. `/` redirects to `/moonproof/`.
- Shared modules MoonProof imports stay in place: `web/lab/{coords,data,physics,scene,terrain,backend-bridge}`, `web/moon-hd/*`, `web/data/`, `web/vendor/preact/`.
- Archived (reversible, `git mv`, history kept): legacy shell `/`, Classic, `lab.html` page, Studio, Onboard, Dashboard, Polar Map Demo → `archive/web-legacy/` (see its README). Original authors: Heloísa PR #102 (lab), João Victor PR #115 (onboard), Studio PR #136.
- Science data: `science/`, `api/sitedata/`, manifest SHA pins. API: `api/openapi.json`. Go API + Rust geometry engine + PostgreSQL; optional `pgvector` metadata is **not** terrain science.
- Agent backlog: `docs/agents/BRASPACE_1000_TASKS.csv` (100 objectives × 10 tasks × 10 plans). Workflow: `docs/agents/README.md`.
- User-shared original Heloísa artifact: `https://claude.ai/artifact/QV5ykVW5q9HvyZsH68SPf1` has visual public content but not its private system prompt/project source. Do not claim otherwise.

## Model lanes (suggested, not automatically running)
- Opus: science/architecture/security review and critical design decisions.
- Sonnet: code implementation, API adaptation, CI repair and merge preparation.
- Haiku: inventory, documentation, source evidence and tests triage.
- Hydrogen: efficient deterministic tests, visual QA, route checks and small safe patches.
The coordinator must provide each actual external worker a branch SHA, task ID, file lease/ownership, dependencies, acceptance criteria, and target CI run. Record model job IDs if launched.

## Engineering guardrails
1. Never force-push, delete teammate branches, secretly merge an open draft, rewrite human-authored work, expose private datasets or commit secrets. Work on isolated branches with PR reviews.
2. Do not put all 1,000 tasks into the release gate. Address P0 in `docs/agents/BRASPACE_1000_TASKS.csv`; P1/P2 deferred unless critical.
3. Zero false validation: NASA-derived or calculated does **not** automatically mean independently validated. UI must display `SYNTHETIC`, `UNVERIFIED`, missing evidence and uncertainty distinctly. User-supplied/Claude screen mockup numbers are **illustrative**.
4. Visibility of Earth above terrain is geometric, not a guaranteed radio link; sunlight is not a validated power model. The Landing Lab is an educational 3DOF simulator, not flight software or certification.
5. Every API change updates `api/openapi.json`, positive and adversarial tests, and the matching UI client; no invented endpoints or simulated production claims.
6. Use typed Go and Rust contracts, modern JavaScript/Node ESM with explicit validation, deterministic tests, SOLID/DDD boundaries where beneficial and a small commit footprint.
7. MoonProof pages (`/moonproof/*.html`) and `/moon-hd.html` must keep working; `/` redirects to `/moonproof/`. Archived surfaces return 404. The preview is an explicit static allowlist and same-origin API proxy; never loosen to arbitrary filesystem serving.
8. Before merge: verify **final** HEAD SHA and base SHA, all required Node20/22, Go/Rust, Docker/Postgres, source-hash, and Chromium/mobile checks, reviewer feedback and scientific honesty. Never interpret a previous green commit as validation of newer code.
9. NASA deadline recorded as 2026-11-15 23:59 America/Sao_Paulo; public demo and deck must be accessible without login while the repository may stay private. Submission receipt is independent evidence and cannot be fabricated.

## Task lifecycle
QUEUED → RUNNING (only with real worker job ID) → PR OPEN → CI VERIFIED → HUMAN REVIEW → MERGED → RELEASE VERIFIED. An agent must add source SHA, PR URL, CI job URLs and any known limitations. If blockers remain, mark BLOCKED; never count it as DONE.

## Execution commands (when local checkout exists)
- `npm --prefix web run lint && npm --prefix web test`
- `cd api && go test ./...`
- `cd engine && cargo test --all-targets` (if toolchain/fixtures available)
- `node web/browser/e2e.mjs` under reviewed local Go/Rust backend with Chromium/Playwright installed
- Science data source tests only on exact SHA-pinned NASA binaries; do not relabel synthetic fixture tests as scientific validation.
