# Mission Report — HTML / PDF Evidence Export (proposal)

**Lead developer:** @gustavofullstack (#58) · **QA/risk taxonomy:** @Ninzinhu (#59) · **UX review:** @lisanogueira (#60) · **Science signoff:** @joeljato (#56) · **Source provenance:** @maccachera (#55).

## User journey

User chooses site + UTC date + lander constraints -> computes actual scenario -> compares original and delayed/replanned scenario -> presses **Export Mission Report** -> receives **self-contained, printable HTML** plus **Save to PDF** via browser print (A4/Letter stylesheet). Never embed untraceable numbers; default to unavailable/unknown if computation is absent.

## Required report sections

1. Document ID, revision, generated UTC, project BRASPACE, explicit independent hackathon/non-NASA-endorsement disclaimer, source hashes and software/model version.
2. Scenario inputs: UTC start, length, site coordinates/elevation, observer mast/antenna height, assumed solar array area/efficiency, battery capacity/load, required max downtime thresholds, science objective.
3. Engineering context: NASA DEM / NAIF SPICE source and frame, sampling rate/time range, named terrain resolution and provenance, science status **VERIFIED** only after evidence.
4. Sunlight: site skyline, Sun altitude/azimuth and summary of geometric light windows, maximum darkness; mark solar-power estimate **assumed model** if panel hardware assumptions are used.
5. Earth line-of-sight: Earth azimuth/elevation and visibility windows, maximum geometric blackout; explicitly **not guaranteed RF or DSN contact**.
6. Operational risk register: category, severity, evidence, triggering threshold, margin or unknown state, countermeasure owner and scenario alternative.
7. Recovery side-by-side: initial scenario and replanned (+24/+48/+72 h, equipment change, or nearby landing candidate); diff of same units/data models and reasons for unmet constraints.
8. Data-quality and model limits: missing DEM/ephemerides, uncertainty vs sensitivity, source license/credit and whether parts were AI-assisted.
9. Source appendix and deterministic receipt: exact manifest IDs, file SHAs, reproducible request fingerprint, timestamp, code commit and links.

## Typed response model (documentation; not deployed API)

```json
{
  "schema": "braspace.mission-report.v1",
  "generated_at_utc": null,
  "scenario": {"site_id": null, "epoch_utc": null, "duration_hours": null},
  "input_digest_sha256": null,
  "scientific_status": "UNVERIFIED_INPUTS",
  "sources": [],
  "sun_visibility": {"hours": null, "longest_darkness_hours": null},
  "earth_geometry": {"hours": null, "longest_obstruction_hours": null},
  "power_model": {"status": "NOT_MODELED", "assumptions": []},
  "risk_register": [],
  "recovery_scenarios": [],
  "limitations": ["No mission-grade predictions; inputs or physical models may be unverified"]
}
```

**Important:** Null means not calculated. No `0` substitution. `scientific_status` must come from the verified backend gate, never self-promoted by UI.

## Risk taxonomy and explanations

| ID | Category | What constitutes risk | Correct output when missing |
|---|---|---|---|
| ENERGY | prolonged geometric dark interval versus battery endurance model | Constraint margin = maximum darkness allowance minus longest darkness | UNKNOWN |
| COMM-DTE | Earth blocked by lunar terrain versus tolerated geometric outage | Margin in hours; explicitly geometric DTE only | UNKNOWN |
| TERRAIN | slope, local obstructions and site DEM fidelity | Source-backed slope and DEM resolution | UNKNOWN |
| TIMING | arrival slip or incomplete observation window | Δ from selected date and margin to critical visibility transitions | UNKNOWN |
| SCIENCE | ice/PSR access and measurements where dataset supports it | Source-backed objective score/constraint without fabricated mineral certainty | UNKNOWN |
| PROVENANCE | missing/stale source, invalid coordinates/frame or scientific model | Block VERIFIED label if missing | DATA NOT VALIDATED |

Severity levels **CRITICAL / HIGH / MODERATE / LOW / UNKNOWN** may only be computed from explicitly configured, documented mission thresholds; do not default missing data to LOW. Avoid numerical global safety score.

## Security and quality

Escape HTML text and URLs, forbid arbitrary untrusted media embeds, do not leak API credentials in exported output, ensure CSP-safe static markup. Provide accessible tables, report document language EN for NASA submission, local timezone shown only as optional display (canonical UTC). Print page numbers, source URLs and no clipped charts. Use simple browser print-to-PDF before adding heavy PDF server dependencies.

## Minimum demo (unverified until tested)

1. Open **Recover** scenario after delay; produce one comparison and risk update.
2. Click **Mission Report**; inspect HTML tables for source IDs, model status, unknown-risk handling.
3. Browser Save as PDF; print result is readable offline with evidence and no secrets.
4. QA independently verifies it matches actual Go/Rust result JSON and does not claim actual NASA terrain unless integrated.

**Target gate:** real 7-slide demo must describe only features actually implemented and validated; export may remain P1 if physical science source integration blocks.
