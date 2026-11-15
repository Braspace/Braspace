#!/usr/bin/env python3
"""Classify GitHub Actions job evidence without mistaking absent steps for CI success.

Usage: python3 scripts/audit_actions_job_evidence.py jobs.json
Input: GitHub REST /actions/runs/{run_id}/jobs JSON (or --paginate --slurp pages).
Exit: 0 only when every job completed successfully with recorded successful steps;
      1 for blocked/incomplete evidence; 2 for malformed input.
This is an evidence classifier, not a replacement for required-check review.
"""
import json
import sys


def classify(payload):
    # gh api --paginate --slurp returns a list of page objects; a single
    # GitHub REST response is one object. Require the advertised total count
    # so a truncated first page can never be mistaken for a green run.
    pages = payload if isinstance(payload, list) else [payload]
    if not pages:
        raise ValueError("expected nonempty job response pages")
    jobs = []
    advertised_total = None
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get("jobs"), list):
            raise ValueError("expected object(s) with jobs array")
        count = page.get("total_count")
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError("missing/invalid total_count in job response")
        if advertised_total is None:
            advertised_total = count
        elif advertised_total != count:
            raise ValueError("inconsistent total_count across pages")
        jobs.extend(page["jobs"])
    if not jobs:
        return ["NO_JOBS"]
    seen_ids = set()
    for job in jobs:
        if not isinstance(job, dict):
            raise ValueError("job must be object")
        ident = job.get("id")
        if not isinstance(ident, int) or isinstance(ident, bool):
            raise ValueError("job id must be integer")
        if ident in seen_ids:
            raise ValueError("duplicate job id in response")
        seen_ids.add(ident)
    blockers = []
    if len(jobs) != advertised_total:
        blockers.append(f"INCOMPLETE_JOB_PAGINATION_{len(jobs)}_OF_{advertised_total}")
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
