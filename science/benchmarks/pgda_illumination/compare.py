"""BS-017 benchmark: BRASPACE terrain horizon (science/lola_horizon.py, PR #86 physics)
versus PGDA product 69 AVGVISIB_85S_060M_201608 (Mazarico et al. 2011, Icarus 211).

Same quantity: fraction of time steps in which the Sun is above the local terrain
horizon, over ~one lunar nodal cycle (18.6 yr). Nothing is tuned to match.
Usage: python compare.py --data <dir> --kernels <dir> --out result.json [--step-km 6]
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, math, os, pathlib, sys, time
from multiprocessing import Pool
import numpy as np

HERE = pathlib.Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[2]))  # science/
from lola_horizon import Grid, DEM, sample_horizon, site_basis, KNOWN_REVIEWED_SHA256  # noqa: E402

PGDA_IMG = "AVGVISIB_85S_060M_201608.IMG"
PGDA_SHA = "82dadf321dee28f1947c1fed81858d4cf50fe8eb2aa405aae114e8ab21c1efe1"  # sha256 of the 51,166,728-byte IMG, 2026-11-14
SUN_RADIUS_KM = 695700.0

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()

def pgda_grid(lbl: str) -> tuple[int, float, float]:
    import re
    g = lambda k: re.search(r"^\s*" + k + r"\s*=\s*([-\d.]+)", lbl, re.M).group(1)
    return int(g("LINE_SAMPLES")), float(g("MAP_SCALE")), float(g("SAMPLE_PROJECTION_OFFSET"))

def sun_vectors(kdir, start, years, step_h):
    import spiceypy as spice
    for k in ("naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"):
        spice.furnsh(str(pathlib.Path(kdir) / k))
    et0 = spice.str2et(start)
    n = int(years * 365.25 * 24 / step_h)
    ets = et0 + np.arange(n) * step_h * 3600.0
    v = np.array([spice.spkpos("SUN", float(e), "MOON_ME_DE440_ME421", "LT+S", "MOON")[0] for e in ets])
    spice.kclear()
    return v  # km, Moon-centred ME frame

_DEM = None
def _init(img, lbl):
    global _DEM
    _DEM = DEM(pathlib.Path(img), Grid.from_label(pathlib.Path(lbl).read_text()))

def _horizon(args):
    lat, lon, h, rng, step, azs = args
    try:
        r = sample_horizon(_DEM, lat, lon, h, max_distance_m=rng, step_m=step, azimuth_step_deg=azs)
    except ValueError as e:
        return None
    if r["coverage"]["azimuths_with_missing_samples"]:
        return None
    return [a["elevation_deg"] for a in r["terrain_horizon"]], r["site"]["site_elevation_m"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--kernels", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--grid-npz")
    ap.add_argument("--step-km", type=float, default=6.0)
    ap.add_argument("--max-rho-km", type=float, default=140.0)  # inside 85S (rho 151.6 km)
    ap.add_argument("--observer-height-m", type=float, default=2.0)  # lola_horizon default
    ap.add_argument("--max-distance-m", type=int, default=30000)     # lola_horizon default
    ap.add_argument("--ray-step-m", type=int, default=160)           # lola_horizon default
    ap.add_argument("--azimuth-step-deg", type=int, default=2)
    ap.add_argument("--start", default="2000 JAN 01 00:00:00 UTC")
    ap.add_argument("--years", type=float, default=18.6)
    ap.add_argument("--sun-step-h", type=float, default=6.0)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 4))
    a = ap.parse_args()
    t0 = time.time(); d = pathlib.Path(a.data)
    ldem_img, ldem_lbl = d / "ldem_80s_80m.img", d / "ldem_80s_80m.lbl"
    if sha(ldem_img) != KNOWN_REVIEWED_SHA256: raise SystemExit("LDEM sha mismatch")
    if sha(d / PGDA_IMG) != PGDA_SHA: raise SystemExit("PGDA IMG sha mismatch")
    plbl = (d / "AVGVISIB_85S_060M_201608.LBL").read_text()
    n, scale, off = pgda_grid(plbl)
    pg = np.fromfile(d / PGDA_IMG, dtype="<i2").reshape(n, n).astype(float) * 0.00004
    grid = Grid.from_label(ldem_lbl.read_text())
    # regular polar-stereographic grid (x east of lon 0 meridian convention of LOLA)
    st = a.step_km * 1000; R = grid.radius_m
    xs = np.arange(-a.max_rho_km * 1000, a.max_rho_km * 1000 + 1, st)
    pts = []
    for y in xs:
        for x in xs:
            rho = math.hypot(x, y)
            if rho > a.max_rho_km * 1000: continue
            lat = math.degrees(2 * math.atan(rho / (2 * R))) - 90
            lon = math.degrees(math.atan2(x, y))
            # PGDA pixel (same LOLA DSMAP_POLAR convention, zero-indexed centre)
            c, r = off + x / scale, off - y / scale
            ci, ri = int(round(c)), int(round(r))
            pv = pg[ri, ci]; pv3 = pg[ri-1:ri+2, ci-1:ci+2]
            pts.append((x, y, lat, lon, pv, float(pv3.max() - pv3.min())))
    print(f"{len(pts)} grid points, step {a.step_km} km", flush=True)
    jobs = [(p[2], p[3], a.observer_height_m, a.max_distance_m, a.ray_step_m, a.azimuth_step_deg) for p in pts]
    with Pool(a.workers, initializer=_init, initargs=(str(ldem_img), str(ldem_lbl))) as pool:
        hz = pool.map(_horizon, jobs, chunksize=4)
    t_h = time.time() - t0; print(f"horizons {t_h:.0f}s", flush=True)
    sv = sun_vectors(a.kernels, a.start, a.years, a.sun_step_h)
    t_s = time.time() - t0 - t_h; print(f"{len(sv)} sun epochs {t_s:.0f}s", flush=True)
    dist = np.linalg.norm(sv, axis=1); semi = np.degrees(np.arcsin(SUN_RADIUS_KM / dist))
    azgrid = np.arange(0, 360, a.azimuth_step_deg)
    rows = []
    for p, h in zip(pts, hz):
        if h is None: continue
        hor, elev_m = h
        up, north, east = (np.array(v) for v in site_basis(p[2], p[3]))
        obs = (R + elev_m + a.observer_height_m) / 1000 * up
        rel = sv - obs
        u, nn, e = rel @ up, rel @ north, rel @ east
        el = np.degrees(np.arctan2(u, np.hypot(nn, e))); az = np.degrees(np.arctan2(e, nn)) % 360
        hh = np.interp(az, np.r_[azgrid, 360], np.r_[hor, hor[0]])
        f_centre = float(np.mean(el > hh))            # our physics: Sun as a point (centre)
        f_limb = float(np.mean(el + semi > hh))        # diagnostic only: any part of disc
        rows.append(dict(x_km=p[0]/1000, y_km=p[1]/1000, lat=round(p[2], 5), lon=round(p[3], 4),
                         pgda=round(p[4], 5), pgda_3x3_range=round(p[5], 4),
                         ours_centre=round(f_centre, 5), ours_any_limb=round(f_limb, 5),
                         max_horizon_deg=round(max(hor), 3)))
    def stats(k):
        dd = np.array([r[k] - r["pgda"] for r in rows])
        return dict(n=len(dd), mean_error=round(float(dd.mean()), 5), mean_abs_error=round(float(np.abs(dd).mean()), 5),
                    p95_abs_error=round(float(np.percentile(np.abs(dd), 95)), 5), rmse=round(float(np.sqrt((dd**2).mean())), 5),
                    max_abs_error=round(float(np.abs(dd).max()), 5),
                    pearson_r=round(float(np.corrcoef([r[k] for r in rows], [r["pgda"] for r in rows])[0, 1]), 4))
    worst = sorted(rows, key=lambda r: -abs(r["ours_centre"] - r["pgda"]))[:10]
    res = dict(schema="braspace.benchmark.pgda-illumination.v1", science_status="UNVERIFIED",
               quantity="time fraction with Sun above local terrain horizon",
               reference=dict(product="PGDA 69 / LOLA EXTRAS AVGVISIB_85S_060M_201608 (IMG, 60 m/px, DEM LDEM_85S_060M)",
                              url="http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608.IMG",
                              sha256=sha(d / PGDA_IMG), label_sha256=sha(d / "AVGVISIB_85S_060M_201608.LBL"),
                              citation="Mazarico, E., et al. (2011) Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030",
                              definition="fraction of hourly steps over 18.6 yr with any part of solar disc visible"),
               ours=dict(dem="LDEM_80S_80M.IMG", dem_sha256=KNOWN_REVIEWED_SHA256, code="science/lola_horizon.py sample_horizon (PR #86)",
                         observer_height_m=a.observer_height_m, max_distance_m=a.max_distance_m, ray_step_m=a.ray_step_m,
                         azimuth_step_deg=a.azimuth_step_deg, sun="SPICE DE440s, MOON_ME, LT+S, Moon-centred direction",
                         period=f"{a.start} + {a.years} yr every {a.sun_step_h} h", epochs=len(sv)),
               grid=dict(step_km=a.step_km, max_rho_km=a.max_rho_km, points_total=len(pts), points_compared=len(rows),
                         sampling="nearest PGDA 60 m pixel at grid point"),
               stats_point_sun_centre=stats("ours_centre"), stats_any_limb_diagnostic=stats("ours_any_limb"),
               worst10=worst, runtime_s=round(time.time() - t0, 1))
    pathlib.Path(a.out).write_text(json.dumps(res, indent=1))
    if a.grid_npz:
        np.savez_compressed(a.grid_npz, **{k: np.array([r[k] for r in rows]) for k in rows[0]})
    print(json.dumps({k: res[k] for k in ("stats_point_sun_centre", "stats_any_limb_diagnostic", "runtime_s")}, indent=1))

if __name__ == "__main__":
    main()
