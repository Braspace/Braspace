# Science review: onboard simulator and Sun/Earth geometry (BS-061, issue #65)

Reviewer: @joeljato (Scientific Computing Lead). Date: 2026-11-14. Reviewed at `main` = `86b4e56`.
Also records the decision on issue #200 (engine units).

**Verdict.** The onboard simulator's arithmetic is dimensionally correct and its limits are stated in its own response.
The Sun/Earth directions match JPL Horizons. The terrain horizon is **not** independently confirmed at every site: at
Peak Near Shackleton two independent checks point the same way (too much sunlight). Nothing here is validated for flight,
and none of it should be labelled `VALIDATED`.

## 1. What is NASA source data and what is a scenario assumption

| Quantity | Origin | Status |
|---|---|---|
| Terrain heights | NASA LRO/LOLA `LDEM_80S_80M.IMG` V2.0, SHA-256 `e6591eee…8ff65fdc` | NASA data, authenticated by hash |
| Sun and Earth directions | NAIF SPICE `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`; frame `MOON_ME_DE440_ME421`; apparent `LT+S` from the site (`spkcpo`) | NASA/JPL data, authenticated by hash |
| Terrain horizon (360 azimuths per site) | **Our** computation on LOLA: rays to 100 km, 160 m steps, observer 2 m above ground | Derived, preliminary |
| Sun/Earth "visible" flags and percentages | **Our** comparison of body centre with that horizon, hourly, 2025-01-01 + 35,064 h | Derived, preliminary |
| Site coordinates | Catalog entries (IM-2 target, Lunar Surface Data Book feature centres) | Approximate; not landing ellipses |
| Battery capacity, initial charge, reserve, solar generation (W), load (W), blackout limit (h) | Typed by the caller of `POST /api/onboard/evaluate` | **Scenario assumption.** No NASA source |
| Visibility samples sent to the onboard API | Supplied by the caller; the API does not check where they came from | **Unverified input** (`science_status: UNVERIFIED_INPUTS`) |
| Cockpit browser model (`web/onboard/model.js`): Sun/Earth sinusoids, horizon formula, fuel, limits | Invented for the UI | **Synthetic.** Must stay labelled `SINTÉTICO` |

A number may be called "computed from NASA LOLA and NAIF SPICE data". It may not be called "NASA data", "NASA-validated"
or "validated".

## 2. Reference cases

### 2.1 Sun and Earth direction: JPL Horizons

`science/results/validation_horizons.json`: 5 sites × 12 epochs (2025-01-01 to 2028-12-31) × 2 bodies = 120 topocentric
azimuth/elevation pairs against the JPL Horizons API (quantity 4, airless).

- Recorded maximum difference: 0.0° in elevation and in azimuth × cos(elevation), at the file's precision
  (`science/results/README.md` states below 0.000005°).
- **Tolerance set by this review: 0.001°.** The site series is stored at 0.01°, so an error ten times smaller cannot change
  a stored sample. `api/cmd/validatehorizons/reference_tolerances_test.go` (`go test ./cmd/validatehorizons` in `api/`) now fails if a recorded residual exceeds it (#153: the
  script itself had no tolerance).
- Limit of this evidence: the test reads the committed file. I did not re-query Horizons today.

### 2.2 Skyline: NASA GSFC PGDA average illumination

`science/results/validation_pgda.json`: our mean visible solar-disc fraction against PGDA `AVGVISIB_75S_120M_201608`
(Mazarico et al. 2011), bilinear at each site.

| Site | Ours (%) | PGDA (%) | Difference (pp) |
|---|---|---|---|
| Mons Mouton (IM-2) | 45.57 | 46.43 | −0.86 |
| Nobile Rim 1 | 31.22 | 30.85 | +0.37 |
| Connecting Ridge | 51.92 | 50.65 | +1.27 |
| Malapert Massif | 38.52 | 34.97 | +3.55 |
| **Peak Near Shackleton** | **80.89** | **71.89** | **+9.00** |

- **Tolerance set by this review: ±5 pp.** PGDA averages a much longer period and has its own horizon, so a tighter band
  would not be meaningful. Four sites are inside it. **Peak Near Shackleton is outside it**; the test pins exactly that set
  so the picture cannot change unnoticed.
- The Earth column is not a like-for-like comparison (PGDA counts any part of the disc, we count the centre) and gets no
  tolerance.

### 2.3 Skyline: second implementation on the same data

The Moon HD viewer (PR #216) marches a ray over the LOLA grid toward the sub-solar direction instead of using the
precomputed horizon. Same LOLA file, same kernels, different code. Outside ±0.3° of the horizon, 804 to 811 samples per site:

| Site | Ray limited to 100 km (as the series) | Ray to 260 km |
|---|---|---|
| Connecting Ridge | 96.7 % agree | 96.8 % agree |
| Peak Near Shackleton | 98.9 % agree | 95.1 % agree |

Every disagreement is "series lit, viewer in shadow". This is agreement between two implementations, not validation.

### 2.4 Finding: Peak Near Shackleton probably has too much sunlight in our series

> **Update, 2026-11-15:** tested in `docs/HORIZON_REACH_STUDY.md`. Tracing the horizon to 200 km instead of 100 km lowers
> the Sun figure here from 80.4 % to 75.5 %, and also lowers Malapert Massif from 38.4 % to 33.8 % (its longest darkness
> goes from 670 h to 3,389 h). The text below is the suspicion as written before that test.

Two independent indications agree in sign:

1. PGDA gives 9.0 pp less sunlight there than our series (2.2).
2. Extending the ray from 100 km to 260 km moves 30 of 804 samples (3.7 %) from lit to shadow at that site and none at
   Connecting Ridge (2.3).

The simplest explanation is that terrain farther than 100 km blocks the Sun at that site and our horizon stops at 100 km.
This is not proven: (2) runs on 320 m block means, and (1) covers a different period. **Recommendation:** show the 80.4 % /
80.9 % Sun figures for Peak Near Shackleton as an upper bound, or flag them, until the horizon is recomputed with a longer
reach and compared again. Related: #154 (the same effect at 30 km).

## 3. Units review of the onboard simulator (`api/onboard/onboard.go`)

| Item | Finding |
|---|---|
| Step | `step_minutes / 60` → hours. Correct |
| Charge update | `charge[Wh] += (generation[W] − load[W]) × step[h]`. Correct: W × h = Wh |
| Capacity and floor | Clamped to `[0, battery_capacity_wh]`; the part below zero is reported as `unserved_energy_wh`. Correct |
| `ENERGY_LOSS` risk | Unit `Wh`, total unserved energy. Correct |
| `ENERGY_RESERVE` risk | Minimum charge against `reserve_wh`, unit `Wh`. Correct. Note: the minimum starts at the initial charge, so an initial charge at or below the reserve is flagged before anything happens |
| Darkness and Earth obstruction | Longest run of consecutive samples × step, in hours; `EARTH_GEOMETRIC_BLACKOUT` compares hours with hours. Correct |
| Rounding | 3 decimals (mWh, ms-level hours). No effect on the comparisons, which use unrounded values |

New tests in `api/onboard/units_review_test.go` pin this: W × h = Wh; the same 8-hour scenario sampled at 30, 60 and
120 minutes gives identical energies and durations; a 1.5 h obstruction at a 30-minute step is reported as 1.5 h against a
limit in hours.

Model limits found while reviewing (none is an arithmetic error):

- **All-or-nothing generation.** A sunlit sample yields the whole `solar_generation_w`. Near the pole the Sun sits within a
  few degrees of the horizon and is often partly hidden: in our own series 13 % of the hours at Connecting Ridge and at Peak
  Near Shackleton have the Sun's centre within one disc radius (0.27°) of the terrain. The model cannot represent that. Pinned
  by `TestSunVisibleIsAllOrNothingGeneration`.
- **No charge/discharge efficiency, no depth-of-discharge limit, no temperature dependence, no battery ageing.**
- **Blackout resolution is one step.** A reported run of N samples means an outage between (N − 1) and (N + 1) steps.
- **The timeline stamps each state at the end of its interval;** the visibility sample is held over the whole interval.

## 4. Sampling uncertainty of the site series

Hourly samples; a transition between lit and dark is located to within one step. Counted on the committed series
(35,064 h per site):

| Site | Sun transitions | Worst-case effect on Sun % | Earth transitions | Worst-case effect on Earth % |
|---|---|---|---|---|
| Mons Mouton (IM-2) | 111 | ±0.32 pp | 107 | ±0.31 pp |
| Malapert Massif | 204 | ±0.58 pp | 108 | ±0.31 pp |
| Nobile Rim 1 | 140 | ±0.40 pp | 108 | ±0.31 pp |
| Connecting Ridge | 165 | ±0.47 pp | 108 | ±0.31 pp |
| Peak Near Shackleton | 156 | ±0.44 pp | 107 | ±0.31 pp |

The bound assumes every transition is wrong by a full hour in the same direction; the expected error is far smaller.
Longest-darkness and longest-blackout figures (148 h to 670 h) carry ±2 h. **Sampling is not the dominant uncertainty; the
horizon is** (section 2).

## 5. Models that are absent

Stated so that no screen, slide or report implies otherwise:

- **Thermal:** no temperatures, no heater power, no survival-the-night model. Darkness hours are not a thermal verdict.
- **Solar power:** no panel area, orientation, incidence angle, partial disc, dust, degradation or shadowing by the lander
  itself. "Sun visible" is geometry, not watts.
- **Landing dynamics:** no descent trajectory, propellant, slope or hazard assessment, plume or dispersion ellipse. The
  Landing Lab is an educational 3DOF simulator.
- **Radio link:** no link budget, antenna pattern or pointing, data rate, DSN or relay scheduling, multipath or diffraction
  at grazing angles. "Earth visible" means the Earth's centre is above the terrain. Earth stays low at these sites
  (Earth elevation in the series ranges from −7.9° to +11.4° over the five sites), which is a hard case for a real link.
- **Sun and Earth as points:** the flags use body centres. The Sun's disc is 0.53° wide and Earth's about 1.9°.
- **Eclipses** of the Sun by the Earth are not modelled.

## 6. Cockpit browser model (`web/onboard/model.js`)

It is synthetic and says so. Two properties make it unlike the real geometry, so it must not be described as an
approximation of it:

- **Earth azimuth.** The model sweeps Earth through 180° of azimuth per 27.32 days. In the SPICE series Earth stays inside a
  band about 16° wide at each near-pole site (for example 129.6° to 145.5° at Connecting Ridge) because the Moon is tidally
  locked; only libration moves it.
- **Sun elevation.** The model uses one sinusoid of amplitude 3° with the synodic period. In the series the Sun's elevation
  at the two sites nearest the pole stays within ±2.1° and ±2.8°, and its envelope follows the seasons, not only the month.

Life-support constants (O₂ 0.84 kg and food 0.62 kg per person per day) are in the range I remember from NASA life-support
baseline documents; I did not re-check them against a source today, so they stay "illustrative" as labelled. Fuel
(450 kg − 1.2 kg/h) has no source.

## 7. Decision on issue #200 (engine accepts radians under `_deg`)

**The engine will not reject values because they "look like radians".** At the lunar poles small angles are the normal
case: a Sun elevation of 0.17° at azimuth 1.57° is ordinary input, and it is exactly the pair quoted in the issue. A range
heuristic would refuse real polar geometry.

What holds instead, now pinned by `engine/tests/units_contract.rs`:

- Every angle is in degrees, named `_deg`, with azimuth in [0, 360) and elevation in [−90, 90]. Nothing is rescaled.
- A request cannot declare or use another unit: `angle_unit`, `unit`, `azimuth_rad` and similar keys are refused
  (unknown fields are denied at every level).

The remaining risk is a caller that converts to radians and still writes `_deg`. The engine cannot detect that; the
callers are the Go API and the science pipeline, both of which produce degrees. The `#[ignore]`d test in PR #205
(`radians_passed_under_deg_name_is_a_known_gap`) asserts the opposite behaviour and should be dropped, not enabled.

## 8. Approved and not approved wording

| Wording | Decision |
|---|---|
| "Computed from NASA LRO/LOLA terrain and NAIF SPICE ephemerides (preliminary)" | Approved |
| "Sun/Earth directions agree with JPL Horizons within 0.001° at 120 checked points" | Approved |
| "Sunlight within 5 pp of NASA PGDA at four of five sites" | Approved, with the fifth site named |
| "Validated", "NASA-validated", "flight-ready", "mission-certified" | Not approved |
| "Communication available" / "power available" for a visible Earth / Sun | Not approved; say "Earth above terrain" / "Sun above terrain" |
| Peak Near Shackleton "80 % sunlight" without a caveat | Not approved (section 2.4) |

## 9. Evidence

Tests added by this review and where they were run are listed in the pull request that carries this file.
