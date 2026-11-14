# BRASPACE Agent Harness — 10 Plans, 100 Objectives, 1000 Atomic Tasks
**Date:** 2026-11-14. **Canonical repo:** private Braspace/Braspace.
**Status:** QUEUED / PLANNING. This is a dispatch-ready executable backlog, **not evidence that Opus, Sonnet, Haiku or Hydrogen workers were actually started**.

## Critical safety, release and authorship gates
- NASA Space Apps delivery deadline tracked as 2026-11-15 23:59 America/Sao_Paulo; P0 means critical, but *not* permission to bypass scientific evidence/CI/human approval.
- The 1000 tasks are stored as individually identified records in `docs/agents/BRASPACE_1000_TASKS.csv`. Do not create 1000 GitHub issues or claim 1000 simultaneous jobs; dispatch only bounded, code-owned batches and record worker job IDs when actually connected.
- Retain the privately owned team work. No force push, deletion, unrelated ref changes, or PR merge without final SHA checks and reviewer sign-off.
- Data sources are source-gated; no fake NASA validation, numeric metrics without AVAILABLE, simulation presented as simulation.
- Model names denote *recommended lanes*, not a confirmed integration with any model provider.

## 10 Plans
- PLAN-01: Scientific integrity and lunar data · objectives 001–010
- PLAN-02: Go Mission API and typed contracts · objectives 011–020
- PLAN-03: Rust geometry engine · objectives 021–030
- PLAN-04: PostgreSQL, pgvector and metadata · objectives 031–040
- PLAN-05: Heloisa design and frontend · objectives 041–050
- PLAN-06: Onboard computer and scenario physics · objectives 051–060
- PLAN-07: Education, access and learning · objectives 061–070
- PLAN-08: Security, authorization and privacy · objectives 071–080
- PLAN-09: CI/CD, quality assurance and browser · objectives 081–090
- PLAN-10: NASA submission, release and agent orchestration · objectives 091–100

## 100 objectives (each has 10 lifecycle tasks)
- OBJ-001 [PLAN-01] LOLA south-pole DEM hash and PDS3 label; target science/
- OBJ-002 [PLAN-01] Half-pixel polar grid registration; target science/
- OBJ-003 [PLAN-01] Observer height and local horizon; target science/
- OBJ-004 [PLAN-01] Curvature-aware terrain ray casting; target science/
- OBJ-005 [PLAN-01] Shackleton feature center fidelity; target science/
- OBJ-006 [PLAN-01] Connecting Ridge elevation consistency; target science/
- OBJ-007 [PLAN-01] NAIF SPICE MOON_ME reference frame; target science/
- OBJ-008 [PLAN-01] Sun/Earth aberration LT+S; target science/
- OBJ-009 [PLAN-01] JPL Horizons independent angles; target science/
- OBJ-010 [PLAN-01] PGDA illumination and Earth visibility differences; target science/
- OBJ-011 [PLAN-02] Site catalog and coverage metadata; target api/
- OBJ-012 [PLAN-02] Read-only sky samples and epochs; target api/
- OBJ-013 [PLAN-02] Native-grid next visibility transitions; target api/
- OBJ-014 [PLAN-02] Sun/Earth compare shared UTC window; target api/
- OBJ-015 [PLAN-02] Delay replan alternatives +24/+48/+72; target api/
- OBJ-016 [PLAN-02] Nearest site admissibility criteria; target api/
- OBJ-017 [PLAN-02] Source-status and data-availability errors; target api/
- OBJ-018 [PLAN-02] Go service timeout and cancellation; target api/
- OBJ-019 [PLAN-02] OpenAPI schema and request validation; target api/
- OBJ-020 [PLAN-02] Same-origin API to browser bridge; target api/
- OBJ-021 [PLAN-03] Input framing and unit conversion; target engine/
- OBJ-022 [PLAN-03] Lunar terrain-horizon search; target engine/
- OBJ-023 [PLAN-03] Solar-disc versus center visibility; target engine/
- OBJ-024 [PLAN-03] Earth-disc visibility geometry; target engine/
- OBJ-025 [PLAN-03] Numerical tolerance and boundary tests; target engine/
- OBJ-026 [PLAN-03] Rust JSON request validation; target engine/
- OBJ-027 [PLAN-03] Go-to-Rust CLI integration contracts; target engine/
- OBJ-028 [PLAN-03] Engine timeout and crash recovery; target engine/
- OBJ-029 [PLAN-03] Deterministic evaluation fixture replay; target engine/
- OBJ-030 [PLAN-03] Reproducible Rust build and lockfiles; target engine/
- OBJ-031 [PLAN-04] Postgres migrations idempotence; target api/db/
- OBJ-032 [PLAN-04] Series ingest checksums and duplicates; target api/db/
- OBJ-033 [PLAN-04] Catalog-to-series foreign key integrity; target api/db/
- OBJ-034 [PLAN-04] Time-series index and UTC range queries; target api/db/
- OBJ-035 [PLAN-04] Transaction isolation in replay; target api/db/
- OBJ-036 [PLAN-04] Postgres local Docker reproducibility; target api/db/
- OBJ-037 [PLAN-04] pgvector 384-dimension model pinning; target api/db/
- OBJ-038 [PLAN-04] Source-only vector metadata ingestion; target api/db/
- OBJ-039 [PLAN-04] Vector status source disclosure; target api/db/
- OBJ-040 [PLAN-04] Tenant/privacy boundary for optional metadata; target api/db/
- OBJ-041 [PLAN-05] A Mission Control responsive shell; target web/studio/ web/lab/
- OBJ-042 [PLAN-05] B Explore geology and sky map; target web/studio/ web/lab/
- OBJ-043 [PLAN-05] C Compare equal-window scenarios; target web/studio/ web/lab/
- OBJ-044 [PLAN-05] D Recover delay and violated criteria; target web/studio/ web/lab/
- OBJ-045 [PLAN-05] E Cockpit link and simulation boundaries; target web/studio/ web/lab/
- OBJ-046 [PLAN-05] F Landing Lab controls and physics UI; target web/studio/ web/lab/
- OBJ-047 [PLAN-05] G Landing Debrief audit trail; target web/studio/ web/lab/
- OBJ-048 [PLAN-05] H Evidence and source register; target web/studio/ web/lab/
- OBJ-049 [PLAN-05] V3 Answer Why Proof disclosure; target web/studio/ web/lab/
- OBJ-050 [PLAN-05] V3 user-selected kits and mobile layouts; target web/studio/ web/lab/
- OBJ-051 [PLAN-06] Onboard API-live module error fallback; target web/onboard/
- OBJ-052 [PLAN-06] Browser-model SYNTHETIC seals; target web/onboard/
- OBJ-053 [PLAN-06] Explicit battery capacity and reserve; target web/onboard/
- OBJ-054 [PLAN-06] Power consumption and solar exposure assumptions; target web/onboard/
- OBJ-055 [PLAN-06] Crew oxygen and food resource sourcing; target web/onboard/
- OBJ-056 [PLAN-06] Communication geometry versus RF link; target web/onboard/
- OBJ-057 [PLAN-06] Thermal unknown and missing source labels; target web/onboard/
- OBJ-058 [PLAN-06] Hardware degradation scenario controls; target web/onboard/
- OBJ-059 [PLAN-06] Onboard delayed-run reproducibility; target web/onboard/
- OBJ-060 [PLAN-06] Cockpit mobile accessibility and keyboard QA; target web/onboard/
- OBJ-061 [PLAN-07] Student onboarding three-step tour; target web/studio/
- OBJ-062 [PLAN-07] Teacher four-question exercises; target web/studio/
- OBJ-063 [PLAN-07] Teacher answer reveal privacy; target web/studio/
- OBJ-064 [PLAN-07] Projector-only classroom surface; target web/studio/
- OBJ-065 [PLAN-07] User-chosen public researcher educator entry; target web/studio/
- OBJ-066 [PLAN-07] Evidence glossary and source learning; target web/studio/
- OBJ-067 [PLAN-07] Educator QR/link no-login contract; target web/studio/
- OBJ-068 [PLAN-07] Reproducible learning exercises; target web/studio/
- OBJ-069 [PLAN-07] Classroom screen reader support; target web/studio/
- OBJ-070 [PLAN-07] Edu export of assumed versus measured values; target web/studio/
- OBJ-071 [PLAN-08] Raw path traversal and URL normalization; target web/dev-server.mjs .github/
- OBJ-072 [PLAN-08] CSP strict static asset allowlist; target web/dev-server.mjs .github/
- OBJ-073 [PLAN-08] Secret scanning and repository privacy; target web/dev-server.mjs .github/
- OBJ-074 [PLAN-08] Public app without exposing private code; target web/dev-server.mjs .github/
- OBJ-075 [PLAN-08] API cross-origin allowlist hardening; target web/dev-server.mjs .github/
- OBJ-076 [PLAN-08] Untrusted source and markdown display safety; target web/dev-server.mjs .github/
- OBJ-077 [PLAN-08] Rate limits and request payload bounds; target web/dev-server.mjs .github/
- OBJ-078 [PLAN-08] Supply-chain pinning and dependency scanning; target web/dev-server.mjs .github/
- OBJ-079 [PLAN-08] Provenance attestation misuse regression; target web/dev-server.mjs .github/
- OBJ-080 [PLAN-08] Security incident rollback and audit; target web/dev-server.mjs .github/
- OBJ-081 [PLAN-09] Web Node 20 and 22 unit matrix; target web/browser/ .github/workflows/
- OBJ-082 [PLAN-09] Chromium desktop and mobile click pathways; target web/browser/ .github/workflows/
- OBJ-083 [PLAN-09] Go race and contract regression; target web/browser/ .github/workflows/
- OBJ-084 [PLAN-09] Rust engine real fixture replay; target web/browser/ .github/workflows/
- OBJ-085 [PLAN-09] Docker/Postgres same-origin integration; target web/browser/ .github/workflows/
- OBJ-086 [PLAN-09] Scientific data checksum CI gate; target web/browser/ .github/workflows/
- OBJ-087 [PLAN-09] Cross-branch stale patch collision audit; target web/browser/ .github/workflows/
- OBJ-088 [PLAN-09] Pages anonymous smoke and asset routing; target web/browser/ .github/workflows/
- OBJ-089 [PLAN-09] Mobile contrast and reduced-motion validation; target web/browser/ .github/workflows/
- OBJ-090 [PLAN-09] Final HEAD SHA and approvals merge gate; target web/browser/ .github/workflows/
- OBJ-091 [PLAN-10] User-facing product and seven-slide pitch; target docs/
- OBJ-092 [PLAN-10] Human team six-person handoff; target docs/
- OBJ-093 [PLAN-10] NASA public demo no-login URL; target docs/
- OBJ-094 [PLAN-10] Science limits and citations in slides; target docs/
- OBJ-095 [PLAN-10] Space Apps submission portal receipt; target docs/
- OBJ-096 [PLAN-10] Release evidence screenshot archive; target docs/
- OBJ-097 [PLAN-10] Cloud deploy and rollback playbook; target docs/
- OBJ-098 [PLAN-10] PR stack sequencing and ownership; target docs/
- OBJ-099 [PLAN-10] Agent model routing and issue bundles; target docs/
- OBJ-100 [PLAN-10] Post-submission scientific debt registry; target docs/

## Model routing / agents
- **Opus:** architectural and scientific reviews; calls only after provider has been separately connected, never assert availability from model label.
- **Sonnet:** code implementation, CLI/GitHub PR reconciliation and integration; check branch ownership, fixture and CI.
- **Haiku:** inventory, docs, open-issue triage, source and checksum linking; treat reading as evidence, not mutation.
- **Hydrogen:** cheaper unit-test, browser screenshot and acceptance sweeps; never substitute assertions for backend science.
- **Coordinator:** user or authorized orchestrator assigns at most one writer per branch/file, provides a full SHA and stable acceptance criteria; write back PR, run ID, actual status and result.

## Dispatch protocol
1. Read current main HEAD and all open PR heads. Select one P0 issue with no owner conflicts and record a lease per affected file path.
2. Set `status=RUNNING` only after a concrete external worker task/job identifier exists. Preserve source SHA and tool provenance.
3. Agent works on feature branch; runs unit, integration and browser validations. Opens draft PR with actual tests, negative cases and source labels.
4. Reviewer confirms science-honesty, design match and team ownership; maintainers merge only green, approved final HEADs.
5. QA confirms deployed build, no-login demo (if public), data/unknown indicators; mark DONE with commit + CI URLs and source snapshot.

## P0 scope
The first objective in each plan (10 objectives × 10 tasks = 100 P0 tasks) prioritizes science hash, API catalog, Rust inputs, Postgres migrations, Heloísa Mission Control, Onboard live, teacher onboarding, traversal, Node matrix and submission copy. Other 900 tasks are sequenced as P1/P2; do not block 2026-11-15 delivery on all 1000.

## GitHub evidence to link
#136 Mission Studio/22 design specs; #102 Heloísa data/PR reconciliation; #115 Onboard live integration; #116 + #135 source-status bridge chain; #92 polar elevation map; #75 + #86 + #82 + #98 science stack; #137 public Pages asset routing.
