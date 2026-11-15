"""How far must the terrain horizon be traced? Sunlight at the five sites for several ray reaches.

The site series (science/three_site_pipeline.py) trace the LOLA horizon out to 100 km, the limit that
science/lola_horizon.py enforces. This study repeats the same ray march without that limit and recounts
Sun and Earth visibility from the committed hourly series (web/data/sites/<id>.bin), so the only thing
that changes between columns is the reach of the rays.

Same geometry as sample_horizon(): great-circle steps of 160 m, bilinear LOLA heights, apparent elevation
from the observer 2 m above ground, one ray per degree of azimuth. Each ray is marched once and its
running maximum is recorded at every requested reach. A ray that leaves LDEM_80S_80M (north of 80 S)
gets no more samples; such azimuths are counted as partial for that reach.

Standard library only:
  python3 science/horizon_reach_study.py --img data/raw/lola/ldem_80s_80m.img --label data/raw/lola/ldem_80s_80m.lbl
"""
from __future__ import annotations

import argparse
import array
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lola_horizon import DEM, KNOWN_REVIEWED_SHA256, Grid, digest, dot, site_basis  # noqa: E402
from three_site_pipeline import SUN_RADIUS_DEG, disc_fraction, horizon_at, runs  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITES = ["mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton"]
STEP_M = 160


def march(dem: DEM, lat: float, lon: float, observer_height_m: float, reaches: list[int]) -> tuple[dict, dict]:
    """Horizon (360 elevations) and number of partial azimuths for every reach, from one march per azimuth."""
    grid = dem.grid
    base = dem.height(lat, lon)
    if base is None:
        raise ValueError("no DEM data at observer")
    up, north, east = site_basis(lat, lon)
    height0 = grid.radius_m + base + observer_height_m
    horizons = {r: [] for r in reaches}
    partial = {r: 0 for r in reaches}
    for az in range(360):
        angle = math.radians(az)
        bearing = tuple(n * math.cos(angle) + e * math.sin(angle) for n, e in zip(north, east))
        maximum, incomplete, pending = -90.0, False, list(reaches)
        for dist in range(STEP_M, reaches[-1] + 1, STEP_M):
            gamma = dist / grid.radius_m
            target = tuple(math.cos(gamma) * u + math.sin(gamma) * v for u, v in zip(up, bearing))
            elev = dem.height(math.degrees(math.asin(max(-1.0, min(1.0, target[2])))), math.degrees(math.atan2(target[1], target[0])))
            if elev is None:
                incomplete = True
            else:
                r = grid.radius_m + elev
                apparent = math.degrees(math.atan2(r * dot(target, up) - height0, r * dot(target, bearing)))
                maximum = max(maximum, apparent)
            if dist + STEP_M > pending[0]:  # last step inside this reach
                reach = pending.pop(0)
                horizons[reach].append(round(maximum, 6))
                partial[reach] += int(incomplete)
                if not pending:
                    break
    return horizons, partial


def recount(series: dict, horizon: list[float]) -> dict:
    hz = [{"elevation_deg": e} for e in horizon]
    n = series["n"]
    sun, earth, disc = [], [], 0.0
    for i in range(n):
        sm = series["sun_el"][i] / 100 - horizon_at(hz, series["sun_az"][i] / 100)
        sun.append(sm >= 0)
        earth.append(series["earth_el"][i] / 100 - horizon_at(hz, series["earth_az"][i] / 100) >= 0)
        disc += disc_fraction(sm, SUN_RADIUS_DEG)
    return {"sun_center_visible_pct": round(100 * sum(sun) / n, 2), "mean_solar_disc_visible_pct": round(100 * disc / n, 2),
            "earth_center_visible_pct": round(100 * sum(earth) / n, 2),
            "longest_darkness_h": float(max(runs(sun, False), default=0)), "longest_earth_blackout_h": float(max(runs(earth, False), default=0))}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--img", type=pathlib.Path, required=True)
    ap.add_argument("--label", type=pathlib.Path, required=True)
    ap.add_argument("--reaches-km", type=int, nargs="+", default=[100, 150, 200, 250, 300])
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "science/results/horizon_reach.json")
    a = ap.parse_args()
    if digest(a.img) != KNOWN_REVIEWED_SHA256:
        raise SystemExit("LDEM_80S_80M.IMG does not match the reviewed SHA-256")
    reaches = sorted(k * 1000 for k in a.reaches_km)
    pgda = {r["site"]: r for r in json.loads((ROOT / "science/results/validation_pgda.json").read_text())["results"]}
    out = {"schema": "braspace.horizon-reach-study.v1", "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
           "terrain_sha256": KNOWN_REVIEWED_SHA256, "ray_step_m": STEP_M, "azimuth_step_deg": 1, "reaches_m": reaches,
           "note": "Sun/Earth angles are the committed hourly series; only the horizon changes between reaches. "
                   "The DEM ends at 80 S: 'partial_azimuths' counts rays that left it before the reach.", "sites": []}
    with DEM(a.img, Grid.from_label(a.label.read_text(errors="replace"))) as dem:
        for sid in SITES:
            meta = json.loads((ROOT / f"web/data/sites/{sid}.json").read_text())
            blob = (ROOT / f"web/data/sites/{sid}.bin").read_bytes()
            n = meta["series"]["count"]
            series = {"n": n, "sun_az": array.array("H", blob[0:2 * n]), "sun_el": array.array("h", blob[2 * n:4 * n]),
                      "earth_az": array.array("H", blob[4 * n:6 * n]), "earth_el": array.array("h", blob[6 * n:8 * n])}
            if sys.byteorder != "little":
                for arr in series.values():
                    if isinstance(arr, array.array):
                        arr.byteswap()
            site = meta["site"]
            horizons, partial = march(dem, site["latitude_deg"], site["longitude_deg"], site["observer_height_m"], reaches)
            committed = [h["el"] for h in meta["terrain_horizon"]]
            base = horizons[reaches[0]]
            entry = {"site": sid, "latitude_deg": site["latitude_deg"], "longitude_deg": site["longitude_deg"],
                     "control_max_abs_diff_deg_vs_committed_100km_horizon": round(max(abs(x - y) for x, y in zip(base, committed)), 6),
                     "pgda_avg_solar_disc_pct": pgda[sid]["pgda_avg_solar_disc_pct"], "reaches": []}
            for r in reaches:
                rise = [h - b for h, b in zip(horizons[r], base)]
                raised = [az for az, d in enumerate(rise) if d > 0.005]
                m = recount(series, horizons[r])
                entry["reaches"].append({"reach_m": r, **m, "diff_solar_disc_vs_pgda_pp": round(m["mean_solar_disc_visible_pct"] - pgda[sid]["pgda_avg_solar_disc_pct"], 2),
                                         "azimuths_raised_vs_100km": len(raised), "max_rise_deg": round(max(rise), 4),
                                         "raised_azimuth_range_deg": [raised[0], raised[-1]] if raised else None, "partial_azimuths": partial[r]})
            out["sites"].append(entry)
            print(sid, "control", entry["control_max_abs_diff_deg_vs_committed_100km_horizon"],
                  [(x["reach_m"] // 1000, x["sun_center_visible_pct"], x["mean_solar_disc_visible_pct"], x["diff_solar_disc_vs_pgda_pp"], x["azimuths_raised_vs_100km"], x["partial_azimuths"]) for x in entry["reaches"]], flush=True)
    a.out.write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
