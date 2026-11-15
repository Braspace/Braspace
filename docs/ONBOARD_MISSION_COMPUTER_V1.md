# BRASPACE — MoonProof Onboard Mission Computer v1

**Project:** Lunar Landing Site Navigator / MoonProof Mission Resilience Explorer
**Coding owner:** @gustavofullstack; science review @joeljato; API integration @gfreiresjrp; NASA source research @maccachera; UX @lisanogueira; risk/release QA @Ninzinhu.
**Implementation:** `api/onboard/onboard.go` (Go), `api/onboard/onboard_test.go`, route in `api/main.go`.
**Status:** educational GROUND SIMULATOR — NOT spacecraft flight software; NOT NASA approved; NOT a validated NASA-LOLA/SPICE simulator.

## What actually exists in this PR

- Strongly typed `POST /api/onboard/evaluate` endpoint with strict JSON parsing, maximum body size 128 KiB, 1–8 candidate scenarios, 1–720 samples per scenario and up to 30 days of each supplied observation series.
- Caller-supplied discrete visibility samples `sun_visible` and `earth_visible` at a chosen time step. **No lunar ephemeris is created** by this endpoint; missing visibility fields cause errors rather than being treated as dark or invisible.
- Lander scenario assumptions (battery Wh, initial Wh, safety reserve Wh, solar generation W **when visible**, load W, tolerated geometric Earth obstruction h).
- Deterministic Wh simulation with battery capacity clipping, lost-load energy in Wh, minimum charge, longest darkness and longest geometric Earth obstruction, UTC time series snapshots and state labels `NOMINAL`, `SAFE_MODE`, `POWER_LOSS`.
- Explicit threshold-based risks: `ENERGY_LOSS`, `ENERGY_RESERVE`, `EARTH_GEOMETRIC_BLACKOUT`. Unknown inputs rejected; no global "mission safety" score.
- Compares only caller-supplied baseline and alternative candidates. If one satisfies all user-specified constraints, returns `laboratory_candidate_id` as an **educational scenario**. If none qualifies, returns null. **Never returns flight-eligible recommendations**.
- Response always includes `science_status: UNVERIFIED_INPUTS`, `no_flight_recommendation: true`, source claims marked unverified, an SHA-256 digest of the JSON input, and model limitations.
- Go unit tests cover invalid JSON, missing booleans, depletion, risk threshold breaches, successful alternative, charge clipping and deterministic input hash.

## Input contract

```json
{
  "mission_id": "synthetic-lunar-lander-demo",
  "candidates": [{
    "id": "baseline",
    "site_id": "synthetic-demo-a",
    "start_utc": "2026-12-01T00:00:00Z",
    "source_claim": "SYNTHETIC-TEST-DATA",
    "step_minutes": 60,
    "max_comm_blackout_hours": 1,
    "power": {
      "battery_capacity_wh": 200,
      "initial_charge_wh": 150,
      "reserve_wh": 50,
      "solar_generation_w": 0,
      "load_w": 80
    },
    "samples": [
      {"sun_visible": false, "earth_visible": false},
      {"sun_visible": false, "earth_visible": false}
    ]
  }]
}
```

Example command (after building Rust + Go API or via Docker):

```bash
curl --fail-with-body http://127.0.0.1:8080/api/onboard/evaluate \
  -H 'Content-Type: application/json' \
  --data-binary @examples/onboard/mission.synthetic.request.json
```

## Correct physical model boundary

For a sampled period `Δt` (hours):

`E_next = clamp(E_current + (P_solar_when_visible - P_load) * Δt, 0, battery_capacity_wh)`.

If the unclamped energy becomes negative, the deficit is recorded as `unserved_energy_wh` and the sample is flagged `POWER_LOSS`. Solar `P_solar_when_visible` is a **caller-provided assumed number**, not a NASA illumination-to-electricity converter. It ignores panel normal, incidence, dust, thermal effects, partial illumination, eclipses, conversion losses and lander mass. Light and power MUST NOT be conflated.

An `earth_visible` flag means a **caller-provided geometric Earth above terrain** observation and is NOT a scheduled DSN window, a budget for RF link, or a guarantee of successful contact. Non-physical effects, spacecraft attitude, communications antennas and orbital transfer/Δv are not computed.

`source_claim` is free text carried back with the suffix `_unverified`; it does NOT make scientific status VERIFIED.

## Planned real-data integration and next requirements

1. @maccachera (#66) supplies exact LRO/LOLA PDS and JPL/NAIF sources, frame, units, file checksums and coverage for a true site.
2. @joeljato (#65) validates geometry, horizon and Sun/Earth locations and scientific assumptions, proving matching times/reference frames.
3. @gfreiresjrp (#64) links the real source series (and PR #53 /api/compare + /api/scenarios/delay) via a typed adapter. **Do not merge PR #53 blindly; keep teammate scope.**
4. @gustavofullstack (#63) integrates the cockpit card into the five-area hub, Super Moon 3D (#54) and mission report (#58). This API already integrates via `api/main.go`.
5. @lisanogueira (#67) designs cockpit UI and a two-scenario educational flow, not flight controls.
6. @Ninzinhu (#68) independently checks the simulator, risk tiers, output credits, SI disclosure, public NASA project link and 7-slide English demo.

**P0:** one tested educational battery/contact scenario behind the Go API, with conspicuous limitations.
**P1:** real NASA terrain/ephemerides, physically better solar power model, fault events and source-backed alternative search.
**Out of scope:** real-time spacecraft command uplink, guidance/navigation/control, flight-grade FDIR, hardware firmware and certified trajectory replanning.

## Accept / reject gates

- [ ] CI clean on newest PR commit including Go tests and Docker build.
- [ ] All binary source fields are explicit, with scientific status never implicitly promoted.
- [ ] No nonexistent site/date/time source is presented as NASA truth.
- [ ] Mission report and demo use verified implemented data; not generated example physics.
- [ ] No merge of the feature PR until passing CI and owner review.
