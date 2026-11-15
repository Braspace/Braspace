#!/usr/bin/env python3
"""Render the BRASPACE south-pole elevation map (87°S-90°S) from NASA LOLA.

Input: LDEM_80S_80M.IMG (LRO LOLA GDR, PDS) documented in data/manifest.json.
The script downloads it from the manifest's image_url (unless --dem is given),
refuses to continue unless its SHA-256 equals the manifest value, crops the
square that contains the 87°S circle, block-averages 2x2 (80 m -> 160 m/px),
colours elevation with a continuous ramp over a low-sun hillshade, and writes

  archive/web-legacy/assets/polar-elevation-87s.webp   (visual product, <= 400 KB)
  archive/web-legacy/assets/polar-elevation-87s.json   (bounds, projection, pixel <-> lat/lon)

This is an ELEVATION map (visual context). The hillshade uses a fixed,
arbitrary synthetic light direction to show relief; it is NOT a model of
real solar illumination and says nothing about light or Earth visibility.

Pixel registration follows the corrected LOLA reading (PR 86 /
DSMAP_POLAR.CAT): zero-indexed pixel-centre coordinate of the pole is
LINE/SAMPLE_PROJECTION_OFFSET = 3799.5, X = (col-3799.5)*80, Y = (3799.5-row)*80,
X = rho*sin(lon), Y = rho*cos(lon), rho = 2R*tan((90+lat)/2).
The .IMG is never committed (data/raw/ is git-ignored).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zlib
import struct

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "manifest.json"
OUT_DIR = ROOT / "archive" / "web-legacy" / "assets"  # legacy web archived in #321/#330
STEM = "polar-elevation-87s"

# Fixed LOLA LDEM_80S_80M geometry (checked against manifest/label at runtime).
N = 7600
DEM_SCALE_M = 80.0
POLE_PIX = 3799.5          # zero-indexed pixel-centre coordinate of the pole
RADIUS_M = 1737400.0
DN_TO_M = 0.5

LAT_EDGE = -87.0
BLOCK = 2                  # 2x2 average -> 160 m/px
HALF_DEM = 1180            # DEM pixels each side of the pole (rho(87S)=1137.4 px, margin so the 87°S circle clears the frame)

# Elevation ramp, low -> high (our own choice; blue/cyan/green/yellow/orange).
RAMP = [
    (0.00, (0x1A, 0x2B, 0x55)),
    (0.14, (0x24, 0x50, 0x7A)),
    (0.28, (0x3D, 0x7F, 0xB5)),
    (0.42, (0x6F, 0xD0, 0xE0)),
    (0.54, (0x3F, 0xA5, 0x8C)),
    (0.66, (0x9C, 0xCB, 0x3C)),
    (0.78, (0xEE, 0xDD, 0x44)),
    (0.90, (0xF0, 0xA0, 0x50)),
    (1.00, (0xF2, 0xA3, 0x9A)),
]


def rho_m(lat: float) -> float:
    return 2 * RADIUS_M * math.tan(math.radians(lat + 90) / 2)


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_manifest() -> dict:
    m = json.loads(MANIFEST.read_text())
    r, p = m["dataset"]["raster"], m["dataset"]["map_projection"]
    assert m["dataset"]["product_file"] == "LDEM_80S_80M.IMG"
    assert (r["lines"], r["line_samples"], r["resolution_m_per_pixel"]) == (N, N, 80)
    assert r["sample_type"] == "LSB_INTEGER" and r["sample_bits"] == 16
    assert r["scaling_factor"] == DN_TO_M and r["offset_m"] == RADIUS_M
    assert p["type"] == "POLAR STEREOGRAPHIC" and p["center_latitude_deg"] == -90.0
    return m


def fetch_dem(manifest: dict, dem: pathlib.Path | None) -> pathlib.Path:
    want = manifest["verification"]["sha256"]
    if dem is None:
        dem = ROOT / "data" / "raw" / "ldem_80s_80m.img"
        if not dem.exists():
            dem.parent.mkdir(parents=True, exist_ok=True)
            url = manifest["source"]["image_url"]
            print("downloading", url, file=sys.stderr)
            tmp = dem.with_suffix(".part")
            with urllib.request.urlopen(url, timeout=120) as r, tmp.open("wb") as f:
                shutil.copyfileobj(r, f, 1 << 20)
            tmp.rename(dem)
    got = sha256(dem)
    if got != want:
        raise SystemExit(f"SHA-256 mismatch for {dem}: {got} != manifest {want}")
    return dem


def read_crop(dem: pathlib.Path) -> np.ndarray:
    raw = np.memmap(dem, dtype="<i2", mode="r", shape=(N, N))
    c0 = int(POLE_PIX + 0.5) - HALF_DEM          # 2660
    sub = np.asarray(raw[c0:c0 + 2 * HALF_DEM, c0:c0 + 2 * HALF_DEM], dtype=np.float64)
    if (sub == -32768).any():
        raise SystemExit("fill value inside crop; refusing to render")
    h = sub * DN_TO_M
    k = BLOCK
    h = h.reshape(h.shape[0] // k, k, h.shape[1] // k, k).mean(axis=(1, 3))
    return h, c0


def hillshade(h: np.ndarray, px_m: float, az_deg=315.0, alt_deg=12.0, zf=2.0) -> np.ndarray:
    dzdy, dzdx = np.gradient(h * zf, px_m)   # rows go "down"
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    az = math.radians(360.0 - az_deg + 90.0)
    alt = math.radians(alt_deg)
    s = math.sin(alt) * np.cos(slope) + math.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(s, 0, 1)


def colour(h: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((h - lo) / (hi - lo), 0, 1)
    xs = [p for p, _ in RAMP]
    rgb = np.stack([np.interp(t, xs, [c[i] for _, c in RAMP]) for i in range(3)], axis=-1)
    return rgb


def write_png(path: pathlib.Path, rgb: np.ndarray) -> None:
    hgt, wid, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[y].tobytes() for y in range(hgt))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", wid, hgt, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def to_webp(rgb: np.ndarray, out: pathlib.Path, quality: int) -> None:
    try:
        from PIL import Image  # optional
        Image.fromarray(rgb).save(out, "WEBP", quality=quality, method=6)
        return
    except ImportError:
        pass
    tool = shutil.which("magick") or shutil.which("cwebp")
    if not tool:
        raise SystemExit("need Pillow, ImageMagick (magick) or cwebp to write WebP")
    with tempfile.TemporaryDirectory() as d:
        png = pathlib.Path(d) / "m.png"
        write_png(png, rgb)
        if tool.endswith("cwebp"):
            cmd = [tool, "-quiet", "-q", str(quality), "-m", "6", str(png), "-o", str(out)]
        else:
            cmd = [tool, str(png), "-strip", "-quality", str(quality), "-define", "webp:method=6", str(out)]
        subprocess.run(cmd, check=True)


def transform_doc(size: int, px_m: float, centre: float) -> dict:
    return {
        "pixel_convention": "",
        "pole_pixel": [centre, centre],
        "meters_per_pixel": px_m,
        "forward": "rho = 2*R*tan(radians(90+lat)/2); x = rho*sin(radians(lon)); y = rho*cos(radians(lon)); "
                   "col = pole_col + x/meters_per_pixel; row = pole_row - y/meters_per_pixel",
        "inverse": "x = (col-pole_col)*meters_per_pixel; y = (pole_row-row)*meters_per_pixel; rho = hypot(x,y); "
                   "lat = degrees(2*atan(rho/(2*R))) - 90; lon = degrees(atan2(x,y))",
        "orientation": "0°E up, 90°E right, 180°E down, 90°W left (viewed from above the south pole)",
        "dem_pixel_of_image_pixel": f"dem_col = {BLOCK}*col + {(int(POLE_PIX + 0.5) - HALF_DEM) + (BLOCK - 1) / 2}, "
                                    f"same for row (zero-indexed LDEM_80S_80M pixel centres)",
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dem", type=pathlib.Path, help="local LDEM_80S_80M.IMG (SHA-256 still checked)")
    ap.add_argument("--out-dir", type=pathlib.Path, default=OUT_DIR)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--generated-utc", help="fixed timestamp for reproducible output")
    a = ap.parse_args()

    manifest = load_manifest()
    dem = fetch_dem(manifest, a.dem)
    h, c0 = read_crop(dem)
    size = h.shape[0]
    px_m = DEM_SCALE_M * BLOCK
    centre = (POLE_PIX - (c0 + (BLOCK - 1) / 2)) / BLOCK     # (size-1)/2
    assert abs(centre - (size - 1) / 2) < 1e-9

    rows, cols = np.mgrid[0:size, 0:size]
    rho = np.hypot((cols - centre) * px_m, (rows - centre) * px_m)
    inside = rho <= rho_m(LAT_EDGE)
    lo = float(h[inside].min()); hi = float(h[inside].max())
    lo_all = float(h.min()); hi_all = float(h.max())

    shade = hillshade(h, px_m)
    rgb = colour(h, lo, hi)
    lit = (0.25 + 0.95 * shade)[..., None]
    img = np.clip(rgb * lit, 0, 255).astype(np.uint8)

    a.out_dir.mkdir(parents=True, exist_ok=True)
    webp = a.out_dir / f"{STEM}.webp"
    q = a.quality
    while True:
        to_webp(img, webp, q)
        if webp.stat().st_size <= 400 * 1024 or q <= 30:
            break
        q -= 8
    if webp.stat().st_size > 400 * 1024:
        raise SystemExit("WebP over 400 KB")

    gen = a.generated_utc or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    meta = {
        "schema": "braspace.polar-elevation-map.v1",
        "product": "BRASPACE derived elevation visualization (not illumination, not visibility)",
        "image": webp.name,
        "image_bytes": webp.stat().st_size,
        "webp_quality": q,
        "width_px": size,
        "height_px": size,
        "meters_per_pixel": px_m,
        "latitude_edge_deg": LAT_EDGE,
        "display_crop": "circle at latitude_edge_deg; the square image corners reach about 85.6°S and are masked in the component",
        "elevation_m": {
            "min": round(lo, 1), "max": round(hi, 1),
            "scope": "pixels inside the 87°S circle after 2x2 averaging; colour ramp is stretched linearly between these",
            "min_whole_square": round(lo_all, 1), "max_whole_square": round(hi_all, 1),
            "datum": "height above the 1737.4 km reference sphere (DN*0.5 m)",
        },
        "colour_ramp_low_to_high": [{"t": p, "hex": "#%02X%02X%02X" % c} for p, c in RAMP],
        "hillshade": "synthetic grazing light (azimuth 315°, altitude 12°, z x2) for relief only; not a solar model",
        "projection": {
            "type": "polar stereographic (spherical), true scale at the pole",
            "center_latitude_deg": -90.0, "center_longitude_deg": 0.0,
            "reference_radius_m": RADIUS_M,
            "frame": manifest["dataset"]["map_projection"]["coordinate_system_name"],
            "latitude": "planetocentric", "longitude": "east-positive, degrees in (-180, 180]",
        },
        "transform": transform_doc(size, px_m, centre),
        "source": {
            "product": manifest["dataset"]["product_file"],
            "pds_dataset_id": manifest["dataset"]["pds_dataset_id"],
            "url": manifest["source"]["image_url"],
            "sha256": manifest["verification"]["sha256"],
            "meters_per_pixel_native": DEM_SCALE_M,
            "resampling": f"{int(DEM_SCALE_M)} m/px resampled to {px_m:g} m/px by {BLOCK}x{BLOCK} mean",
            "dem_crop_zero_indexed": {"first_col": c0, "first_row": c0, "size": 2 * HALF_DEM},
            "pixel_registration": "pole at zero-indexed pixel centre 3799.5 (label PROJECTION_OFFSET), per DSMAP_POLAR.CAT",
        },
        "credit": "Elevation: NASA/GSFC/LOLA (LRO LOLA LDEM_80S_80M). Rendering: BRASPACE.",
        "generator": "science/render_polar_map.py",
        "generated_utc": gen,
        "science_status": "NOT_A_SCIENCE_RESULT (visual context only)",
    }
    meta["transform"]["pixel_convention"] = ("zero-indexed image coordinates, col to the right, row downwards; "
                                             "integer col/row is a pixel centre, pixel edges at +-0.5")
    (a.out_dir / f"{STEM}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"webp": str(webp), "bytes": webp.stat().st_size, "quality": q, "size": size,
                      "min_m": lo, "max_m": hi}))


if __name__ == "__main__":
    main()
