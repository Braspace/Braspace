#!/usr/bin/env bash
# Continuous production check of the MoonProof cockpit, run from a workstation (EXO-X1) by a systemd user timer.
# Each run, against the canonical edge (Worker) and the direct API:
#   - /healthz build_commit must equal the commit deployed on the harness (read from the running api image tag),
#   - scripts/cockpit-backend-contract.mjs (49 checks, paced for Traefik's 20 req/s limit) must pass,
#   - /api/vector/status must be index_ready.
# The result line goes to $BRASPACE_WATCH_LOG; on a state change (ok → fail, fail → ok) it raises a desktop notification.
# A 429 (exit 2 of the contract) is logged as INCONCLUSIVE, not as a failure.
#
#   BRASPACE_REPO=~/repos/Braspace   checkout whose origin/main provides the contract script (read with git archive)
set -uo pipefail
REPO="${BRASPACE_REPO:-$HOME/repos/Braspace}"
EDGE="${BRASPACE_EDGE:-https://braspace-moonproof.almeida-me.workers.dev}"
API="${BRASPACE_API:-https://braspace-api.srv1898743.hstgr.cloud}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/braspace"
LOG="${BRASPACE_WATCH_LOG:-$STATE_DIR/prod-watch.log}"
mkdir -p "$STATE_DIR"
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
notify() { command -v notify-send >/dev/null && DISPLAY="${DISPLAY:-:0}" notify-send -u "$1" "MoonProof prod" "$2" 2>/dev/null || true; }

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
git -C "$REPO" fetch -q origin main 2>/dev/null || true
git -C "$REPO" archive origin/main scripts web/moonproof web/lab web/api-base.js | tar -x -C "$work" || { echo "$(ts) ERROR cannot read contract from $REPO" >> "$LOG"; exit 1; }

expect=$(curl -fsS --max-time 15 "$API/healthz" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("build_commit",""))' 2>/dev/null)
status=OK; detail=()
[[ "$expect" =~ ^[0-9a-f]{40}$ ]] || { status=FAIL; detail+=("healthz build_commit=$expect"); }
edge_commit=$(curl -fsS --max-time 15 "$EDGE/healthz" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("build_commit",""))' 2>/dev/null)
[ "$edge_commit" = "$expect" ] || { status=FAIL; detail+=("edge build_commit=$edge_commit direct=$expect"); }

for base in "$EDGE" "$API"; do
  origin=""; [ "$base" = "$API" ] && origin="https://braspace.github.io"
  out=$(cd "$work" && BRASPACE_EXPECT_COMMIT="$expect" BRASPACE_COCKPIT_PACE_MS=200 BRASPACE_COCKPIT_API="$base" BRASPACE_COCKPIT_ORIGIN="$origin" \
        timeout 300 node scripts/cockpit-backend-contract.mjs 2>&1); rc=$?
  summary=$(echo "$out" | grep -E '^cockpit-backend-contract:' | sed -E 's/ against .*//')
  case $rc in
    0) detail+=("$(basename "$base") ${summary#cockpit-backend-contract: }") ;;
    2) [ "$status" = OK ] && status=INCONCLUSIVE; detail+=("$(basename "$base") RATE_LIMITED") ;;
    *) status=FAIL; detail+=("$(basename "$base") ${summary#cockpit-backend-contract: } $(echo "$out" | grep -m2 '^FAIL' | cut -c1-120 | tr '\n' ';')") ;;
  esac
done
vstate=$(curl -fsS --max-time 15 "$EDGE/api/vector/status" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("state"), d.get("audited_count"))' 2>/dev/null)
case "$vstate" in index_ready*) detail+=("vector $vstate") ;; *) status=FAIL; detail+=("vector $vstate") ;; esac

line="$(ts) $status commit=${expect:0:12} ${detail[*]}"
echo "$line" >> "$LOG"
prev=$(cat "$STATE_DIR/last-status" 2>/dev/null || echo OK)
if [ "$status" = FAIL ] && [ "$prev" != FAIL ]; then notify critical "FAIL: ${detail[*]}"; fi
if [ "$status" = OK ] && [ "$prev" = FAIL ]; then notify normal "recovered: commit ${expect:0:12}"; fi
[ "$status" = INCONCLUSIVE ] || echo "$status" > "$STATE_DIR/last-status"
echo "$line"
[ "$status" != FAIL ]
