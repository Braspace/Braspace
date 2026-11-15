# Horizon reach study: 100 km is not enough at two of the five sites

Author: @joeljato (Scientific Computing Lead). Date: 2026-11-15. Follows section 2.4 of
`docs/SCIENCE_REVIEW_ONBOARD_BS061.md`. Status: **preliminary, not independently validated.**

## Question

The site series trace the LOLA terrain horizon out to 100 km (`science/lola_horizon.py` refuses more). Section 2.4 of the
review suspected that this overestimates sunlight at Peak Near Shackleton. Is that so, and does it affect other sites?

## Method

`api/cmd/horizonreachstudy` (Go; ported from `science/horizon_reach_study.py` with byte-identical output) repeats the same ray march without the 100 km limit (160 m steps, bilinear LOLA heights,
observer 2 m above ground, one ray per degree) and records the horizon at 100, 150, 200, 250 and 300 km. Sun and Earth
visibility are then recounted from the **committed** hourly series, so only the horizon changes between columns.
Input: `LDEM_80S_80M.IMG`, SHA-256 checked against the team pin. Runtime: about 1 s. Output: `science/results/horizon_reach.json`.
Run it from `api/`: `go run ./cmd/horizonreachstudy --img ../data/raw/lola/ldem_80s_80m.img --label ../data/raw/lola/ldem_80s_80m.lbl`.

**Control.** At 100 km the study reproduces the committed horizon of all five sites with a maximum difference of 0.0°,
so the march is the same computation as the pipeline's.

## Result

Sun centre above the terrain, share of the 35,064 hours of 2025 to 2028:

| Site | 100 km (series) | 150 km | 200 km | 250 km | Change | Mean disc vs NASA PGDA, 100 km → 200 km |
|---|---|---|---|---|---|---|
| Mons Mouton (IM-2) | 45.22 % | 45.22 % | 45.22 % | 45.22 % | none | −0.86 pp → −0.86 pp |
| **Malapert Massif** | **38.44 %** | 33.99 % | **33.84 %** | 33.84 % | **−4.60 pp** | +3.55 pp → −1.12 pp |
| Nobile Rim 1 | 31.18 % | 31.18 % | 31.18 % | 31.18 % | none | +0.37 pp → +0.37 pp |
| Connecting Ridge | 53.32 % | 53.32 % | 53.32 % | 53.32 % | none | +1.27 pp → +1.27 pp |
| **Peak Near Shackleton** | **80.38 %** | 75.89 % | **75.52 %** | 75.52 % | **−4.86 pp** | +9.02 pp → +5.08 pp |

Other figures that move:

| Site | Metric | 100 km | 200 km |
|---|---|---|---|
| Malapert Massif | Longest darkness (Sun centre hidden) | 670 h | **3,389 h** (141 days, from 2025-04-02; 2,805 h and 2,803 h in the next two winters) |
| Peak Near Shackleton | Longest darkness | 345 h | 381 h |
| Peak Near Shackleton | Earth centre above terrain | 58.87 % | 55.37 % |

Where the horizon rises: Malapert, 68 azimuths between 140° and 207°, by up to 1.77°; Peak Near Shackleton, 84 azimuths
between 122° and 269°, by up to 2.04°; Nobile Rim 1, 53 azimuths between 58° and 110°, by up to 2.14°, with no effect on
its Sun or Earth figures.

## Why it happens

Both affected sites are high: Malapert Massif at +4.8 km, Peak Near Shackleton at +1.6 km. From a height `h` the bare
sphere's horizon is `sqrt(2 R h)` away: 129 km for Malapert, already past the 100 km limit. Terrain of height `h2` beyond
that stays visible out to `sqrt(2 R h) + sqrt(2 R h2)`. Toward the pole and across it there is such terrain, and it stands
above the very low horizon these sites see in that direction (−6° to −4° at Malapert with the 100 km horizon).

At Malapert this decides the winter. With the 100 km horizon the Sun, at −5.3° to −4.2° elevation, clears that depressed
southern horizon for about 200 hours inside the 2025 winter (median margin 0.53°). With the farther terrain included the
horizon there is −4.4° to −3.4° and the Sun's centre never clears it (best margin −0.05°), so the short darkness runs
join into one of 141 days. The margin is small: part of the solar disc may still show, and "darkness" here means the
centre is hidden.

## How far to trust it

- **For:** the control is exact; the figures stop changing between 200 km and 250 km at Peak Near Shackleton, where the
  DEM covers every ray; both affected sites move toward the independent NASA PGDA average (Malapert from +3.6 pp to
  −1.1 pp, Peak Near Shackleton from +9.0 pp to +5.1 pp).
- **Against:** one implementation, by one person, in one evening. `LDEM_80S_80M` ends at 80° S, so for the three sites
  farther from the pole many rays leave the DEM before 200 km (Malapert: 79 of 360 at 200 km; the azimuths that changed
  its result point toward the pole and are covered). Terrain north of 80° S is not considered at all, so the true
  horizon can only be equal or higher. The 141-day darkness at Malapert has no independent reference. Peak Near
  Shackleton is still 5.1 pp above PGDA, which this study does not explain.

## What this means for the product

The numbers shown today for Malapert Massif and Peak Near Shackleton (web screens, `web/data/sites.json`, the API
series, the results tables) come from the 100 km horizon. For those two sites:

- Sunlight is overstated by about 4.6 pp and 4.9 pp.
- Malapert's "longest darkness" is 670 h in the product and 3,389 h here. Anything derived from it (battery and night
  rules, scenario verdicts, the class kit) is optimistic for that site.
- The earlier PGDA-only chip (#254) flagged Peak Near Shackleton only. The MoonProof context and Moon HD site card now
  also flag Malapert, using this study only while the catalogue still carries the original 100 km metrics. They label
  sunlight as an upper bound and the longest darkness as a lower bound; the 200 km results are shown as preliminary,
  not substituted into calculations or the API.

**Not done here:** the series were not regenerated. That means raising the limit in `lola_horizon.py`, re-running
`go run ./cmd/threesitepipeline`, `science/build_web_assets.py` and `go run ./cmd/exportapiseries` (api/), and updating every pinned SHA-256, table and
test that carries the old values. It is the correct fix and it is a team decision, the day before the deadline.
