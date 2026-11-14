# BRASPACE MoonProof — +1000 tasks for the Heloísa V3 and Docker Release
This is a **second backlog**, additional to `docs/agents/BRASPACE_1000_TASKS.csv` in draft PR #136. Task IDs V3-T1001 through V3-T2000. Exactly 10 plans × 10 objectives × 10 stages; 100 P0 tasks. All entries start QUEUED because no Opus/Sonnet/Haiku/Hydrogen external worker launch was confirmed.

## V3-P01 — Visual fidelity
- V3-O001: Exact A screen composition
- V3-O002: Exact B explore flow
- V3-O003: Exact C compare flow
- V3-O004: Exact D replan flow
- V3-O005: Exact E cockpit presentation
- V3-O006: Exact F landing HUD
- V3-O007: Exact G debrief composition
- V3-O008: Exact H evidence register
- V3-O009: V3 answer-why-proof cards
- V3-O010: 390px mobile references

## V3-P02 — Lunar terrain
- V3-O011: 400m LOLA source checks
- V3-O012: Altitude pseudocolor legend
- V3-O013: IAU crater feature labels
- V3-O014: Site marker keyboard support
- V3-O015: Zoom and route dotted path
- V3-O016: Site geometry projection accuracy
- V3-O017: LOD for 20m assets
- V3-O018: Source license / image credits
- V3-O019: No-data tiles transparency
- V3-O020: Terrain rendering GPU/performance

## V3-P03 — Scientific data
- V3-O021: Hourly series SHA pin
- V3-O022: LOLA half-pixel registration
- V3-O023: NAIF SPICE Moon frames
- V3-O024: Horizons independent validation
- V3-O025: PGDA earth visibility definitions
- V3-O026: Sunlight disc versus centre
- V3-O027: UTC and light-time correction
- V3-O028: Grid transitions resolution
- V3-O029: Uncertainty and error budgets
- V3-O030: Synthetic series source gates

## V3-P04 — Comparison engine
- V3-O031: A/B/C UTC equal durations
- V3-O032: Site candidate picker
- V3-O033: Delayed third scenario
- V3-O034: Sunlit fraction bounds
- V3-O035: Earth visibility gap
- V3-O036: Longest darkness metric
- V3-O037: Concurrent API compare
- V3-O038: Conditions with user limits
- V3-O039: Evidence tables and export
- V3-O040: Candidate ranking no data

## V3-P05 — Mission replanning
- V3-O041: Delay +12 to +96
- V3-O042: Go API delay endpoint
- V3-O043: Alternative site eligibility
- V3-O044: Recover no-series fallback
- V3-O045: Window boundary validation
- V3-O046: Explain breached constraints
- V3-O047: Immutable replan history
- V3-O048: Mission duration changes
- V3-O049: Hardware/resource assumptions
- V3-O050: Replanning runtime budgets

## V3-P06 — Onboard
- V3-O051: API sky bridge
- V3-O052: Live source status badges
- V3-O053: Power state assumption
- V3-O054: Battery reserve and load
- V3-O055: Thermal model unknown gate
- V3-O056: Radio visibility versus RF
- V3-O057: Telemetry visualization
- V3-O058: Panel degradation simulation
- V3-O059: Crew supply scenario
- V3-O060: Onboard browser E2E

## V3-P07 — Landing education
- V3-O061: 3DOF physics ownership
- V3-O062: Guided landing phases
- V3-O063: Free landing UI
- V3-O064: Touch thrust controls
- V3-O065: Flight replay labels
- V3-O066: Fuel telemetry provenance
- V3-O067: Descent velocity constraints
- V3-O068: Schematic HUD layout
- V3-O069: Debrief improvement hints
- V3-O070: Attempt determinism

## V3-P08 — Research and education
- V3-O071: Task entry selection
- V3-O072: Manrope/IBM Plex type tokens
- V3-O073: Glass effect accessibility
- V3-O074: Classroom reveal privacy
- V3-O075: QR sharing source links
- V3-O076: Instructor projector scene
- V3-O077: Planner JSON export
- V3-O078: Planner CSV export
- V3-O079: No student identifiers
- V3-O080: Locale pt-BR and en-US

## V3-P09 — Backend/infra
- V3-O081: Go OpenAPI compatibility
- V3-O082: Rust native engine CI
- V3-O083: Postgres ingest and migrations
- V3-O084: pgvector metadata source gating
- V3-O085: Docker two-service topology
- V3-O086: Reverse proxy localhost and API
- V3-O087: Secrets and runtime roles
- V3-O088: API CORS allowed origins
- V3-O089: Observability trace and latency
- V3-O090: Docker image sbom scanning

## V3-P10 — Release and governance
- V3-O091: Node 20/22 full unit suite
- V3-O092: Go race tests
- V3-O093: Rust --locked tests
- V3-O094: Postgres real readback
- V3-O095: Chromium desktop screenshots
- V3-O096: Chromium 390 px mobile
- V3-O097: GitHub runner infra failures
- V3-O098: GHCR private release gate
- V3-O099: NASA public demo smoke
- V3-O100: PR approval and final HEAD

## Dispatching
- Opus reviews architecture, scientific uncertainty and risk.
- Sonnet writes typed code and integrates GitHub PRs only after reviewers.
- Haiku inventories sources, DESIGNER.mds and evidence.
- Hydrogen runs deterministic unit/mobile/negative tests.
- Model assignment is **a desired routing label, not an execution record**.
- Send only a bounded task batch to an actually connected runner; record its real job identifier in the task ledger before QUEUED → RUNNING.
- No simultaneous writers on `web/lab/`, `web/moonproof/`, `web/onboard/`, `api/` or `.github/workflows/` without exclusive file leases and base SHA confirmation.
- Merge only on required CI PASS for exact HEAD, reviewer agreement, artifact and science claims.
