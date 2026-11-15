#!/usr/bin/env python3
"""Classify GitHub Actions job evidence without mistaking absent steps for CI success.

Usage: python3 scripts/audit_actions_job_evidence.py jobs.json
Input: GitHub REST /actions/runs/{run_id}/jobs JSON (object with "jobs").
Exit: 0 only when every job completed successfully with recorded successful steps;
      1 for blocked/incomplete evidence; 2 for malformed input.
This is an evidence classifier, not a replacement for required-check review.
"""
import json
import sys


def classify(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        raise ValueError("expected object with jobs array")
    jobs = payload["jobs"]
    if not jobs:
        return ["NO_JOBS"]
    blockers = []
    for index, job in enumerate(jobs):
        if not isinstance(job, dict):
            raise ValueError("job must be object")
        ident = job.get("id")
        if not isinstance(ident, int) or isinstance(ident, bool):
            raise ValueError("job id must be integer")
        status, conclusion, steps = job.get("status"), job.get("conclusion"), job.get("steps")
        if status != "completed" or conclusion != "success":
            blockers.append(f"JOB_{ident}_NOT_SUCCESS")
        if not isinstance(steps, list) or not steps:
            blockers.append(f"JOB_{ident}_NO_STEP_EVIDENCE")
            continue
        for step in steps:
            if not isinstance(step, dict) or step.get("status") != "completed" or step.get("conclusion") != "success":
                blockers.append(f"JOB_{ident}_STEP_NOT_SUCCESS")
                break
    return blockers


def main(argv):
    if len(argv) != 2:
        print("usage: audit_actions_job_evidence.py jobs.json", file=sys.stderr)
        return 2
    try:
        with open(argv[1], encoding="utf-8") as source:
            blockers = classify(json.load(source))
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        print(f"INVALID_EVIDENCE: {error}", file=sys.stderr)
        return 2
    if blockers:
        print("BLOCKED: " + ", ".join(blockers))
        return 1
    print("JOB_EVIDENCE_PASS (not release approval; verify required checks on final SHA)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
