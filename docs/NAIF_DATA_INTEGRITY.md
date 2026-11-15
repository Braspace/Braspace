# NAIF/LOLA derived-series integrity — not scientific validation

Purpose: pin the exact source-backed Connecting Ridge sample/metadata bytes and reject fake scientific claims. Complements PR #75 without modifying its science code.

## Source of record
- [GitHub Actions run #43615329546](https://github.com/Braspace/Braspace/actions/runs/43615329546), successful, original SHA 2c14394a94086f1897b6fc9ee1473b908f94ab71.
- Artifact connecting-ridge-naif-preliminary-72h, id 14121574245.
- Series SHA-256 9ae0a79ca8229d23dfed6423f15a49c1b3d8fa9d145a4ff099ce48fa4f2f622f.
- Metadata SHA-256 09e0bf3f5c76bff248d7452d97219d8f1aa798140da27041fdaef67f21350541.
- NASA LRO/LOLA original raster SHA-256 e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc.
- Exact NAIF kernel SHA-256 set is pinned by api/cmd/validatederivedseries and stored in science/evidence/connecting-ridge-NAIF-PRELIMINARY.metadata.json.

## Run
    go -C api run ./cmd/validatederivedseries
    go -C api test -count=1 -v ./cmd/validatederivedseries

Checks original byte identity, provenance, site feature-center semantics, 36 terrain rays, 72 hourly samples, input bounds and all UNVERIFIED scientific flags. Independent LOLA raster registration, Horizons residuals, lunar frame accuracy, uncertainty, solar disc, RF budget and actual mission safety remain unvalidated. Passing this gate proves only source provenance consistency, NOT NASA-approved landing predictions.
