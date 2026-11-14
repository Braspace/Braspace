"""BRASPACE offline pipeline: real NASA LOLA terrain horizon + JPL/NAIF SPICE
Sun/Earth look angles for three lunar south-pole sites.

Inputs (downloaded separately, never committed):
  * LRO/LOLA LDEM_80S_80M.IMG + .LBL  (PDS Geosciences Node)
  * NAIF kernels: naif0012.tls, de440s.bsp, moon_pa_de440_200625.bpc,
    moon_de440_250416.tf

Outputs one compact JSON per site (for a static web front end) plus a
summary.json with the comparison metrics.

Scientific status: PRELIMINARY. Sun and Earth are treated as points (their
centres); the solar disc (~0.27 deg radius) is reported separately as a
partial-visibility fraction. No refraction (the Moon has no atmosphere).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lola_horizon import DEM, Grid, KNOWN_REVIEWED_SHA256, digest, sample_horizon  # noqa: E402
from lola_horizon import site_basis  # noqa: E402
from spice_lunar_angles import FRAME, KERNEL_NAMES, KERNEL_SOURCES, checksum, look_angles  # noqa: E402

SUN_RADIUS_DEG = 0.2666  # mean apparent solar radius seen from the Moon

# Three candidate sites, all inside NASA's refined Artemis III region list.
SITES = [
    {
        "id": "mons-mouton-im2",
        "name": "Mons Mouton (IM-2 Athena target)",
        "latitude_deg": -84.78,
        "longitude_deg": 29.13,
        "source": "LROC image 1401, IM-2 intended landing site (approx.)",
        "source_url": "https://www.lroc.asu.edu/images/1401",
    },
    {
        "id": "malapert-massif",
        "name": "Malapert Massif",
        "latitude_deg": -85.9948,
        "longitude_deg": -0.23578,
        "source": "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R23",
        "source_url": "",
    },
    {
        "id": "nobile-rim-1",
        "name": "Nobile Rim 1",
        "latitude_deg": -85.4381,
        "longitude_deg": 37.36667,
        "source": "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R06",
        "source_url": "",
    },
    {
        "id": "connecting-ridge",
        "name": "Connecting Ridge (Shackleton–de Gerlache)",
        "latitude_deg": -89.4632,
        "longitude_deg": -137.49,
        "source": "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2 (catalog feature centre)",
        "source_url": "",
    },
    {
        "id": "peak-near-shackleton",
        "name": "Peak Near Shackleton",
        "latitude_deg": -88.811,
        "longitude_deg": 123.6901,
        "source": "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R07",
        "source_url": "",
    },
]


def horizon_at(horizon: list[dict], az: float) -> float:
    """Periodic linear interpolation of an evenly sampled 0..360 skyline."""
    n = len(horizon)
    step = 360.0 / n
    x = (az % 360.0) / step
    i = int(math.floor(x)) % n
    j = (i + 1) % n
    f = x - math.floor(x)
    return horizon[i]["elevation_deg"] * (1 - f) + horizon[j]["elevation_deg"] * f


def disc_fraction(margin_deg: float, radius_deg: float) -> float:
    """Visible fraction of a uniform disc whose centre sits margin_deg above a
    locally straight horizon line (circular-segment area)."""
    if margin_deg >= radius_deg:
        return 1.0
    if margin_deg <= -radius_deg:
        return 0.0
    d = -margin_deg / radius_deg  # distance of horizon line above centre, in radii
    hidden = (math.acos(d) - d * math.sqrt(1 - d * d)) / math.pi
    return 1.0 - hidden


def runs(flags: list[bool], value: bool) -> list[int]:
    out, cur = [], 0
    for f in flags:
        if f == value:
            cur += 1
        elif cur:
            out.append(cur)
            cur = 0
    if cur:
        out.append(cur)
    return out


def compute_series(spice, site: dict, observer_radius_km: float, start: dt.datetime,
                   hours: int, step_minutes: int) -> list[dict]:
    samples = []
    up = site_basis(site["latitude_deg"], site["longitude_deg"])[0]
    obs_km = [observer_radius_km * u for u in up]
    for i in range(hours * 60 // step_minutes):
        epoch = start + dt.timedelta(minutes=i * step_minutes)
        et = spice.str2et(epoch.strftime("%Y %b %d %H:%M:%S UTC"))
        # Apparent (LT+S) direction from the surface site itself (same convention as PR #86
        # and JPL Horizons "airless apparent"); converted back to a Moon-centred vector.
        sun_rel, _ = spice.spkcpo("SUN", et, FRAME, "OBSERVER", "LT+S", obs_km, "MOON", FRAME)
        earth_rel, _ = spice.spkcpo("EARTH", et, FRAME, "OBSERVER", "LT+S", obs_km, "MOON", FRAME)
        sun = [sun_rel[j] + obs_km[j] for j in range(3)]
        earth = [earth_rel[j] + obs_km[j] for j in range(3)]
        s = look_angles(sun, site["latitude_deg"], site["longitude_deg"], observer_radius_km)
        e = look_angles(earth, site["latitude_deg"], site["longitude_deg"], observer_radius_km)
        samples.append({"t": epoch.strftime("%Y-%m-%dT%H:%MZ"),
                        "sun_az": s["azimuth_deg"], "sun_el": s["elevation_deg"],
                        "earth_az": e["azimuth_deg"], "earth_el": e["elevation_deg"]})
    return samples


def metrics(samples: list[dict], horizon: list[dict], step_minutes: int) -> dict:
    sun_vis, earth_vis, both, disc = [], [], [], []
    for s in samples:
        sm = s["sun_el"] - horizon_at(horizon, s["sun_az"])
        em = s["earth_el"] - horizon_at(horizon, s["earth_az"])
        s["sun_margin"] = round(sm, 4)
        s["earth_margin"] = round(em, 4)
        s["sun_disc_fraction"] = round(disc_fraction(sm, SUN_RADIUS_DEG), 4)
        sun_vis.append(sm >= 0)
        earth_vis.append(em >= 0)
        both.append(sm >= 0 and em >= 0)
        disc.append(s["sun_disc_fraction"])
    n = len(samples)
    h = step_minutes / 60.0
    pct = lambda flags: round(100.0 * sum(flags) / n, 2)  # noqa: E731
    longest = lambda flags, v: round(max(runs(flags, v), default=0) * h, 1)  # noqa: E731
    return {
        "sun_center_visible_pct": pct(sun_vis),
        "mean_solar_disc_visible_pct": round(100.0 * sum(disc) / n, 2),
        "earth_center_visible_pct": pct(earth_vis),
        "sun_and_earth_visible_pct": pct(both),
        "longest_darkness_h": longest(sun_vis, False),
        "longest_continuous_sunlight_h": longest(sun_vis, True),
        "longest_earth_blackout_h": longest(earth_vis, False),
        "max_sun_elevation_deg": round(max(s["sun_el"] for s in samples), 3),
        "samples": n,
        "step_minutes": step_minutes,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--img", type=pathlib.Path, required=True)
    p.add_argument("--label", type=pathlib.Path, required=True)
    p.add_argument("--kernels-dir", type=pathlib.Path, required=True)
    p.add_argument("--out-dir", type=pathlib.Path, required=True)
    p.add_argument("--start-utc", default="2027-01-01T00:00:00Z")
    p.add_argument("--hours", type=int, default=24 * 365)
    p.add_argument("--step-minutes", type=int, default=60)
    p.add_argument("--observer-height-m", type=float, default=2.0)
    p.add_argument("--max-distance-m", type=int, default=100000)
    p.add_argument("--ray-step-m", type=int, default=160)
    p.add_argument("--azimuth-step-deg", type=int, default=1)
    p.add_argument("--site", action="append", help="limit to these site ids")
    a = p.parse_args()

    label = a.label.read_text(encoding="ascii")
    grid = Grid.from_label(label)
    dem_sha = digest(a.img)
    if dem_sha != KNOWN_REVIEWED_SHA256:
        raise SystemExit("LOLA SHA-256 mismatch: " + dem_sha)
    kpaths = [a.kernels_dir / k for k in KERNEL_NAMES]
    kernel_sha = {k.name: checksum(k) for k in kpaths}
    start = dt.datetime.fromisoformat(a.start_utc.replace("Z", "+00:00")).astimezone(dt.timezone.utc)

    import spiceypy as spice

    a.out_dir.mkdir(parents=True, exist_ok=True)
    summary = {"generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "window": {"start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "hours": a.hours,
                          "step_minutes": a.step_minutes},
               "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
               "sites": []}
    spice.kclear()
    try:
        for k in kpaths:
            spice.furnsh(str(k))
        with DEM(a.img, grid) as dem:
            for site in SITES:
                if a.site and site["id"] not in a.site:
                    continue
                hz = sample_horizon(dem, site["latitude_deg"], site["longitude_deg"], a.observer_height_m,
                                    a.max_distance_m, a.ray_step_m, a.azimuth_step_deg)
                horizon = hz["terrain_horizon"]
                r_km = (grid.radius_m + hz["site"]["site_elevation_m"] + a.observer_height_m) / 1000
                samples = compute_series(spice, site, r_km, start, a.hours, a.step_minutes)
                m = metrics(samples, horizon, a.step_minutes)
                record = {
                    "schema": "braspace.site-visibility.v1",
                    "site": {**site, "site_elevation_m": hz["site"]["site_elevation_m"],
                             "observer_height_m": a.observer_height_m},
                    "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
                    "metrics": m,
                    "terrain_horizon": [{"az": h["azimuth_deg"], "el": h["elevation_deg"]} for h in horizon],
                    "horizon_coverage": hz["coverage"],
                    "series": samples,
                    "provenance": {
                        "terrain": "LRO-L-LOLA-4-GDR-V1.0 / LDEM_80S_80M.IMG V2.0 (80 m/px)",
                        "terrain_sha256": dem_sha,
                        "ray_parameters": hz["ray_parameters"],
                        "ephemeris": "NAIF " + ", ".join(KERNEL_NAMES),
                        "kernel_sha256": kernel_sha,
                        "kernel_sources": KERNEL_SOURCES,
                        "spice_frame": FRAME,
                        "aberration_correction": "LT+S (apparent) from the surface site via spkcpo",
                        "point_targets": "Sun and Earth centres; solar disc fraction from straight-horizon approximation",
                        "generator": "science/three_site_pipeline.py v0.1",
                        "nasa_certified": False,
                    },
                }
                (a.out_dir / f"{site['id']}.json").write_text(
                    json.dumps(record, separators=(",", ":"), allow_nan=False), encoding="utf-8")
                summary["sites"].append({"id": site["id"], "name": site["name"],
                                         "latitude_deg": site["latitude_deg"],
                                         "longitude_deg": site["longitude_deg"],
                                         "site_elevation_m": hz["site"]["site_elevation_m"],
                                         "max_horizon_deg": round(max(h["elevation_deg"] for h in horizon), 3),
                                         **m})
                print(site["id"], json.dumps(m))
    finally:
        spice.kclear()
    (a.out_dir / "summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n",
                                            encoding="utf-8")


if __name__ == "__main__":
    main()
