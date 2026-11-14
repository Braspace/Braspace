# BS-012 — Architecture, ADR-0001 and interface boundaries

**Decision date:** 2026-11-14. **Status:** accepted for *bootstrap*, review required for scientific production.

## ADR-0001: Rust JSON-line subprocess behind Go API

**Context.** BRASPACE has Go backend ownership, Rust science ownership and a hard hackathon deadline. An FFI shared-library ABI would create additional cross-toolchain and memory-safety integration risks. Existing team branches are almost empty and backend contracts are not implemented yet.

**Decision.** Go accepts a strict JSON POST on `/v1/visibility`, bounds request size and deadline, and launches a compiled Rust executable with JSON on stdin and one JSON response on stdout. Non-zero exit codes map to HTTP 502; invalid requests map to 400/415/422. All science fields are typed, include explicit `MOON_ME` frame metadata, and declare `UNVERIFIED_INPUTS` until a trusted source pipeline is integrated.

**Consequences.** Straightforward process isolation and offline Docker builds after dependency download; per-request spawn overhead; container size; no streaming workloads yet. A production implementation could use a persistent worker pool only after a benchmark and protocol design. Never treat a submitted dataset identifier as proof of dataset ingestion. Integration does not implement lunar physics.

## Runtime topology

```text
Client -- POST /v1/visibility ---> Go HTTP API (:8080)
                                  | input schema, <128KiB, 2s deadline
                                  v
                              Rust CLI subprocess
                              | interpolates supplied horizon
                              | compares supplied Sun/Earth angles
                                  v
                 JSON {sun_margin_deg, earth_margin_deg,
                       visible, science_status:UNVERIFIED_INPUTS}
```

- **Go** owns HTTP, validation, timeout, safe failures, observability (no secrets), readiness and future Postgres access.
- **Rust** owns deterministic geometry and, *after a separate validation PR*, DEM ray tracing, frame transforms and Sun/Earth look angles. Current Rust only performs linear interpolation of a **provided** circular terrain skyline; no DEM/SPICE IO.
- **PostgreSQL/pgvector** is explicitly **not** needed to run the bootstrap. Add later only if real NASA data ingestion or contextual retrieval has a demonstrated use. Do not introduce irrelevant infrastructure into P0.
- **UI** must surface both provenance and `science_status`; never hide warning or turn it into a verdict.
- **CI** checks Rust unit tests, Go unit tests, real Go-to-Rust process, Compose smoke. CI does not constitute physical scientific validation.

## Contract (`POST /v1/visibility`)

Example: [synthetic request](../examples/visibility.synthetic.json). Angles are degrees (azimuth 0° north / clockwise convention is a caller contract to standardize during science review), elevations in [-90, 90]; horizon samples strictly increasing and periodic across 0/360°. `epoch_utc` is RFC3339 UTC. Frame currently must be `MOON_ME`. Two or more samples allow circular interpolation. A zero margin is treated as mathematically tangent/visible, **not** proof of robust visibility.

Response contains numerical local horizon and clearance margins and three booleans. The classification is only as accurate as the source angles and skyline. Sun disc width, refraction, limb effects, antenna link budget, Earth occultation, DSN scheduling, lunar eclipses, terrain uncertainty and time-series windows are **not modeled**.

## ADR-0002: Source provenance, not artificial confidence

**Proposed.** New real-data API must accept **immutable** data asset identifiers, checksums/frames/epochs *from a server-side NASA data manifest*, not trust caller-supplied strings. Every computed metric should link to an auditable `EvidencePassport` containing exact source and version, spatial/temporal resolution, coordinate transform, algorithm version, reference test residual and limitations. Support `NOT_COMPUTED` / `ESTIMATED` / `VALIDATED`, backed by evidence and not client-chosen status.

## Change safety

All changes are on `team/gustavofullstack/spaceapps-2026` and offered for review. Other owner branches, production secrets and NASA portal are untouched. Do not merge without reviewer approval. The Docker image tags should be digest-pinned and a `Cargo.lock` generated/committed before claiming strict reproducibility.
