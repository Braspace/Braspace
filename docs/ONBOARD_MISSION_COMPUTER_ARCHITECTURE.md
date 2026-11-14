# BRASPACE MoonProof — Virtual Onboard Mission Computer / Mission Resilience Lab

**Date:** 2026-11-14. **Working name:** BRASPACE MoonProof — Mission Resilience Onboard Computer. This is an engineering/product name; keep the official NASA form project name unchanged until the team approves an update. **Context:** NASA Space Apps Challenge 2026 Lunar Landing Site Navigator, lunar SOUTH POLE only.

## What the team asked for

The "computador de bordo" should be the central mission decision layer, not a sixth cluttered top-level menu. It belongs within the five-part **Explore, Compare, Recover, Science & Engineering, Evidence & Learn** hub, primarily in Recover / Science & Engineering. It combines data and risk into a minimal, interactive cockpit serving planners, educators and the public.

Do **not** imply this hackathon app is actual hardware flight avionics, has real-time spacecraft telemetry, can uplink commands, navigates a descent, solves Earth–Moon transfers, or is NASA-certified. Use labels **virtual onboard computer / educational mission control simulator**.

## Versioned architecture and functional decomposition

```text
NASA PDS LRO/LOLA DEM         JPL/NAIF SPICE kernels          Mission parameters
      |                               |                               |
 NASA DATA source ID, frame, checksum, time / coordinate quality       |
      |                               |                               |
      +--------- validated Rust scientific horizon + Sun/Earth --------+
                                     |
                    Typed Go series and scenarios / PR #53
                            [currently SYNTHETIC]
                                     |
                       ONBOARD COMPUTER simulator / PR #70
                       POST /api/onboard/evaluate
                   /             |            \
             POWER Wh        DTE blackout      RISKS
           battery/reserve   geometric only   thresholds + events
                   \             |            /
                    decision + alternate supplied scenarios
                                     |
                  cockpit UI • Recover • Mission Report HTML/PDF
                              provenance & limitations
```

**Implementation reality:** PR #45 is merged to main with Go/Rust/Docker green; #53 (Gabriel Freire) has site catalog, compare and delay API in review, no real NASA LOLA/SPICE science yet confirmed. PR #70 (Gustavo) implements an **independent** deterministic Go educational onboard resource and risk engine. It requires CI and review before merging. #54 (Gustavo) 3D globe and #58 (Gustavo) Mission Report/PDF remain separate not-implemented tickets.

## Virtual onboard subsystem map

| Subsystem | Input | Calculation / output | V1 status | Work item |
|---|---|---|---|---|
| Mission Clock | UTC, sample step, duration, date-delay candidates | Time-indexed simulation | Implemented in PR #70, CI pending | #63 |
| Power Management | Battery Wh, solar generation W as caller assumption, load W, Sun visible | Battery SoC proxy, minimum charge Wh, unserved Wh | Implemented in PR #70, synthetic only | #63 |
| Communications Supervisor | Earth geometrically visible per step and maximum allowed gap h | Longest Earth obstruction, threshold breach | Implemented in PR #70; no RF budget/DSN scheduling | #63 |
| Risk Monitor | Configured reserve Wh, blackout h and time-indexed samples | NOMINAL / SAFE_MODE / POWER_LOSS, categorical risk | Implemented in PR #70, unverified science inputs | #63/#68 |
| Scenario Evaluator | Baseline and alternative samples/configurations | Deterministic comparison and educational choice ONLY if all constraints met | Implemented in PR #70, not autonomous search | #63/#64 |
| Landing date/site search | NASA-backed DEM and date-time series, candidate sites | Nearby landing sites or arrival-delay windows | Already proposed in open PR #53; integration pending | #46/#64 |
| Scientific data origin | Real LOLA, NAIF SPICE, ephemerides, frame and epochs | Source-backed Sun/Earth above true terrain | Pending | #65/#66 |
| Cockpit UI + visual Moon | Sensor cards, alarm timeline, 3D Moon | Understandable mission state in five-area hub | Not yet implemented | #54/#67 |
| Mission Report | Scenario provenance, risk register, alternative analysis | HTML + print-to-PDF | Not yet implemented | #58/#68 |
| Real telemetry, spacecraft GNC/FDIR/command uplink | Actual avionics and flight control | **OUT OF SCOPE** (not flight-certified) | Not implemented | Research only |

## Explicit scientific and security limits

- The current Go/Rust engine classifies caller-provided look angles and horizon samples; it has **not** proven NASA physical accuracy.
- The PR #70 onboard computer consumes **caller-provided** Sun/Earth visible flags, and cannot verify them or compute orbital elements. Response explicitly always contains `science_status: UNVERIFIED_INPUTS` and `no_flight_recommendation: true`.
- Solar visibility is not equal to solar electrical power; the `solar_generation_w` is a caller-provided simplified assumption, not a solar incidence/thermal/battery-charge/efficiency model.
- Earth above the terrain horizon is a geometric observation, not RF link availability or Deep Space Network allocation.
- Do not turn absent input data into 0 hours of Sun or Earth visibility; reject missing booleans, unsupported times and invalid units.
- A better scenario according to assumed constraints **is not a safe flight recommendation**. Candidate search outside provided scenarios and reactive fault diagnosis is not in the v1 endpoint.
- Export only data actually computed and references actually used, not fabricated outcomes. No NASA logo/endorsement on AI-generated material.
- Keep repo private until team-approved changes; NASA project and 7-slide demo must be public and anonymously accessible.

## New role assignment — No need for everyone to code

- @gustavofullstack: **primary coding/tech integration** for onboard computer (#63), Super Moon globe (#54), report code (#58) and final NASA submit (#11).
- @gfreiresjrp: Go integration and typed adapter (#64); maintain own pending PR #53.
- @joeljato: Rust science, horizon and onboard model correctness (#65).
- @maccachera: NASA data/products/metadata provenance (#66); research only.
- @lisanogueira: minimal cockpit UX, accessibility and educational storytelling (#67); no code required.
- @Ninzinhu: independent simulator QA, risk taxonomy, NASA submission and link checks (#68); no code required.

## First end-to-end demonstration (still to validate)

1. Show original scientific sources for one South Pole landing site or prominently label the scenario a synthetic training example.
2. Enter duration and realistic but explicitly assumed lander battery/power parameters.
3. Display stepwise Sun/Earth visibility, battery Wh, geometric blackout and the current simulated mode.
4. Introduce a +48 h landing delay and evaluate a second supplied candidate with identical units, model and source.
5. Identify constraint failures and show alternative **laboratory** configuration only when thresholds pass; do not invent a site.
6. Export report with all inputs, risks, assumptions, model versions and provenance.
7. Demonstrate 3D map only if real assets and coordinate consistency are verified; otherwise 2D/fallback is acceptable.
8. The <=7-slide English NASA presentation must use screenshots of actually running features and disclose SI.

## Action tracking

[PR #70](https://github.com/Braspace/Braspace/pull/70) Onboard Computer v1 code | [PR #53](https://github.com/Braspace/Braspace/pull/53) existing date/site API | [#63](https://github.com/Braspace/Braspace/issues/63) Gustavo | [#64](https://github.com/Braspace/Braspace/issues/64) Gabriel Freire | [#65](https://github.com/Braspace/Braspace/issues/65) Joel | [#66](https://github.com/Braspace/Braspace/issues/66) Maccachero | [#67](https://github.com/Braspace/Braspace/issues/67) Heloísa | [#68](https://github.com/Braspace/Braspace/issues/68) João Victor.

**Status:** strategic documentation, with a code PR under review. Nothing is marked NASA-submitted.
