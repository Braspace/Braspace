#!/usr/bin/env python3
"""Reference values for api/naif tests, computed with spiceypy (CSPICE).

Usage:  python3 -I gen_fixtures.py KERNEL_DIR OUT.json            (small committed fixture)
        python3 -I gen_fixtures.py KERNEL_DIR OUT.json --diff N   (large differential reference, NOT committed)

Needs spiceypy==8.4.0 (CSPICE N0067). Kernels are NOT in the repository: download them from
https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ (see data/SPICE_SOURCES.md) and check the SHA-256.

The exact CSPICE calls (mirrored one to one by the Go API in api/naif):
  spice.str2et(string)                                       -> Kernels.Str2ET
  spice.namfrm(name)                                         -> Kernels.Namfrm
  spice.spkpos(target, et, ref, abcorr, obs)                 -> Kernels.Spkpos   (position, light time)
  spice.spkezr(target, et, ref, "NONE", obs)                 -> Kernels.Spkezr
  spice.spkcpo(target, et, outref, "OBSERVER", abcorr,
               obspos, obsctr, obsref)                       -> Kernels.Spkcpo   (state[0:3], light time)
  spice.pxform(from, to, et)                                 -> Kernels.Pxform
  spice.reclat(v)                                            -> naif.Reclat   (radius, lon, lat)
  spice.m2q(matrix)                                          -> naif.M2Q      (w, x, y, z)
"""
import hashlib
import json
import math
import pathlib
import random
import sys

import spiceypy as spice

NAMES = ("naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "pck00010.tpc")
FRAME = "MOON_ME_DE440_ME421"
RADIUS_KM = 1737.4
SITES = [  # id, lat, lon, site elevation m (observer 2 m above ground)
    ("mons-mouton-im2", -84.78, 29.13, 5312.259),
    ("malapert-massif", -85.9948, -0.23578, 5000.0),
    ("nobile-rim-1", -85.4381, 37.36667, 1500.0),
    ("connecting-ridge", -89.4632, -137.49, 1900.0),
    ("peak-near-shackleton", -88.811, 123.6901, 3400.0),
]
ABCORRS = ("NONE", "LT", "LT+S")
TIME_STRINGS = [  # formats the pipeline uses plus edges (leap second 2016-12-31/2017-01-01, J2000)
    "2000 JAN 01 12:00:00 UTC", "2016 Dec 31 23:59:59 UTC", "2017 Jan 01 00:00:00 UTC",
    "2025 Jan 01 00:00:00 UTC", "2026 Nov 15 00:00:00 UTC", "2026 Nov 15 17:41:07.25 UTC",
    "2027-01-01T00:00:00", "2028-12-31T23:00:00Z", "2020 Feb 29 06:30:00 UTC",
    "2000 JAN 01 12:00:00 TDB", "2012 Jun 30 23:59:59 UTC", "2012 Jul 01 00:00:00 UTC",
]


def basis(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    up = (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    north = (-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la))
    east = (-math.sin(lo), math.cos(lo), 0.0)
    return up, north, east


def look(body, lat, lon, r_km):
    """Unrounded azimuth (clockwise from north) / elevation in degrees, as science/spice_lunar_angles.look_angles."""
    up, north, east = basis(lat, lon)
    diff = [body[i] - r_km * up[i] for i in range(3)]
    d = lambda a, b: sum(x * y for x, y in zip(a, b))
    u, n, e = d(diff, up), d(diff, north), d(diff, east)
    return (math.degrees(math.atan2(e, n)) % 360, math.degrees(math.atan2(u, math.hypot(n, e))))


def obs_for(site):
    _, lat, lon, elev = site
    r = (RADIUS_KM * 1000 + elev + 2.0) / 1000
    return r, [r * c for c in basis(lat, lon)[0]]


def main():
    kdir = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2])
    diff_n = int(sys.argv[sys.argv.index("--diff") + 1]) if "--diff" in sys.argv else 0
    sha = {n: hashlib.sha256((kdir / n).read_bytes()).hexdigest() for n in NAMES}
    for n in NAMES:
        spice.furnsh(str(kdir / n))
    doc = {"generator": "api/naif/testdata/gen/gen_fixtures.py", "spiceypy": "8.4.0",
           "toolkit": spice.tkvrsn("TOOLKIT"), "kernel_sha256": sha}
    if not diff_n:
        ets = [spice.str2et(s) for s in TIME_STRINGS]
        doc["str2et"] = [{"s": s, "et": e} for s, e in zip(TIME_STRINGS, ets)]
        doc["namfrm"] = [{"name": n, "id": spice.namfrm(n)} for n in
                         ("J2000", "MOON_PA_DE440", FRAME, "IAU_EARTH", "IAU_MOON", "MOON_ME", "NOPE")]
        pts = [spice.str2et(s) for s in TIME_STRINGS[3:9]]
        doc["spkpos"], doc["spkezr"], doc["spkcpo"], doc["pxform"], doc["reclat"], doc["m2q"] = [], [], [], [], [], []
        for et in pts:
            for tgt, obs in (("SUN", "MOON"), ("EARTH", "MOON"), ("MOON", "EARTH"), ("SUN", "EARTH")):
                for ab in ABCORRS:
                    for ref in ("J2000", FRAME):
                        p, lt = spice.spkpos(tgt, et, ref, ab, obs)
                        doc["spkpos"].append({"target": tgt, "obs": obs, "ref": ref, "abcorr": ab, "et": et,
                                              "pos": list(p), "lt": lt})
            for tgt, obs in (("SUN", "MOON"), ("EARTH", "MOON"), ("MOON", "EARTH")):
                for ref in ("J2000", FRAME):
                    s, _ = spice.spkezr(tgt, et, ref, "NONE", obs)
                    doc["spkezr"].append({"target": tgt, "obs": obs, "ref": ref, "et": et, "state": list(s)})
            for site in SITES:
                r, obs_km = obs_for(site)
                for tgt in ("SUN", "EARTH"):
                    for ab in ABCORRS:
                        st, lt = spice.spkcpo(tgt, et, FRAME, "OBSERVER", ab, obs_km, "MOON", FRAME)
                        doc["spkcpo"].append({"site": site[0], "target": tgt, "abcorr": ab, "et": et,
                                              "obspos": obs_km, "pos": list(st[:3]), "lt": lt})
            for a, b in (("IAU_EARTH", FRAME), (FRAME, "J2000"), ("MOON_PA_DE440", FRAME), ("J2000", "MOON_PA_DE440"),
                         ("IAU_EARTH", "J2000")):
                m = spice.pxform(a, b, et)
                doc["pxform"].append({"from": a, "to": b, "et": et, "m": [list(r) for r in m]})
                doc["m2q"].append({"m": [list(r) for r in m], "q": list(spice.m2q(m))})
        rnd = random.Random(20261115)
        for _ in range(40):
            v = [rnd.uniform(-1, 1) * 10 ** rnd.randint(0, 8) for _ in range(3)]
            r, lon, lat = spice.reclat(v)
            doc["reclat"].append({"v": v, "r": r, "lon": lon, "lat": lat})
        doc["reclat"].append({"v": [0.0, 0.0, 5.0], "r": 5.0, "lon": 0.0, "lat": math.pi / 2})
        for _ in range(60):  # random rotations for m2q, all four branches of the algorithm
            ax = [rnd.gauss(0, 1) for _ in range(3)]
            n = math.sqrt(sum(x * x for x in ax))
            ang = rnd.uniform(0, 2 * math.pi)
            m = spice.axisar([x / n for x in ax], ang)
            doc["m2q"].append({"m": [list(r) for r in m], "q": list(spice.m2q(m))})
        for k in range(3):
            for ang in (math.pi, 0.0):
                m = spice.axisar([1.0 if i == k else 0.0 for i in range(3)], ang)
                doc["m2q"].append({"m": [list(r) for r in m], "q": list(spice.m2q(m))})
    else:
        rnd = random.Random(20261115)
        t0, t1 = spice.str2et("2025 Jan 01 00:00:00 UTC"), spice.str2et("2029 Jan 01 00:00:00 UTC")
        doc["epochs"] = []
        for _ in range(diff_n):
            et = rnd.uniform(t0, t1)
            row = {"et": et, "geo": {}, "site": {}}
            for tgt in ("SUN", "EARTH"):
                for ab in ABCORRS:
                    p, lt = spice.spkpos(tgt, et, FRAME, ab, "MOON")
                    row["geo"][tgt + "|" + ab] = list(p) + [lt]
            for site in SITES:
                r, obs_km = obs_for(site)
                for tgt in ("SUN", "EARTH"):
                    for ab in ABCORRS:
                        st, lt = spice.spkcpo(tgt, et, FRAME, "OBSERVER", ab, obs_km, "MOON", FRAME)
                        body = [st[j] + obs_km[j] for j in range(3)]
                        az, el = look(body, site[1], site[2], r)
                        row["site"][site[0] + "|" + tgt + "|" + ab] = list(st[:3]) + [lt, az, el]
            m = spice.pxform("IAU_EARTH", FRAME, et)
            row["q"] = list(spice.m2q(m))
            row["m"] = [list(r) for r in m]
            doc["epochs"].append(row)
        doc["sites"] = [{"id": s[0], "lat": s[1], "lon": s[2], "elev_m": s[3]} for s in SITES]
    spice.kclear()
    out.write_text(json.dumps(doc, indent=None, separators=(",", ":")) + "\n")
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
