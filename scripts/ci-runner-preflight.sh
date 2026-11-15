#!/usr/bin/env bash
# Diagnostic only: does not replace GitHub Actions, tests, or reviewer approval.
# Usage: bash scripts/ci-runner-preflight.sh
set -u
cd "$(dirname "$0")/.."
printf 'BRASPACE CI runner preflight (diagnostic, NOT a test pass)\n'
printf 'UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'HEAD: %s\n' "$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
printf 'branch: %s\n' "$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo DETACHED_OR_UNKNOWN)"
printf 'CI: %s; GITHUB_RUN_ID: %s; GITHUB_JOB: %s\n' "${CI:-unset}" "${GITHUB_RUN_ID:-unset}" "${GITHUB_JOB:-unset}"
missing=0
for tool in git bash docker python3 openssl curl; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf 'AVAILABLE %s\n' "$tool"
  else
    printf 'MISSING %s\n' "$tool"
    missing=1
  fi
done
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo 'AVAILABLE docker daemon'
  else
    echo 'MISSING docker daemon access'
    missing=1
  fi
  if docker compose version >/dev/null 2>&1; then
    echo 'AVAILABLE docker compose'
  else
    echo 'MISSING docker compose'
    missing=1
  fi
fi
if [ "$missing" -ne 0 ]; then
  echo 'PREFLIGHT BLOCKED: environment prerequisites missing; no tests executed'
  exit 1
fi
echo 'PREFLIGHT READY: prerequisites found; no tests executed'
