#!/usr/bin/env python3
"""Fail-closed, offline check-run gate. Input: GitHub GET /commits/{sha}/check-runs JSON."""
import argparse
import json
import sys


def evaluate(payload, expected_sha, required):
    if not isinstance(payload, dict) or not isinstance(payload.get("check_runs"), list):
        return False, ["missing check_runs array"]
    if not expected_sha or not required:
        return False, ["expected SHA and at least one required check are mandatory"]
    failures = []
    for name in required:
        matching = [run for run in payload["check_runs"]
                    if isinstance(run, dict) and run.get("name") == name]
        if len(matching) != 1:
            failures.append(f"{name}: expected exactly one check, found {len(matching)}")
            continue
        run = matching[0]
        if run.get("head_sha") != expected_sha:
            failures.append(f"{name}: stale or missing head_sha")
        if run.get("status") != "completed" or run.get("conclusion") != "success":
            failures.append(f"{name}: not completed successfully")
    return not failures, failures


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", help="Saved GitHub check-runs response")
    parser.add_argument("--sha", required=True, help="Exact final commit SHA")
    parser.add_argument("--required", action="append", required=True,
                        help="Required check name (repeat for each check)")
    args = parser.parse_args(argv)
    try:
        with open(args.json_file, encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, ValueError) as exc:
        print(f"UNKNOWN: cannot read checks: {exc}", file=sys.stderr)
        return 2
    passed, failures = evaluate(payload, args.sha, args.required)
    for failure in failures:
        print(f"BLOCK: {failure}", file=sys.stderr)
    print("PASS: required checks successful on exact SHA" if passed else "BLOCK: release not verified")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
