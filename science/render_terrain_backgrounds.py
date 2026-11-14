#!/usr/bin/env python3
"""Render BRASPACE screen-background terrain products from NASA LOLA LDEM_80S_80M.

Same source and gate as science/render_polar_map.py (PR 92): the .IMG must match
the SHA-256 in data/manifest.json or nothing is written. Products (WebP <= 600 kB
each, with a JSON sidecar):

  terrain-shade-87s     dark grey hillshade with blue-tinted shadows, 87-90 S, 160 m/px
  terrain-shade-84s     same style, 84-90 S, 400 m/px (wide view)
  terrain-altitude-87s  hillshade x altitude tint (blue low -> yellow high), 87-90 S, 160 m/px

The shading light is SYNTHETIC (fixed grazing azimuth/altitude chosen for looks,
low like the real polar Sun but NOT a real illumination state). These images
are visual context only: not illumination, not visibility, not a science result.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import render_polar_map as rpm  # noqa: E402  (shared manifest/SHA gate, hillshade, WebP writer)

ROOT = rpm.ROOT
OUT_DIR = ROOT / "web" / "moonproof" / "assets"
MAX_BYTES = 600 * 1000
LIGHT = {"azimuth_deg": 315.0, "altitude_deg": 7.0, "z_factor": 1.6}
GAMMA = 0.50
SYNTH = "shading light is synthetic, not a real illumination state"

# Altitude tint, low -> high (our own choice, blue -> teal -> yellow).
TINT = [(0.00, (0x0C, 0x20, 0x70)), (0.30, (0x24, 0x4C, 0xB0)), (0.50, (0x78, 0x7A, 0x80)),
        (0.75, (0xA0, 0x98, 0x80)), (1.00, (0xE0, 0xC4, 0x60))]
TINT_RANGE_M = (-5000.0, 5000.0)  # fixed, symmetric: grey at 0 m, matches a -5000/0/+5000 legend
TINT_OPACITY = 0.50

# Shade palette: saturated blue-black shadows -> neutral dark grey -> muted light grey.
SHADE = [(0.00, (0x0A, 0x16, 0x46)), (0.08, (0x1C, 0x34, 0x7E)), (0.18, (0x3A, 0x40, 0x4A)),
         (0.55, (0x6A, 0x6A, 0x6A)), (1.00, (0xA8, 0xA8, 0xA8))]

PRODUCTS = {
    "terrain-shade-87s": {"lat_edge": -87.0, "block": 2, "style": "shade"},
    "terrain-shade-84s": {"lat_edge": -84.0, "block": 5, "style": "shade"},
    "terrain-altitude-87s": {"lat_edge": -87.0, "block": 2, "style": "altitude"},
}


def crop(dem: pathlib.Path, lat_edge: float, block: int):
    half_px = math.ceil(rpm.rho_m(lat_edge) / rpm.DEM_SCALE_M * 1.035)
    half_px += (-half_px) % block  # 2*half divisible by block
    raw = np.memmap(dem, dtype="<i2", mode="r", shape=(rpm.N, rpm.N))
    c0 = int(rpm.POLE_PIX + 0.5) - half_px
    sub = np.asarray(raw[c0:c0 + 2 * half_px, c0:c0 + 2 * half_px], dtype=np.float64)
    if (sub == -32768).any():
        raise SystemExit("fill value inside crop; refusing to render")
    h = (sub * rpm.DN_TO_M).reshape(2 * half_px // block, block, 2 * half_px // block, block).mean(axis=(1, 3))
    return h, c0, half_px


def ramp(t, stops):
    xs = [p for p, _ in stops]
    return np.stack([np.interp(t, xs, [c[i] for _, c in stops]) for i in range(3)], axis=-1)


def render(h, px_m, style, inside):
    s = rpm.hillshade(h, px_m, LIGHT["azimuth_deg"], LIGHT["altitude_deg"], LIGHT["z_factor"])
    # soft tone curve: keep it dark, lift mid-tones a little
    s = np.clip(s, 0, 1) ** GAMMA  # flat ground at sin(7°)≈0.12 -> ~0.40 (mid grey), true shadow stays 0
    n = h.shape[0]
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.hypot(xx - (n - 1) / 2, yy - (n - 1) / 2) / ((n - 1) / 2)
    vignette = np.clip(1.0 - 0.58 * r ** 1.8, 0.28, 1.0)
    if style == "shade":
        rgb = ramp(s, SHADE) * 0.68
        lo, hi = None, None
    else:
        lo, hi = TINT_RANGE_M
        grey = ramp(s, SHADE)
        tint = ramp(np.clip((h - lo) / (hi - lo), 0, 1), TINT) * (0.10 + 0.80 * s)[..., None]
        rgb = ((1 - TINT_OPACITY) * grey + TINT_OPACITY * tint) * 0.80
    rgb = rgb * vignette[..., None]
    return np.clip(rgb, 0, 255).astype(np.uint8), lo, hi


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dem", type=pathlib.Path)
    ap.add_argument("--out-dir", type=pathlib.Path, default=OUT_DIR)
    ap.add_argument("--generated-utc")
    a = ap.parse_args()
    manifest = rpm.load_manifest()
    dem = rpm.fetch_dem(manifest, a.dem)
    a.out_dir.mkdir(parents=True, exist_ok=True)
    gen = a.generated_utc or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    for stem, p in PRODUCTS.items():
        h, c0, half = crop(dem, p["lat_edge"], p["block"])
        n = h.shape[0]; px_m = rpm.DEM_SCALE_M * p["block"]
        centre = (rpm.POLE_PIX - (c0 + (p["block"] - 1) / 2)) / p["block"]
        assert abs(centre - (n - 1) / 2) < 1e-9
        yy, xx = np.mgrid[0:n, 0:n]
        inside = np.hypot(xx - centre, yy - centre) * px_m <= rpm.rho_m(p["lat_edge"])
        img, lo, hi = render(h, px_m, p["style"], inside)
        webp = a.out_dir / f"{stem}.webp"
        q = 82
        while True:
            rpm.to_webp(img, webp, q)
            if webp.stat().st_size <= MAX_BYTES or q <= 30:
                break
            q -= 6
        if webp.stat().st_size > MAX_BYTES:
            raise SystemExit(f"{webp} over 600 kB")
        tr = rpm.transform_doc(n, px_m, centre)
        tr["pixel_convention"] = ("zero-indexed image coordinates, col to the right, row downwards; "
                                  "integer col/row is a pixel centre, pixel edges at +-0.5")
        tr["dem_pixel_of_image_pixel"] = (f"dem_col = {p['block']}*col + {c0 + (p['block'] - 1) / 2}, "
                                          "same for row (zero-indexed LDEM_80S_80M pixel centres)")
        meta = {
            "schema": "braspace.terrain-background.v1",
            "product": "BRASPACE screen-background terrain derived from NASA LOLA (visual context; not illumination, not visibility)",
            "image": webp.name, "image_bytes": webp.stat().st_size, "webp_quality": q,
            "width_px": n, "height_px": n, "meters_per_pixel": px_m,
            "latitude_edge_deg": p["lat_edge"],
            "bounds": {"lat_min_deg": -90.0, "lat_max_deg_inscribed_circle": p["lat_edge"],
                       "square_half_width_m": half * rpm.DEM_SCALE_M},
            "style": p["style"],
            "shading": {**LIGHT, "tone_gamma": GAMMA, "model": "Lambertian hillshade of the DEM", "note": SYNTH,
                        "vignette": "radial darkening baked in (cosmetic)",
                        "palette": "grey with blue-black shadows" if p["style"] == "shade" else "altitude tint x hillshade"},
            "projection": {"type": "polar stereographic (spherical), true scale at the pole",
                           "center_latitude_deg": -90.0, "center_longitude_deg": 0.0,
                           "reference_radius_m": rpm.RADIUS_M,
                           "frame": manifest["dataset"]["map_projection"]["coordinate_system_name"]},
            "transform": tr,
            "source": {"product": manifest["dataset"]["product_file"],
                       "pds_dataset_id": manifest["dataset"]["pds_dataset_id"],
                       "url": manifest["source"]["image_url"],
                       "sha256": manifest["verification"]["sha256"],
                       "sha256_checked": True,
                       "resampling": f"80 m/px -> {px_m:g} m/px by {p['block']}x{p['block']} mean",
                       "dem_crop_zero_indexed": {"first_col": c0, "first_row": c0, "size": 2 * half}},
            "credit": "Elevation: NASA/GSFC/LOLA (LRO LOLA LDEM_80S_80M). Rendering: BRASPACE.",
            "generator": "science/render_terrain_backgrounds.py",
            "generated_utc": gen,
            "data_status": "PRELIMINARY",
            "science_status": "NOT_A_SCIENCE_RESULT (visual context only)",
            "ai_generated": False,
        }
        if lo is not None:
            meta["elevation_tint"] = {"min_m": round(lo, 1), "max_m": round(hi, 1),
                                      "scope": "fixed symmetric range, linear; grey at 0 m", "opacity_over_hillshade": TINT_OPACITY,
                                      "data_min_m": round(float(h[inside].min()), 1), "data_max_m": round(float(h[inside].max()), 1),
                                      "ramp_low_to_high": [{"t": t, "hex": "#%02X%02X%02X" % c} for t, c in TINT]}
        (a.out_dir / f"{stem}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        print(stem, n, px_m, webp.stat().st_size, q)


if __name__ == "__main__":
    main()
