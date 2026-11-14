# Connecting Ridge — NASA-source-derived, **UNVERIFIED** Sun/Earth grid

This is the first **source-backed** South Pole site input for the Go ↔ Rust evaluator. It is **not scientifically validated**, a safe landing recommendation, an RF link budget, or flight software.

## Exact reproducibility
- Source workflow: [GitHub Actions #43615329546](https://github.com/Braspace/Braspace/actions/runs/43615329546), success, science head `2c14394a94086f1897b6fc9ee1473b908f94ab71`.
- Artifact: `connecting-ridge-naif-preliminary-72h`, ID `14121574245`, archive digest `sha256:b18ca9bb11aa9a165fd65d871744394fdc8fcdfe6cdda61db08db1de2b7f18a8`.
- Original series JSON SHA-256: `9ae0a79ca8229d23dfed6423f15a49c1b3d8fa9d145a4ff099ce48fa4f2f622f`; original metadata JSON SHA-256: `09e0bf3f5c76bff248d7452d97219d8f1aa798140da27041fdaef67f21350541`. This repository stores a semantically identical JSON reserialization of the verified artifact; its byte-level JSON hash is different by design.
- Source raster: PDS `LDEM_80S_80M.IMG`, 115,520,000 bytes, SHA-256 `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`; **the 115 MB raw raster is not checked into Git**.
- Kernel SHA-256 values and source URLs are preserved in `data/derived/connecting-ridge-naif.metadata.json`. The computational frame used by SPICE was `MOON_ME_DE440_ME421`, represented as `MOON_ME` in the existing Go/Rust series contract. This correspondence needs independent geodesy review.
- Coordinate = `-89.4632°, -137.49°`, **Artemis III feature center**, not an approved landing touchdown site. Observer height 2 m. Terrain horizon: 36 rays at 10° increments with preliminary ray marching. UTC epoch `2026-11-15T00:00:00Z`, 72 hourly samples ending before `2026-11-18T00:00:00Z`.
- Source generator: `science/spice_lunar_angles.py`, with geometric Sun/Earth **center** direction, no light-time correction and no solar disc / RF link computation.

## Integration safety
- Site ID `connecting-ridge` (13 real-site catalog entries plus two synthetic fixtures); `series_file` uses `UNVERIFIED`, never `VALIDATED`.
- UI and API must prominently expose `science_status=UNVERIFIED` and `scientifically_validated=false`. The Rust horizon classifier measures geometric clearance against these source-derived angles, **not** operational surface power or communications performance.
- Go tests only prove schema loading, provenance and internal deterministic evaluation, not independent accuracy. Do **not** describe this series as a NASA-calibrated prediction or certified landing opportunity.
- Next gates: independent LOLA grid control point verification; Horizons/NAIF look-angle comparison with error budget; review mast height, site coordinates and frame; multi-site real data; Sun/Earth disc and illumination model; public browser QA and NASA submission.

## Exact source request example
```bash
curl -s http://localhost:8080/api/sites/connecting-ridge
curl -s -H 'Content-Type: application/json' -d '{"site_ids":["connecting-ridge"],"start_utc":"2026-11-15T00:00:00Z","duration_hours":24,"include_series":true}' http://localhost:8080/api/compare
```
Review both scientific disclaimers in the JSON response before using any metrics.
