"""Build the web assets of the Moon HD viewer (web/moon-hd.html) from NASA source files.

Inputs are downloaded by hand (never by this script) and checked by SHA-256 before use:

  data/raw/moonhd/lroc_color_poles_8k.tif   NASA SVS 4720 CGI Moon Kit, LROC WAC colour mosaic
  data/raw/moonhd/ldem_16.tif               NASA SVS 4720 CGI Moon Kit, LOLA elevation, 16 px/deg, float km
  data/raw/moonhd/starmap_2020_4k.exr       NASA SVS 4851 Deep Star Maps 2020 (celestial coordinates)
  data/raw/lola/ldem_80s_80m.img            PDS LRO-L-LOLA-4-GDR-V1.0 LDEM_80S_80M.IMG V2.0
  data/raw/earth/world.topo.bathy.200412.3x5400x2700.jpg   NASA Blue Marble Next Generation, December, topography and bathymetry
  data/raw/naif/pck00010.tpc                NAIF planetary constants (orientation of the Earth, IAU_EARTH)
  data/raw/usgs/MOON_nomenclature_center_pts.zip   IAU/USGS Gazetteer of Planetary Nomenclature, centre points
  data/raw/naif/{naif0012.tls,de440s.bsp,moon_pa_de440_200625.bpc,moon_de440_250416.tf}

Outputs (web/data/moonhd/): colour, normal and height maps of the globe, the star background, the native
80 m LOLA grid around the south pole, hourly sub-solar and sub-Earth points, and manifest.json with the
SHA-256 of every input and output.

Scientific status of the outputs: visual products. The terrain grid holds unmodified LOLA DNs; the
sub-solar/sub-Earth points are NAIF SPICE geometry (centre of Sun/Earth, LT+S, seen from the Moon centre).
Nothing here is independently validated, and nothing here is a NASA product or endorsed by NASA.

Needs numpy, Pillow, tifffile, imagecodecs, OpenEXR and spiceypy (not the standard library alone):
  python3 science/build_moon_hd_assets.py --raw data/raw --out web/data/moonhd
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib

SVS_KIT = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
PDS_POLAR = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"

# name -> (relative path under --raw, source URL, pinned SHA-256)
INPUTS = {
    "lroc_color": ("moonhd/lroc_color_poles_8k.tif", f"{SVS_KIT}/lroc_color_poles_8k.tif",
                   "4af8b0cd4d50c30851359d98e7e72040240dd8d03256b58b345b5b76e9edb4ef"),
    "ldem_16": ("moonhd/ldem_16.tif", f"{SVS_KIT}/ldem_16.tif",
                "1ea42bf44f7e9d694f79c3afa7145f97fbf06cc67372067d9fe73dce43bad796"),
    "starmap": ("moonhd/starmap_2020_4k.exr", "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr",
                "69b841cd048c2ef35543eb1c5819b322530e78aa4b0cab97ec1de3ef56a4ddcd"),
    "nomenclature": ("usgs/MOON_nomenclature_center_pts.zip",
                     "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip",
                     "bcb1a37a195babb159ee1f720a6c64d03842de87d10a7ba7d754f8873477606b"),
    "blue_marble": ("earth/world.topo.bathy.200412.3x5400x2700.jpg",
                    "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg",
                    "a9f0088972dee0254610af851c4d6838ca3f2cf79176987e0a5713e2c15ec042"),
    "pck00010.tpc": ("naif/pck00010.tpc", f"{NAIF}/pck/pck00010.tpc",
                     "59468328349aa730d18bf1f8d7e86efe6e40b75dfb921908f99321b3a7a701d2"),
    "ldem_80s_80m": ("lola/ldem_80s_80m.img", f"{PDS_POLAR}/ldem_80s_80m.img",
                     "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"),
    "naif0012.tls": ("naif/naif0012.tls", f"{NAIF}/lsk/naif0012.tls",
                     "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b"),
    "de440s.bsp": ("naif/de440s.bsp", f"{NAIF}/spk/planets/de440s.bsp",
                   "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2"),
    "moon_pa_de440_200625.bpc": ("naif/moon_pa_de440_200625.bpc", f"{NAIF}/pck/moon_pa_de440_200625.bpc",
                                 "60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f"),
    "moon_de440_250416.tf": ("naif/moon_de440_250416.tf", f"{NAIF}/fk/satellites/moon_de440_250416.tf",
                             "a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768"),
}

R_REF_M = 1737400.0
FRAME = "MOON_ME_DE440_ME421"
# LDEM_80S_80M.LBL: 7600 x 7600, LSB_INTEGER 16 bit, SCALING_FACTOR 0.5 m, MAP_SCALE 80 m,
# LINE/SAMPLE_PROJECTION_OFFSET 3799.5 (zero-indexed pixel centres, same convention as web/lab/coords.js).
POLAR_N, POLAR_SCALE_M, POLAR_DN_M, POLAR_OFFSET = 7600, 80.0, 0.5, 3799.5
POLAR_CROP = 2048  # centre crop, native pixels: 163.84 km across, reaches about 87.3 S on the axes
WIDE_BLOCK = 4
FEATURE_MAX_LAT, FEATURE_MIN_CRATER_KM = -80.5, 20.0
EPH_START, EPH_STEP_S, EPH_COUNT = "2025-01-01T00:00:00Z", 3600, 35064  # same window as web/data/sites/*.json
NORMAL_EXAGGERATION = 6.0


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def check_inputs(raw: pathlib.Path) -> dict:
    found = {}
    for name, (rel, url, pin) in INPUTS.items():
        path = raw / rel
        if not path.is_file():
            raise SystemExit(f"missing input {path} (download it from {url})")
        digest = sha256(path)
        if digest != pin:
            raise SystemExit(f"{path}: SHA-256 {digest} differs from the pinned {pin}")
        found[name] = {"path": path, "url": url, "sha256": digest, "bytes": path.stat().st_size}
    return found


def save_jpeg(array, path: pathlib.Path, quality: int) -> None:
    from PIL import Image
    Image.fromarray(array).save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def build_color(src: pathlib.Path, out: pathlib.Path) -> dict:
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    img = Image.open(src).convert("RGB")
    if img.size != (8192, 4096):
        raise SystemExit(f"unexpected colour mosaic size {img.size}")
    img.save(out / "color_8k.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    img.resize((4096, 2048), Image.LANCZOS).save(out / "color_4k.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    return {"projection": "equirectangular, centre 0 E, north up (SVS 4720)", "sizes": {"color_8k.jpg": [8192, 4096], "color_4k.jpg": [4096, 2048]}}


def build_relief(src: pathlib.Path, out: pathlib.Path) -> dict:
    """Tangent-space normal map (x east, y north, z up) and an 8-bit height map from the 16 px/deg LOLA DEM."""
    import numpy as np
    import tifffile
    from PIL import Image
    h_km = tifffile.imread(src).astype(np.float64)
    if h_km.shape != (2880, 5760):
        raise SystemExit(f"unexpected ldem_16 shape {h_km.shape}")
    h_m = h_km * 1000.0
    ny, nx = h_m.shape
    dlat = math.pi / ny
    lat = (math.pi / 2 - (np.arange(ny) + 0.5) * dlat)[:, None]
    # Row 0 is north. East is +column; the map wraps in longitude.
    dh_east = (np.roll(h_m, -1, axis=1) - np.roll(h_m, 1, axis=1)) / (2 * dlat * R_REF_M * np.maximum(np.cos(lat), 1e-3))
    dh_north = np.empty_like(h_m)
    dh_north[1:-1] = (h_m[:-2] - h_m[2:]) / (2 * dlat * R_REF_M)
    dh_north[0], dh_north[-1] = 0.0, 0.0
    n = np.stack([-dh_east * NORMAL_EXAGGERATION, -dh_north * NORMAL_EXAGGERATION, np.ones_like(h_m)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgb = np.clip(np.rint((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
    Image.fromarray(rgb).resize((4096, 2048), Image.LANCZOS).save(out / "normal_4k.jpg", "JPEG", quality=92, optimize=True)
    lo, hi = float(h_m.min()), float(h_m.max())
    grey = np.clip(np.rint((h_m - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)
    Image.fromarray(grey).resize((4096, 2048), Image.LANCZOS).save(out / "height_4k.jpg", "JPEG", quality=95, optimize=True)
    return {"height_min_m": round(lo, 1), "height_max_m": round(hi, 1), "height_reference": "metres above the 1,737,400 m sphere",
            "height_map": "height_4k.jpg, 8 bit: one grey level is %.0f m" % ((hi - lo) / 255),
            "normal_map": "tangent space: R east, G north, B up", "normal_exaggeration": NORMAL_EXAGGERATION,
            "source_resolution": "16 pixels per degree (about 1.9 km at the equator)"}


def build_stars(src: pathlib.Path, out: pathlib.Path) -> dict:
    import numpy as np
    import OpenEXR
    with OpenEXR.File(str(src)) as f:
        channels = f.channels()
        if "RGB" in channels:
            rgb = np.asarray(channels["RGB"].pixels, dtype=np.float32)
        else:
            rgb = np.stack([np.asarray(channels[c].pixels, dtype=np.float32) for c in "RGB"], axis=-1)
    if rgb.shape[:2] != (2048, 4096):
        raise SystemExit(f"unexpected star map shape {rgb.shape}")
    # Display transform only: gain, then sRGB-like gamma. Star brightness is decorative.
    toned = np.clip(rgb * 1.6, 0, 1) ** (1 / 2.2)
    save_jpeg(np.rint(toned * 255).astype(np.uint8), out / "stars_4k.jpg", 88)
    return {"projection": "equirectangular celestial sphere (ICRF right ascension / declination), SVS 4851",
            "use": "decorative background; its orientation relative to the Moon is not registered"}


def build_polar(src: pathlib.Path, out: pathlib.Path) -> dict:
    import numpy as np
    dn = np.fromfile(src, dtype="<i2")
    if dn.size != POLAR_N * POLAR_N:
        raise SystemExit(f"unexpected LDEM_80S_80M size {dn.size}")
    dn = dn.reshape(POLAR_N, POLAR_N)
    a = (POLAR_N - POLAR_CROP) // 2
    crop = dn[a:a + POLAR_CROP, a:a + POLAR_CROP]
    # PDS row 0 is the maximum y; the team grid schema stores row 0 = minimum y.
    grid = np.ascontiguousarray(crop[::-1]).astype("<i2")
    (out / "south_pole_80m.bin").write_bytes(grid.tobytes())
    origin = (a - POLAR_OFFSET) * POLAR_SCALE_M
    return {"schema": "braspace.terrain-grid.v1", "file": "south_pole_80m.bin", "nx": POLAR_CROP, "ny": POLAR_CROP,
            "spacing_m": POLAR_SCALE_M, "origin_x_m": origin, "origin_y_m": origin, "scale_m": POLAR_DN_M, "offset_m": 0.0,
            "coordinates": "south polar stereographic x/y (m), true scale at pole, R=1737400 m; row 0 = min y; values at pixel centres",
            "height_reference": "metres above the 1,737,400 m reference sphere",
            "method": "centre crop of LDEM_80S_80M at native resolution, no resampling",
            "min_m": float(grid.min()) * POLAR_DN_M, "max_m": float(grid.max()) * POLAR_DN_M,
            "frame": "MEAN EARTH/POLAR AXIS OF DE421"}


def build_earth(src: pathlib.Path, out: pathlib.Path) -> dict:
    from PIL import Image
    img = Image.open(src).convert("RGB")
    if img.size != (5400, 2700):
        raise SystemExit(f"unexpected Blue Marble size {img.size}")
    img.resize((2048, 1024), Image.LANCZOS).save(out / "earth_2k.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    return {"file": "earth_2k.jpg", "projection": "equirectangular, centre 0 E, north up",
            "content": "cloud-free monthly composite (December 2004) with shaded relief; not the weather or the season of the clock time"}


def build_earth_orientation(inputs: dict, out: pathlib.Path) -> dict:
    """Hourly rotation from the Earth body-fixed frame (IAU_EARTH) to the Moon mean-Earth frame, as unit quaternions.

    Layout per sample, little-endian: int16 x, y, z, w, each component times 32767 (SPICE order is w, x, y, z).
    Evaluated at the clock time itself; the 1.3 s light time (0.005 deg of Earth rotation) is ignored.
    """
    import numpy as np
    import spiceypy as sp
    for name in ("naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "pck00010.tpc"):
        sp.furnsh(str(inputs[name]["path"]))
    try:
        et0 = sp.str2et(EPH_START.replace("Z", ""))
        packed = np.empty((EPH_COUNT, 4), dtype="<i2")
        previous = None
        for i in range(EPH_COUNT):
            w, x, y, z = sp.m2q(sp.pxform("IAU_EARTH", FRAME, et0 + i * EPH_STEP_S))
            q = np.array([x, y, z, w])
            if previous is not None and float(q @ previous) < 0:
                q = -q  # same rotation; keeps neighbouring samples on the same side for interpolation
            previous = q
            packed[i] = np.rint(q * 32767)
    finally:
        sp.kclear()
    (out / "earth_orientation.bin").write_bytes(packed.tobytes())
    return {"file": "earth_orientation.bin", "start_utc": EPH_START, "step_seconds": EPH_STEP_S, "count": EPH_COUNT,
            "layout": "int16 x*32767 | y | z | w, little-endian; rotates IAU_EARTH vectors into " + FRAME,
            "earth_frame": "IAU_EARTH (pck00010.tpc)", "light_time": "ignored (about 0.005 deg of Earth rotation)"}


def build_polar_wide(src: pathlib.Path, out: pathlib.Path) -> dict:
    """Whole LDEM_80S_80M (80 S to the pole) as 4 x 4 block means: 320 m spacing, 608 km across."""
    import numpy as np
    dn = np.fromfile(src, dtype="<i2").reshape(POLAR_N, POLAR_N).astype(np.float64)
    n = POLAR_N // WIDE_BLOCK
    mean = dn.reshape(n, WIDE_BLOCK, n, WIDE_BLOCK).mean(axis=(1, 3))
    grid = np.ascontiguousarray(np.rint(mean[::-1])).astype("<i2")
    (out / "south_pole_320m.bin").write_bytes(grid.tobytes())
    spacing = POLAR_SCALE_M * WIDE_BLOCK
    origin = ((WIDE_BLOCK - 1) / 2 - POLAR_OFFSET) * POLAR_SCALE_M
    return {"schema": "braspace.terrain-grid.v1", "file": "south_pole_320m.bin", "nx": n, "ny": n, "spacing_m": spacing,
            "origin_x_m": origin, "origin_y_m": origin, "scale_m": POLAR_DN_M, "offset_m": 0.0,
            "coordinates": "south polar stereographic x/y (m), true scale at pole, R=1737400 m; row 0 = min y; values at block centres",
            "height_reference": "metres above the 1,737,400 m reference sphere",
            "method": f"{WIDE_BLOCK}x{WIDE_BLOCK} block mean of LDEM_80S_80M pixels (native 80 m), rounded to the 0.5 m DN",
            "min_m": float(grid.min()) * POLAR_DN_M, "max_m": float(grid.max()) * POLAR_DN_M,
            "frame": "MEAN EARTH/POLAR AXIS OF DE421"}


def build_features(src: pathlib.Path, out: pathlib.Path) -> dict:
    """Named features from the IAU/USGS gazetteer: south polar craters and mountains, plus the maria for the globe."""
    import io
    import struct
    import zipfile
    with zipfile.ZipFile(src) as z:
        dbf = z.read("MOON_nomenclature_center_pts.dbf")
    count, header_len, record_len = struct.unpack("<IHH", dbf[4:12])
    fields, o = [], 32
    while dbf[o] != 0x0D:
        fields.append((dbf[o:o + 11].split(b"\0")[0].decode(), dbf[o + 16]))
        o += 32
    features = []
    for i in range(count):
        rec, p, row = dbf[header_len + i * record_len: header_len + (i + 1) * record_len], 1, {}
        for name, length in fields:
            row[name] = rec[p:p + length].decode("utf-8", "replace").strip()
            p += length
        if row["approval"] != "Adopted by IAU":
            continue
        lat, lon, diameter, kind = float(row["center_lat"]), float(row["center_lon"]), float(row["diameter"]), row["type"].split(",")[0]
        polar = lat <= FEATURE_MAX_LAT and ((kind == "Crater" and diameter >= FEATURE_MIN_CRATER_KM) or kind == "Mons")
        if not (polar or kind in ("Mare", "Oceanus")):
            continue
        features.append({"name": row["name"], "type": kind, "lat": round(lat, 4), "lon": round((lon + 180) % 360 - 180, 4),
                         "diameter_km": round(diameter, 2), "url": row["link"].replace("http://", "https://")})
    features.sort(key=lambda f: (f["type"], f["name"]))
    doc = {"source": "Gazetteer of Planetary Nomenclature, IAU/USGS, MOON_nomenclature_center_pts (public domain)",
           "filter": f"Adopted by IAU; Crater >= {FEATURE_MIN_CRATER_KM} km or Mons at latitude <= {FEATURE_MAX_LAT}; every Mare and Oceanus",
           "note": "feature centres, used as labels only", "features": features}
    (out / "features.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    return {"file": "features.json", "count": len(features), "source": doc["source"], "filter": doc["filter"]}


def build_ephemeris(inputs: dict, out: pathlib.Path) -> dict:
    """Hourly sub-solar and sub-Earth points in the Moon mean-Earth frame.

    Layout per sample, little-endian: int16 sun_lat*100 | uint16 sun_lon*100 | int16 earth_lat*100 | uint16 earth_lon*100
    (longitude east-positive, 0..360).
    """
    import numpy as np
    import spiceypy as sp
    for name in ("naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"):
        sp.furnsh(str(inputs[name]["path"]))
    try:
        et0 = sp.str2et(EPH_START.replace("Z", ""))
        rows = np.empty((EPH_COUNT, 4), dtype=np.float64)
        for i in range(EPH_COUNT):
            et = et0 + i * EPH_STEP_S
            for k, body in enumerate(("SUN", "EARTH")):
                pos, _ = sp.spkpos(body, et, FRAME, "LT+S", "MOON")
                _, lon, lat = sp.reclat(pos)
                rows[i, 2 * k] = math.degrees(lat)
                rows[i, 2 * k + 1] = math.degrees(lon) % 360.0
    finally:
        sp.kclear()
    packed = np.empty(EPH_COUNT, dtype=[("sun_lat", "<i2"), ("sun_lon", "<u2"), ("earth_lat", "<i2"), ("earth_lon", "<u2")])
    packed["sun_lat"] = np.rint(rows[:, 0] * 100)
    packed["sun_lon"] = np.rint(rows[:, 1] * 100) % 36000
    packed["earth_lat"] = np.rint(rows[:, 2] * 100)
    packed["earth_lon"] = np.rint(rows[:, 3] * 100) % 36000
    (out / "ephemeris.bin").write_bytes(packed.tobytes())
    return {"file": "ephemeris.bin", "start_utc": EPH_START, "step_seconds": EPH_STEP_S, "count": EPH_COUNT,
            "layout": "int16 sun_lat*100 | uint16 sun_lon*100 | int16 earth_lat*100 | uint16 earth_lon*100, little-endian",
            "quantisation_deg": 0.01, "spice_frame": FRAME, "aberration_correction": "LT+S, observer at the Moon centre (spkpos)",
            "point_targets": "Sun and Earth centres",
            "sun_lat_range_deg": [round(float(rows[:, 0].min()), 3), round(float(rows[:, 0].max()), 3)],
            "earth_lat_range_deg": [round(float(rows[:, 2].min()), 3), round(float(rows[:, 2].max()), 3)],
            "earth_lon_range_deg": [round(float(((rows[:, 3] + 180) % 360 - 180).min()), 3), round(float(((rows[:, 3] + 180) % 360 - 180).max()), 3)]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", type=pathlib.Path, default=pathlib.Path("data/raw"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("web/data/moonhd"))
    args = ap.parse_args()
    inputs = check_inputs(args.raw)
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema": "braspace.moon-hd.v1",
        "science_status": "VISUAL_PRODUCT_NOT_INDEPENDENTLY_VALIDATED",
        "nasa_certified": False,
        "generator": "science/build_moon_hd_assets.py",
        "color": build_color(inputs["lroc_color"]["path"], args.out),
        "relief": build_relief(inputs["ldem_16"]["path"], args.out),
        "stars": build_stars(inputs["starmap"]["path"], args.out),
        "south_pole": build_polar(inputs["ldem_80s_80m"]["path"], args.out),
        "south_pole_wide": build_polar_wide(inputs["ldem_80s_80m"]["path"], args.out),
        "features": build_features(inputs["nomenclature"]["path"], args.out),
        "earth": build_earth(inputs["blue_marble"]["path"], args.out),
        "earth_orientation": build_earth_orientation(inputs, args.out),
        "ephemeris": build_ephemeris(inputs, args.out),
        "sources": {name: {"url": v["url"], "sha256": v["sha256"], "bytes": v["bytes"]} for name, v in inputs.items()},
        "credits": ["NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720; Deep Star Maps 2020, SVS 4851)",
                    "NASA LRO/LOLA Science Team (LDEM_80S_80M, PDS Geosciences Node)", "NASA/JPL NAIF (SPICE kernels, DE440)",
                    "IAU/USGS Gazetteer of Planetary Nomenclature (feature names)",
                    "NASA Earth Observatory, Blue Marble Next Generation (Earth texture)"],
    }
    manifest["files"] = {p.name: {"sha256": sha256(p), "bytes": p.stat().st_size}
                         for p in sorted(args.out.iterdir()) if p.name != "manifest.json"}
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(json.dumps(manifest["files"], indent=1))


if __name__ == "__main__":
    main()
