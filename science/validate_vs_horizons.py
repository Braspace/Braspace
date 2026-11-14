"""Independent check: compare SPICE Sun/Earth azimuth-elevation from
three_site_pipeline.py output against JPL Horizons topocentric AZ-EL
(quantity 4) for the same lunar site and UTC epochs.

Horizons is queried over its public API; nothing is downloaded except text.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import urllib.parse
import urllib.request

API = "https://ssd.jpl.nasa.gov/api/horizons.api"


def horizons_azel(body: str, lat: float, lon: float, alt_km: float, times: list[str]) -> list[tuple[float, float]]:
    tlist = " ".join("'" + t.replace("T", " ").rstrip("Z") + "'" for t in times)
    params = {
        "format": "json", "COMMAND": f"'{body}'", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360:.6f},{lat:.6f},{alt_km:.4f}'",
        "TLIST": tlist, "TLIST_TYPE": "'CAL'", "TIME_TYPE": "'UT'",
        "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:
        text = json.load(r)["result"]
    if "$$SOE" not in text:
        raise RuntimeError("Horizons returned no ephemeris:\n" + text[-1500:])
    block = text.split("$$SOE")[1].split("$$EOE")[0]
    out = []
    for line in block.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        nums = [c for c in cols[1:] if re.fullmatch(r"-?\d+(\.\d+)?", c)]
        out.append((float(nums[0]), float(nums[1])))
    return out


def angdiff(a: float, b: float) -> float:
    return (a - b + 180) % 360 - 180


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("site_json", type=pathlib.Path, nargs="+")
    p.add_argument("--samples", type=int, default=12)
    p.add_argument("--output", type=pathlib.Path)
    a = p.parse_args()
    report = []
    for path in a.site_json:
        rec = json.loads(path.read_text(encoding="utf-8"))
        site = rec["site"]
        series = rec["series"]
        idx = [round(i * (len(series) - 1) / (a.samples - 1)) for i in range(a.samples)]
        picks = [series[i] for i in idx]
        alt_km = (site["site_elevation_m"] + site["observer_height_m"]) / 1000
        times = [s["t"] for s in picks]
        res = {"site": site["id"], "epochs": times, "comparisons": []}
        for body, key in (("10", "sun"), ("399", "earth")):
            refs = horizons_azel(body, site["latitude_deg"], site["longitude_deg"], alt_km, times)
            if len(refs) != len(picks):
                raise RuntimeError(f"Horizons returned {len(refs)} rows for {len(picks)} epochs")
            worst_az = worst_el = 0.0
            for s, (raz, rel) in zip(picks, refs):
                daz = angdiff(s[f"{key}_az"], raz) * math.cos(math.radians(rel))
                dele = s[f"{key}_el"] - rel
                worst_az, worst_el = max(worst_az, abs(daz)), max(worst_el, abs(dele))
            res["comparisons"].append({"body": key, "n": len(refs),
                                       "max_abs_az_diff_deg_cos_el": round(worst_az, 5),
                                       "max_abs_el_diff_deg": round(worst_el, 5)})
        print(json.dumps({k: v for k, v in res.items() if k != "epochs"}))
        report.append(res)
    if a.output:
        a.output.write_text(json.dumps({"reference": "JPL Horizons API, topocentric AZ-EL quantity 4, airless",
                                        "results": report}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
