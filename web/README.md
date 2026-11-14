# BRASPACE MoonProof — 3D Lunar Mission Control

**Status:** ORIGINAL interactive web prototype; **NOT NASA-validated scientific visualization**. This UI uses an optional NASA SVS global visual texture (not a precision terrain model) with a clearly labelled procedural fallback. No NASA LOLA DEM or SPICE ephemerides are calculated by the browser.

## Features implemented in this branch

- Responsive five-area navigation: Explore, Compare, Recover, Science & Engineering, Evidence & Learn.
- Interactive 3D Moon powered by **Three.js**, with mouse/touch rotation, keyboard arrows, camera zoom and reset; candidate-region markers are visual context only.
- Loads the GitHub team's site catalog from \`GET /api/sites\` **when that backend route is actually available** (currently in PR #53). In its absence, no fake catalog is substituted.
- Training-only scenario input: UTC date, mission length, scheduled delay, assumed solar generation, battery capacity/load/reserve and maximum geometric Earth-visibility gap.
- \`POST /api/onboard/evaluate\` (merged PR #70) computes all battery, risk and blackout values on the **Go backend**. The frontend creates visibly synthetic Sun/Earth visibility input sequences solely for a software demonstration and **does not claim any lunar dataset is involved**.
- When the selected site has an ingested horizon/ephemeris series (\`series\` in \`GET /api/sites\`), the simulator calls \`POST /api/onboard/site-evaluate\` (PR #53): Sun/Earth visibility is computed by the Go API and Rust engine from stored data, crew oxygen/food are added, and the result shows the series' \`science_status\` and provenance. Sites without a series keep the synthetic training path above. Crew consumption rates are placeholders pending a NASA BVAD check.
- \`POST /api/onboard/report\` opens the print-friendly evidence report **only when PR #72 is subsequently deployed/merged**. It otherwise displays a clear endpoint unavailable message.
- No NASA insignia, no copied Google Maps lunar tiles or logos; NASA SVS credits are linked directly.

## Local development — same-origin and no CORS wildcard

1. Install Go 1.23+ and Rust/Cargo; from repository root, run:
   \`\`\`sh
   cargo build --manifest-path engine/Cargo.toml
   cd api
   RUST_ENGINE_BIN=../engine/target/debug/braspace-lunar-engine go run .
   \`\`\`
2. In a second terminal at repository root:
   \`\`\`sh
   node web/dev-server.mjs
   \`\`\`
3. Open \`http://127.0.0.1:5173\`.

The preview server binds **127.0.0.1 only** and forwards recognized \`/api/\` and health routes to the local Go backend on **127.0.0.1:8080**. It is **not** a production deployment. Do not expose this development reverse proxy directly to the Internet. Deploy a reviewed TLS reverse proxy/web static host and ensure both public project and demo links work without login before NASA submission.

## Quality verification

\`\`\`sh
npm --prefix web run lint
npm --prefix web test
\`\`\`

The Node tests cover static serving, content security policy, no path traversal, basic frontend structure and explicit synthetic science warnings. The main Go/Rust pipeline remains separately tested by the existing CI.

## Asset and accuracy notes

- Official source: [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), \`lroc_color_2k.jpg\` (the 2025 global color map, 2048×1024). Credit: **NASA Scientific Visualization Studio / Ernie Wright**.
- Direct source file: \`https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg\`. It may not be CORS-enabled from all browsers/origins; if blocked, MoonProof displays a procedural fallback labelled **illustrative**.
- NASA explicitly describes this global map as intended for aesthetics. Precise south-pole illumination and horizon planning require authentic NASA PDS LOLA terrain, lunar frame/transforms and verified JPL SPICE geometry.
- Catalog positions represent approximate **feature centers**, not actual spacecraft touchdown locations. Visual pin alignment against MoonKit UV and terrain orientation awaits Joel's scientific validation (#56).
- Educators and engineers must not treat simulated state-of-charge or geometric Earth visibility as a reliable electric-power or radio-link budget. There are no flight qualification claims.
- Current upstream PRs: #53 mission API and PostgreSQL integration, #71 NASA data provenance, #72 printable report. The web branch is intentionally disjoint from their backend source except for the future deployment integration step.

## Release gates

- [ ] Browser render and interaction validated visually across desktop/mobile.
- [ ] Actual NASA DEM+SPICE data integrated with proper provenance, units and independent validation.
- [ ] The real science API feeds Sun/Earth horizon and mission metrics; no synthetic physics shown as scientific.
- [ ] Public HTTPS application and anonymous-reader <=7-slide English NASA demo.
- [ ] AI assistance and any image generation disclosed and credited.
- [ ] Authorized teammate submits NASA form and saves official confirmation before deadline.
