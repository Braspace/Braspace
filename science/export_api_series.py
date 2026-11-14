#!/usr/bin/env python3
"""Export the five LOLA+SPICE precomputed site series to the API ingest format.

Reads the artefacts written by science/build_web_assets.py (web/data/sites/<id>.bin + .json),
verifies the .bin against the SHA-256 recorded by that generator, and writes
api/sitedata/series/<id>.json (schema braspace.site-series.v1, science_status PRELIMINARY)
plus prints the catalog series_sha256 of each output. Angles are copied unchanged
(0.01 deg quantisation of the generator); nothing is interpolated or promoted.

    python3 science/export_api_series.py --web-data web/data --out api/sitedata/series
"""
import argparse, hashlib, json, pathlib, struct
from datetime import datetime, timedelta, timezone

SITES = ["mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton"]


def export(web: pathlib.Path, out: pathlib.Path, site_id: str) -> str:
    meta = json.loads((web / "sites" / f"{site_id}.json").read_text(encoding="utf-8"))
    raw = (web / "sites" / f"{site_id}.bin").read_bytes()
    ser = meta["series"]
    bin_sha = hashlib.sha256(raw).hexdigest()
    if bin_sha != ser["sha256"]:
        raise SystemExit(f"{site_id}: .bin SHA-256 {bin_sha} != recorded {ser['sha256']}")
    n = ser["count"]
    if len(raw) != n * 8:
        raise SystemExit(f"{site_id}: expected {n * 8} bytes, got {len(raw)}")
    sun_az = struct.unpack_from(f"<{n}H", raw, 0)
    sun_el = struct.unpack_from(f"<{n}h", raw, 2 * n)
    ea_az = struct.unpack_from(f"<{n}H", raw, 4 * n)
    ea_el = struct.unpack_from(f"<{n}h", raw, 6 * n)
    prov = meta["provenance"]
    start = datetime.strptime(ser["start_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    samples = [
        {"sun": {"azimuth_deg": sun_az[i] / 100, "elevation_deg": sun_el[i] / 100},
         "earth": {"azimuth_deg": ea_az[i] / 100, "elevation_deg": ea_el[i] / 100}}
        for i in range(n)
    ]
    doc = {
        "schema": "braspace.site-series.v1",
        "site_id": site_id,
        "science_status": "PRELIMINARY",
        "provenance": {
            "terrain_dataset_id": prov["terrain"],
            "terrain_sha256": prov["terrain_sha256"],
            "ephemeris_id": prov["ephemeris"],
            "frame": "MOON_ME",
            "generator": prov["generator"] + " -> science/export_api_series.py",
            "note": (f"PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED; derived from LOLA + SPICE, not NASA-reviewed. "
                     f"source_file=web/data/sites/{site_id}.bin source_sha256={bin_sha} "
                     f"quantisation_deg={ser['quantisation_deg']} step_seconds={ser['step_seconds']} "
                     f"terrain_resolution=80 m/px ray_max_distance_m={prov['ray_parameters']['max_distance_m']} "
                     f"aberration={prov['aberration_correction']}"),
        },
        "observer_height_m": meta["site"]["observer_height_m"],
        "terrain_horizon": [{"azimuth_deg": h["az"], "elevation_deg": h["el"]} for h in meta["terrain_horizon"]],
        "start_utc": ser["start_utc"],
        "step_seconds": ser["step_seconds"],
        "samples": samples,
    }
    out.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(doc, separators=(",", ":")) + "\n").encode()
    (out / f"{site_id}.json").write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--web-data", type=pathlib.Path, default=pathlib.Path("web/data"))
    p.add_argument("--out", type=pathlib.Path, default=pathlib.Path("api/sitedata/series"))
    a = p.parse_args()
    for sid in SITES:
        print(sid, export(a.web_data, a.out, sid))


if __name__ == "__main__":
    main()
