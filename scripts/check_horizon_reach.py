#!/usr/bin/env python3
"""Fail-closed structural checks for PRELIMINARY horizon reach studies.

Does not independently reproduce NASA data or ray marching.
Usage: python3 scripts/check_horizon_reach.py result.json
"""
import json
import math
import sys
from pathlib import Path

METRICS = ("sun_center_visible_pct", "mean_solar_disc_visible_pct", "earth_center_visible_pct")


def check(data):
    errors = []
    if not isinstance(data, dict) or data.get("schema") != "braspace.horizon-reach-study.v1":
        return ["invalid horizon reach schema"]
    if data.get("science_status") != "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED":
        errors.append("scientific status must remain PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")
    reaches = data.get("reaches_m")
    if (not isinstance(reaches, list) or len(reaches) < 2
            or any(type(x) is not int or x <= 0 for x in reaches)
            or reaches != sorted(set(reaches))):
        return errors + ["reaches_m must be strictly increasing positive integers"]
    sites = data.get("sites")
    if not isinstance(sites, list) or not sites:
        return errors + ["sites must be a nonempty list"]
    names = set()
    for site in sites:
        if (not isinstance(site, dict) or not isinstance(site.get("site"), str)
                or not site["site"] or site["site"] in names):
            errors.append("site identifier missing or duplicate")
            continue
        names.add(site["site"])
        rows = site.get("reaches")
        if (not isinstance(rows, list)
                or [r.get("reach_m") if isinstance(r, dict) else None for r in rows] != reaches):
            errors.append(f"{site['site']}: reach rows do not match declared reaches")
            continue
        for metric in METRICS:
            previous = None
            for row in rows:
                value = row.get(metric)
                if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
                    errors.append(f"{site['site']}: invalid {metric}")
                    break
                if previous is not None and value > previous + 0.011:
                    errors.append(f"{site['site']}: {metric} increases with horizon reach")
                    break
                previous = value
        for metric in ("longest_darkness_h", "longest_earth_blackout_h"):
            previous = None
            for row in rows:
                value = row.get(metric)
                if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                    errors.append(f"{site['site']}: invalid {metric}")
                    break
                # With identical epochs, adding terrain cannot shorten the longest blackout.
                if previous is not None and value < previous - 0.011:
                    errors.append(f"{site['site']}: {metric} decreases with horizon reach")
                    break
                previous = value
    return errors


def main(argv):
    if len(argv) != 2:
        print("usage: check_horizon_reach.py result.json", file=sys.stderr)
        return 2
    try:
        data = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"BLOCKED: cannot read JSON: {exc}", file=sys.stderr)
        return 2
    errors = check(data)
    for error in errors:
        print("BLOCKED:", error, file=sys.stderr)
    if errors:
        return 1
    print("Structural invariants PASS; science remains PRELIMINARY/UNVERIFIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
