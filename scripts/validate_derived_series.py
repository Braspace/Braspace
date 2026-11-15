#!/usr/bin/env python3
"""Fail-closed NASA/NAIF artifact integrity (NOT independent science validation)."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SERIES = ROOT / "api/sitedata/series/connecting-ridge-NAIF-PRELIMINARY.json"
META = ROOT / "science/evidence/connecting-ridge-NAIF-PRELIMINARY.metadata.json"
CATALOG = ROOT / "api/sitedata/catalog.json"
SERIES_SHA = "dcfc750d6237a73af29afb4c4c29a6feae4d8c39a6b1a6092032343bb227906a"  # after PR #86 (LT+S)
META_SHA = "6afbedfbf199af943b39c5b3f6cd0d8506d38aba1d784ace6f309af904c6253a"  # after PR #86 (LT+S)
LOLA_SHA = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"
KERNEL_SHA = {
    "naif0012.tls": "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
    "de440s.bsp": "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2",
    "moon_pa_de440_200625.bpc": "60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f",
    "moon_de440_250416.tf": "a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768",
}

class IntegrityError(ValueError):
    pass

def require(condition: bool, reason: str) -> None:
    if not condition:
        raise IntegrityError(reason)

def parse_strict(data: bytes) -> dict[str, Any]:
    def unique(items: list[tuple[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in items:
            require(key not in out, "duplicate key: " + key)
            out[key] = value
        return out
    def nonfinite(token: str) -> None:
        raise IntegrityError("JSON contains " + token)
    value = json.loads(data, object_pairs_hook=unique, parse_constant=nonfinite)
    require(isinstance(value, dict), "expected top-level JSON object")
    return value

def read_pinned(path: Path, expected_sha: str) -> dict[str, Any]:
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == expected_sha, "source byte SHA-256 mismatch: " + str(path))
    return parse_strict(raw)

def direction(value: Any) -> None:
    require(isinstance(value, dict), "direction missing")
    a, e = value.get("azimuth_deg"), value.get("elevation_deg")
    require(type(a) in (int, float) and math.isfinite(a) and 0 <= a < 360, "invalid azimuth")
    require(type(e) in (int, float) and math.isfinite(e) and -90 <= e <= 90, "invalid elevation")

def validate(series: dict[str, Any], meta: dict[str, Any], catalog: dict[str, Any]) -> None:
    require(series.get("schema") == "braspace.site-series.v1", "unexpected schema")
    require(series.get("site_id") == "connecting-ridge", "unexpected site")
    require(series.get("science_status") == "UNVERIFIED", "source is not scientifically VALIDATED")
    for flag in ("validated_against_independent_reference", "lola_horizon_independently_validated", "nasa_mission_certified"):
        require(meta.get(flag) is False, "scientific validation claim not supported: " + flag)
    require(meta.get("sun_earth_center_not_disc") is True, "solar disc caveat missing")
    require(meta.get("spice_aberration_correction") == "LT+S from surface site (spkcpo); Horizons-airless convention", "aberration assumption changed")
    require(meta.get("spice_frame") == "MOON_ME_DE440_ME421", "SPICE frame changed")
    require(meta.get("pds_sha256") == LOLA_SHA, "LOLA digest changed")
    require(meta.get("jpl_naif_kernels_sha256") == KERNEL_SHA, "NAIF kernel digests changed")
    require(set(meta.get("kernel_sources", {})) == set(KERNEL_SHA), "kernel source list incomplete")
    require(series.get("provenance", {}).get("terrain_sha256") == LOLA_SHA, "terrain provenance mismatch")
    require(series.get("provenance", {}).get("frame") == "MOON_ME", "Go/Rust frame mismatch")
    require(series.get("provenance", {}).get("terrain_dataset_id") == meta.get("pds_product"), "PDS product mismatch")
    require(series.get("start_utc") == meta.get("start_utc") == "2026-11-15T00:00:00Z", "UTC grid changed")
    require(series.get("step_seconds") == 3600 and meta.get("step_minutes") == 60, "time step changed")
    require(series.get("observer_height_m") == 2, "observer height changed")
    require(meta.get("samples") == 72, "metadata sample count changed")
    require(meta.get("site_latitude_deg") == -89.4632 and meta.get("site_longitude_deg") == -137.49, "coordinates changed")
    sites = [s for s in catalog.get("sites", []) if s.get("id") == "connecting-ridge"]
    require(len(sites) == 1, "catalog site missing or duplicate")
    site = sites[0]
    # Since PR #143 the API serves series/connecting-ridge.json (SHA-pinned in the catalog);
    # this 72 h NAIF artifact is evidence, not the served series.
    require(site.get("series_file") == "series/connecting-ridge.json", "wrong catalog series association")
    require(isinstance(site.get("series_sha256"), str) and len(site["series_sha256"]) == 64, "catalog series not SHA-pinned")
    require(site.get("coordinate", {}).get("role") == "feature_center", "feature center falsely promoted to touchdown")
    require(site["coordinate"]["latitude_deg"] == meta["site_latitude_deg"] and
            site["coordinate"]["longitude_deg"] == meta["site_longitude_deg"], "catalog coordinate mismatch")
    terrain = series.get("terrain_horizon", [])
    require(isinstance(terrain, list) and len(terrain) == 36, "terrain grid not 36 rays")
    for i, t in enumerate(terrain):
        direction(t)
        require(t["azimuth_deg"] == 10 * i, "terrain azimuth ordering changed")
    samples = series.get("samples", [])
    require(isinstance(samples, list) and len(samples) == 72, "ephemeris grid not 72 hours")
    for item in samples:
        require(isinstance(item, dict), "malformed sample")
        direction(item.get("sun"))
        direction(item.get("earth"))
    require(samples[0]["sun"]["elevation_deg"] == 1.389712, "first sample changed")
    require(samples[-1]["earth"]["elevation_deg"] == 0.020623, "last sample changed")

def validate_files() -> None:
    validate(read_pinned(SERIES, SERIES_SHA), read_pinned(META, META_SHA), parse_strict(CATALOG.read_bytes()))

if __name__ == "__main__":
    validate_files()
    print("PASS: exact artifact provenance and UNVERIFIED status. NOT independent NASA scientific validation.")
