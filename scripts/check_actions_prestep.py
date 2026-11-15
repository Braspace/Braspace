#!/usr/bin/env python3
"""Classify GitHub Actions job snapshots without mistaking missing steps for test failures.

Usage: python3 scripts/check_actions_prestep.py jobs.json
Input: GitHub REST /actions/runs/{run_id}/jobs response (jobs array).
Exit 1 for failed/cancelled/timed-out jobs without recorded steps; 2 for bad input.
This diagnostic never certifies CI or scientific results.
"""
import json
import sys
from pathlib import Path


def inspect(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('jobs'), list):
        raise ValueError('expected an object with jobs array')
    anomalies = []
    for job in payload['jobs']:
        if not isinstance(job, dict) or not isinstance(job.get('id'), int) or isinstance(job['id'], bool):
            raise ValueError('each job requires an integer id')
        steps = job.get('steps')
        if steps is not None and not isinstance(steps, list):
            raise ValueError('steps must be an array or null')
        if job.get('conclusion') in ('failure', 'cancelled', 'timed_out') and not steps:
            anomalies.append(job['id'])
    return anomalies


def main(argv):
    if len(argv) != 2:
        print('usage: check_actions_prestep.py jobs.json', file=sys.stderr)
        return 2
    try:
        data = json.loads(Path(argv[1]).read_text(encoding='utf-8'))
        anomalies = inspect(data)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print(f'INVALID: {exc}', file=sys.stderr)
        return 2
    if anomalies:
        print('PRESTEP_ANOMALY jobs=' + ','.join(map(str, anomalies)))
        return 1
    print('NO_PRESTEP_ANOMALY_DETECTED; CI success NOT established')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
