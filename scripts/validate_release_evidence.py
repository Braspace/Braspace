#!/usr/bin/env python3
"""Fail-closed, standard-library-only release evidence gate.

This is an evidence validator, NOT a substitute for GitHub branch protection.
Usage: python3 scripts/validate_release_evidence.py evidence.json
"""
import json
import re
import sys
from pathlib import Path

SHA = re.compile(r"^[0-9a-f]{40}$")
REQUIRED = ("main_sha", "candidate_sha", "ci_run_url", "ci_conclusion",
            "required_checks", "human_approval", "science_status",
            "public_demo_verified", "nasa_submission_authorized")


def validate(record):
    errors = []
    if not isinstance(record, dict):
        return ["evidence must be a JSON object"]
    for key in REQUIRED:
        if key not in record:
            errors.append(f"missing {key}")
    for key in ("main_sha", "candidate_sha"):
        if not isinstance(record.get(key), str) or not SHA.fullmatch(record[key]):
            errors.append(f"{key} must be a full lowercase 40-character SHA")
    if record.get("ci_conclusion") != "success":
        errors.append("CI is not successful")
    url = record.get("ci_run_url")
    if not isinstance(url, str) or not re.fullmatch(
        r"https://github\.com/Braspace/Braspace/actions/runs/[0-9]+", url
    ):
        errors.append("missing canonical GitHub Actions run URL")
    checks = record.get("required_checks")
    if not isinstance(checks, dict) or not checks or any(
        v != "success" for v in checks.values()
    ):
        errors.append("required checks must be a nonempty map of successes")
    if record.get("human_approval") is not True:
        errors.append("human approval absent")
    if record.get("science_status") != "VERIFIED":
        errors.append("science remains PRELIMINARY/UNVERIFIED")
    if record.get("public_demo_verified") is not True:
        errors.append("public demo not verified")
    if record.get("nasa_submission_authorized") is not True:
        errors.append("NASA submission not authorized")
    return errors


def main():
    if len(sys.argv) != 2:
        print("usage: validate_release_evidence.py evidence.json", file=sys.stderr)
        return 2
    try:
        record = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"BLOCKED: invalid evidence: {exc}", file=sys.stderr)
        return 2
    errors = validate(record)
    for error in errors:
        print(f"BLOCKED: {error}", file=sys.stderr)
    if errors:
        return 1
    print("Evidence fields pass structural gate; independently verify run, SHA and approvals.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
