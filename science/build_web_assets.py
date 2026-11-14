"""Build small, versioned web assets for the MoonProof Polar Lab from real NASA data.

Inputs (outside git):
  --lola-img/--lola-lbl   LRO/LOLA LDEM_80S_80M (PDS), SHA-256 pinned in data/manifest.json
  --pgda-dir              PGDA AVGVISIB_75S_120M_201608{,_EARTH}.IMG/.LBL (Mazarico et al. 2011)
  --results-dir           output of three_site_pipeline.py (per-site JSON + summary.json)

Outputs (web/data/, a few MB total; the browser never downloads a full dataset):
  region/south_pole_400m.{json,bin}   LOLA heights, 5x5 block mean (400 m), stereographic grid
  region/pgda_sun_400m.bin, region/pgda_earth_400m.bin   PGDA average visibility (uint8 %, 255 = no data)
  sites/<id>.{json,bin}               site metadata, horizon, metrics, hourly Sun/Earth az/el (0.01 deg)
  terrain/<id>_local.{json,bin}       site-local ENU tile, +/-8 km, 40 m spacing (native 80 m, bilinear)
  sites.json                          index of sites and labelled features (+ DEM sanity checks)
Also writes science/results/validation_pgda.json comparing pipeline % with PGDA maps.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import re

import numpy as np

R = 1737400.0
LOLA_SHA = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"

# IAU feature centres used only as map labels. Each is checked below to be a
# topographic depression in LOLA (centre lower than the surrounding ring).
FEATURES = [
    {"id": "shackleton", "name": "Shackleton crater", "lat": -89.67, "lon": 129.78, "radius_km": 10.5},
    {"id": "de-gerlache", "name": "de Gerlache crater", "lat": -88.5, "lon": -87.1, "radius_km": 16.0},
    {"id": "shoemaker", "name": "Shoemaker crater", "lat": -88.1, "lon": 44.9, "radius_km": 25.5},
    {"id": "faustini", "name": "Faustini crater", "lat": -87.3, "lon": 77.0, "radius_km": 19.5},
    {"id": "haworth", "name": "Haworth crater", "lat": -87.45, "lon": -5.0, "radius_km": 25.0},
]


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def label_fields(text: str) -> dict:
    out = {}
    for key in ("LINES", "LINE_SAMPLES", "MAP_SCALE", "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET",
                "SCALING_FACTOR", "OFFSET", "COORDINATE_SYSTEM_NAME", "A_AXIS_RADIUS"):
        m = re.search(r"^\s*" + key + r"\s*=\s*\"?([^\"<\r\n]+)", text, re.MULTILINE)
        if m:
            v = m.group(1).strip()
            try:
                out[key] = float(v)
            except ValueError:
                out[key] = v
    return out


class PolarRaster:
    """PDS3 south polar stereographic int16 raster, PR #86 pixel-centre convention."""

    def __init__(self, img: pathlib.Path, lbl: pathlib.Path, height_relative_to_sphere: bool = False):
        f = label_fields(lbl.read_text(encoding="ascii", errors="replace"))
        self.n = int(f["LINES"])
        assert int(f["LINE_SAMPLES"]) == self.n
        self.scale = float(f["MAP_SCALE"])
        self.off = float(f["SAMPLE_PROJECTION_OFFSET"])
        assert float(f["LINE_PROJECTION_OFFSET"]) == self.off
        self.k = float(f.get("SCALING_FACTOR", 1.0))
        self.b = float(f.get("OFFSET", 0.0))
        if height_relative_to_sphere:
            # LOLA: PLANETARY_RADIUS = DN*0.5 + 1737400; we keep heights relative to the sphere.
            assert self.b == R, f"unexpected LOLA OFFSET {self.b}"
            self.b = 0.0
        self.frame = f.get("COORDINATE_SYSTEM_NAME")
        assert self.frame == "MEAN EARTH/POLAR AXIS OF DE421", self.frame
        self.a = np.memmap(img, dtype="<i2", mode="r", shape=(self.n, self.n))

    def colrow(self, x, y):
        return self.off + x / self.scale, self.off - y / self.scale

    def bilinear(self, x, y):
        c, r = self.colrow(np.asarray(x, float), np.asarray(y, float))
        c0 = np.clip(np.floor(c).astype(int), 0, self.n - 2)
        r0 = np.clip(np.floor(r).astype(int), 0, self.n - 2)
        tc, tr = c - c0, r - r0
        a = self.a
        v = (a[r0, c0] * (1 - tc) * (1 - tr) + a[r0, c0 + 1] * tc * (1 - tr)
             + a[r0 + 1, c0] * (1 - tc) * tr + a[r0 + 1, c0 + 1] * tc * tr)
        return v * self.k + self.b


def stereo(lat, lon):
    rho = 2 * R * np.tan(np.radians(np.asarray(lat) + 90) / 2)
    return rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))


def write_tile(base: pathlib.Path, header: dict, arr: np.ndarray):
    base.parent.mkdir(parents=True, exist_ok=True)
    raw = arr.astype("<i2").tobytes()
    header = {**header, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
    base.with_suffix(".bin").write_bytes(raw)
    base.with_suffix(".json").write_text(json.dumps(header, indent=1) + "\n", encoding="utf-8")
    return header


def build_region(lola: PolarRaster, pgda_sun: PolarRaster, pgda_earth: PolarRaster, out: pathlib.Path, half_km=170):
    block = 5  # 5 x 80 m = 400 m
    half_px = int(half_km * 1000 / lola.scale)  # 2125 pixels
    c_lo = int(math.ceil(lola.off - half_px))  # first column/row of the window
    nb = (2 * half_px) // block
    sub = np.asarray(lola.a[c_lo:c_lo + nb * block, c_lo:c_lo + nb * block], dtype=np.float64) * lola.k + lola.b
    h = sub.reshape(nb, block, nb, block).mean(axis=(1, 3))  # row 0 = max y (image top)
    h = h[::-1]  # row 0 = min y
    spacing = block * lola.scale
    # block centre of column block k: pixel c_lo + 2 + 5k  ->  x = (pixel - off) * scale
    x0 = (c_lo + (block - 1) / 2 - lola.off) * lola.scale
    # last row block (image bottom) has the minimum y
    y0 = (lola.off - (c_lo + (nb - 1) * block + (block - 1) / 2)) * lola.scale
    q = np.round(h / 0.5).astype(np.int32)
    assert q.min() > -32768 and q.max() < 32767
    hdr = write_tile(out / "region" / "south_pole_400m", {
        "schema": "braspace.terrain-grid.v1", "nx": nb, "ny": nb, "spacing_m": spacing,
        "origin_x_m": x0, "origin_y_m": y0, "scale_m": 0.5, "offset_m": 0.0, "nodata": -32768,
        "coordinates": "south polar stereographic x/y (m), true scale at pole, R=1737400 m; row 0 = min y",
        "height_reference": "metres above the 1,737,400 m reference sphere",
        "method": "5x5 block mean of LDEM_80S_80M pixels (native 80 m)", "native_resolution_m": 80,
        "source": "NASA LRO/LOLA LDEM_80S_80M.IMG V2.0 (PDS LRO-L-LOLA-4-GDR-V1.0)", "source_sha256": LOLA_SHA,
        "frame": "MEAN EARTH/POLAR AXIS OF DE421"}, q)
    xs = x0 + spacing * np.arange(nb)
    ys = y0 + spacing * np.arange(nb)
    X, Y = np.meshgrid(xs, ys)
    layers = {}
    for name, ras in (("sun", pgda_sun), ("earth", pgda_earth)):
        v = ras.bilinear(X, Y)
        pct = np.clip(np.round(v * 100), 0, 100).astype(np.uint8)
        (out / "region" / f"pgda_{name}_400m.bin").write_bytes(pct.tobytes())
        layers[name] = hashlib.sha256(pct.tobytes()).hexdigest()
    return hdr, layers


def enu_tile(lola: PolarRaster, lat, lon, half_m=8000, spacing=40):
    la, lo = math.radians(lat), math.radians(lon)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    north = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    x0, y0 = stereo(lat, lon)
    h0 = float(lola.bilinear(x0, y0))
    n = int(2 * half_m / spacing) + 1
    e = -half_m + spacing * np.arange(n)
    E, N = np.meshgrid(e, e)  # row 0 = southmost (min north)
    rho = np.hypot(E, N)
    gamma = np.arctan(rho / (R + h0))
    with np.errstate(invalid="ignore", divide="ignore"):
        be = np.where(rho > 0, E / rho, 0.0)
        bn = np.where(rho > 0, N / rho, 0.0)
    d = (np.cos(gamma)[..., None] * up + np.sin(gamma)[..., None] * (be[..., None] * east + bn[..., None] * north))
    tlat = np.degrees(np.arcsin(d[..., 2]))
    tlon = np.degrees(np.arctan2(d[..., 1], d[..., 0]))
    tx, ty = stereo(tlat, tlon)
    h = lola.bilinear(tx, ty)
    z = (R + h) * np.cos(gamma) - (R + h0)  # height in the site tangent frame (includes curvature)
    return h0, e, z


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--lola-img", type=pathlib.Path, required=True)
    p.add_argument("--lola-lbl", type=pathlib.Path, required=True)
    p.add_argument("--pgda-dir", type=pathlib.Path, required=True)
    p.add_argument("--results-dir", type=pathlib.Path, required=True)
    p.add_argument("--out", type=pathlib.Path, required=True)
    a = p.parse_args()

    if sha256(a.lola_img) != LOLA_SHA:
        raise SystemExit("LOLA checksum mismatch")
    lola = PolarRaster(a.lola_img, a.lola_lbl, height_relative_to_sphere=True)
    pg, pg_meta = {}, {}
    for name, stem in (("sun", "AVGVISIB_75S_120M_201608"), ("earth", "AVGVISIB_75S_120M_201608_EARTH")):
        img, lbl = a.pgda_dir / f"{stem}.IMG", a.pgda_dir / f"{stem}.LBL"
        pg[name] = PolarRaster(img, lbl)
        pg_meta[name] = {"product": stem, "sha256": sha256(img), "label_sha256": sha256(lbl),
                         "url": f"http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/{stem}.IMG",
                         "resolution_m": pg[name].scale, "scaling_factor": pg[name].k}

    region_hdr, layer_sha = build_region(lola, pg["sun"], pg["earth"], a.out)
    region_hdr["layers"] = {
        "pgda_sun": {"file": "pgda_sun_400m.bin", "type": "uint8 percent", "sha256": layer_sha["sun"],
                     "meaning": "average fraction of the solar disc visible (PGDA, Mazarico et al. 2011); 0 = permanent shadow",
                     **pg_meta["sun"]},
        "pgda_earth": {"file": "pgda_earth_400m.bin", "type": "uint8 percent", "sha256": layer_sha["earth"],
                       "meaning": "average Earth visibility; Earth counted visible if any part of its disc is unobscured (PGDA)",
                       **pg_meta["earth"]},
    }
    (a.out / "region" / "south_pole_400m.json").write_text(json.dumps(region_hdr, indent=1) + "\n", encoding="utf-8")

    summary = json.loads((a.results_dir / "summary.json").read_text(encoding="utf-8"))
    sites_index, validation = [], []
    for s in summary["sites"]:
        rec = json.loads((a.results_dir / f"{s['id']}.json").read_text(encoding="utf-8"))
        ser = rec["series"]
        n = len(ser)
        arr = np.zeros((4, n), dtype=np.int32)
        for i, smp in enumerate(ser):
            arr[0, i] = round(smp["sun_az"] * 100) % 36000
            arr[1, i] = round(smp["sun_el"] * 100)
            arr[2, i] = round(smp["earth_az"] * 100) % 36000
            arr[3, i] = round(smp["earth_el"] * 100)
        raw = (arr[0].astype("<u2").tobytes() + arr[1].astype("<i2").tobytes()
               + arr[2].astype("<u2").tobytes() + arr[3].astype("<i2").tobytes())
        sd = a.out / "sites"
        sd.mkdir(parents=True, exist_ok=True)
        (sd / f"{s['id']}.bin").write_bytes(raw)
        meta = {
            "schema": "braspace.site-series.web.v1", "site": rec["site"], "metrics": rec["metrics"],
            "science_status": rec["science_status"],
            "series": {"start_utc": summary["window"]["start_utc"], "step_seconds": 3600, "count": n,
                       "layout": "uint16 sun_az*100 | int16 sun_el*100 | uint16 earth_az*100 | int16 earth_el*100, little-endian",
                       "quantisation_deg": 0.01, "sha256": hashlib.sha256(raw).hexdigest()},
            "terrain_horizon": rec["terrain_horizon"], "horizon_coverage": rec["horizon_coverage"],
            "provenance": rec["provenance"],
        }
        (sd / f"{s['id']}.json").write_text(json.dumps(meta) + "\n", encoding="utf-8")

        h0, e, z = enu_tile(lola, s["latitude_deg"], s["longitude_deg"])
        q = np.round(z / 0.25).astype(np.int32)
        assert q.min() > -32768 and q.max() < 32767, (s["id"], z.min(), z.max())
        write_tile(a.out / "terrain" / f"{s['id']}_local", {
            "schema": "braspace.terrain-grid.v1", "nx": len(e), "ny": len(e), "spacing_m": float(e[1] - e[0]),
            "origin_x_m": float(e[0]), "origin_y_m": float(e[0]), "scale_m": 0.25, "offset_m": 0.0, "nodata": -32768,
            "coordinates": "site-local East-North-Up tangent plane (m); origin on the DEM surface at the site",
            "height_reference": "metres above the site tangent plane (lunar curvature included)",
            "site_height_m": round(h0, 2), "native_resolution_m": 80,
            "method": "bilinear interpolation of LDEM_80S_80M at 40 m spacing; features smaller than ~160 m are not represented",
            "source": "NASA LRO/LOLA LDEM_80S_80M.IMG V2.0", "source_sha256": LOLA_SHA,
            "frame": "MEAN EARTH/POLAR AXIS OF DE421"}, q)

        x, y = stereo(s["latitude_deg"], s["longitude_deg"])
        pg_sun = float(pg["sun"].bilinear(x, y)) * 100
        pg_earth = float(pg["earth"].bilinear(x, y)) * 100
        validation.append({"site": s["id"], "pipeline_mean_solar_disc_pct": rec["metrics"]["mean_solar_disc_visible_pct"],
                           "pgda_avg_solar_disc_pct": round(pg_sun, 2),
                           "diff_sun_pp": round(rec["metrics"]["mean_solar_disc_visible_pct"] - pg_sun, 2),
                           "pipeline_earth_centre_pct": rec["metrics"]["earth_center_visible_pct"],
                           "pgda_avg_earth_any_part_pct": round(pg_earth, 2),
                           "diff_earth_pp": round(rec["metrics"]["earth_center_visible_pct"] - pg_earth, 2)})
        sites_index.append({"id": s["id"], "name": s["name"], "lat": s["latitude_deg"], "lon": s["longitude_deg"],
                            "stereo_x_m": round(float(x), 1), "stereo_y_m": round(float(y), 1),
                            "site_height_m": round(h0, 1), "source": rec["site"]["source"],
                            "source_url": rec["site"].get("source_url", ""),
                            "metrics": rec["metrics"], "pgda_sun_pct": round(pg_sun, 1), "pgda_earth_pct": round(pg_earth, 1),
                            "local_tile": f"terrain/{s['id']}_local", "series": f"sites/{s['id']}"})

    features = []
    for f in FEATURES:
        x, y = stereo(f["lat"], f["lon"])
        centre = float(lola.bilinear(x, y))
        ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
        rr = f["radius_km"] * 1000
        ring = lola.bilinear(x + rr * np.sin(ang), y + rr * np.cos(ang))
        depth = float(np.mean(ring) - centre)
        features.append({**f, "stereo_x_m": round(float(x), 1), "stereo_y_m": round(float(y), 1),
                         "centre_height_m": round(centre, 1), "rim_minus_centre_m": round(depth, 1),
                         "dem_check": "DEPRESSION_CONFIRMED" if depth > 500 else "NOT_CONFIRMED",
                         "source": "IAU/USGS Gazetteer of Planetary Nomenclature (feature centre, label only)",
                         "landing_site": False})

    (a.out / "sites.json").write_text(json.dumps({
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        "note": "Site coordinates are catalogue feature centres, not certified touchdown points.",
        "series_window": summary["window"], "sites": sites_index, "features": features,
        "region": "region/south_pole_400m"}, indent=1) + "\n", encoding="utf-8")
    (a.results_dir / "validation_pgda.json").write_text(json.dumps({
        "reference": "NASA GSFC PGDA AVGVISIB_75S_120M_201608 (+_EARTH), Mazarico et al. 2011, bilinear at site",
        "caveats": ["PGDA averages a much longer period than the 2025-2028 pipeline window.",
                    "PGDA Earth counts any visible part of the disc; the pipeline counts the Earth centre (lower bound).",
                    "PGDA uses its own horizon computation and DEM; this is an independent but not identical reference."],
        "pgda": pg_meta, "results": validation}, indent=2) + "\n", encoding="utf-8")
    for v in validation:
        print(json.dumps(v))
    for f in features:
        print(f["id"], f["dem_check"], f["rim_minus_centre_m"])


if __name__ == "__main__":
    main()
