# BRASPACE | Lunar Landing Site Navigator — NASA Space Apps 2026

BRASPACE is a six-person Brazilian team in Uberlândia, Minas Gerais, working on the [official Lunar Landing Site Navigator challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

**CURRENT STATE (2026-11-14): Engineering bootstrap, not a validated lunar-planning product.** The Go API and Rust executable classify **caller-supplied** Sun/Earth look angles relative to **caller-supplied** terrain-horizon samples. No authoritative NASA elevation file, SPICE ephemerides, geographic site selection, time-series ranking, or flight-grade prediction is implemented by this bootstrap. Every response is marked `UNVERIFIED_INPUTS`. The included example is **synthetic**, not NASA-derived.

## Run the existing integration

Requires Docker with Compose plugin:

```sh
docker compose up --build -d
curl -fsS http://127.0.0.1:8080/readyz
curl -fsS -H 'Content-Type: application/json' \
  --data-binary @examples/visibility.synthetic.json \
  http://127.0.0.1:8080/v1/visibility
docker compose down
```

The response includes an `evidence_passport` with a SHA-256 of the exact normalized **caller request**, claimed source IDs, and explicit false flags for source verification and scientific validation. This is a reproducibility fingerprint **not a NASA dataset integrity certificate**. `GET /v1/capabilities` publishes exactly which scientific capabilities are not implemented.

Expected from the synthetic test: `science_status=UNVERIFIED_INPUTS`, `sun_visible=true`, `earth_visible=false`. These are checks of the software contract, **not scientific validation**. `GET /healthz` tests HTTP liveness; `GET /readyz` tests presence of an executable Rust engine, not NASA data readiness. No secrets or public service exposure are required; Compose binds to loopback by default.

Local checks (with Go 1.23+ and Rust/Cargo available):

```sh
(cd api && go test ./...)
cargo test --manifest-path engine/Cargo.toml
cargo build --manifest-path engine/Cargo.toml
(cd api && RUST_ENGINE_BIN=../engine/target/debug/braspace-lunar-engine go run .)
```

## The six-person MVP, frozen for judging

- Select **three traceable candidate coordinates** and one real NASA LOLA terrain source; record IDs, frames, physical units, checksums and license/credit.
- Produce **one reproducible terrain skyline** from real LOLA elevation at a named site, then evaluate Sun and Earth from approved SPICE kernels, with independent comparison and error budget.
- Compare three sites with transparent values, not fabricated single-score certainty; display unknown/unvalidated measures as unavailable.
- Present the mission result through an accessible UI and a **maximum seven-slide** reviewable demo; independently verify anonymous public access.
- Archive immutable source, tests, evidence, AI-assistance disclosure and the authorized NASA submission confirmation.

Detailed criteria: [MVP scope](docs/MVP_SCOPE.md), [Architecture and ADR](docs/architecture.md), [Competitor audit](docs/COMPETITOR_AUDIT.md), [Scientific acceptance](docs/SCIENTIFIC_ACCEPTANCE.md), [Team evidence sync](docs/TEAM_SYNC.md), [Submission checklist](docs/SUBMISSION_CHECKLIST.md).

## What would make BRASPACE genuinely different?

Our proposed **Mission Evidence Passport** joins a Pareto-style mission trade-off explorer, constraint-by-constraint explanations, reproducibility fingerprints (source checksum, frame, epoch, algorithm, commit SHA), stress-testing the decision under landing/height/terrain uncertainty, and a teaching view that clearly separates measurements from assumptions. Several competitors already provide parts of this; the differentiator must be the **end-to-end audit trail and human-readable scientific honesty**, not an unsubstantiated claim to be first or more accurate.

**IMPORTANT:** These advanced features are roadmap items, not currently shipped or validated. Do not represent these ideas, screenshots, example figures, or AI-assisted artifacts as outputs from NASA or flight-qualified software.

## Team / ownership

Lead/integration @gustavofullstack; data @maccachera; Rust science @joeljato; Go backend @gfreiresjrp; UX @lisanogueira; QA/release @Ninzinhu. Official tracking is GitHub Issues [#1–#43](https://github.com/Braspace/Braspace/issues), with eight lead issues [#7](https://github.com/Braspace/Braspace/issues/7), [#8](https://github.com/Braspace/Braspace/issues/8), [#9](https://github.com/Braspace/Braspace/issues/9), [#10](https://github.com/Braspace/Braspace/issues/10), [#11](https://github.com/Braspace/Braspace/issues/11), [#12](https://github.com/Braspace/Braspace/issues/12), [#37](https://github.com/Braspace/Braspace/issues/37), [#43](https://github.com/Braspace/Braspace/issues/43).

Independent open-source projects were consulted for **ideas and gap analysis only**. No competitor source code, datasets, or images were copied into this repository by this change. Respect upstream license notices if future code/data is reused.

## Responsibility and limits

Not affiliated with or endorsed by NASA. This educational prototype is **not suitable for flight operations**, autonomous landing, energy or communications certification. Human review is required for final submission and scientific claims. AI-assisted code/documentation is disclosed in the submission checklist.
