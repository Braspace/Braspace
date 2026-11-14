#!/usr/bin/env bash
# Replays every example request against a running API and compares the
# response with the stored *.response.json.
#   ./examples/mission/replay.sh [base_url]
set -euo pipefail
BASE="${1:-http://127.0.0.1:8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"
fail=0
for req in "$DIR"/*.request.json; do
  name="$(basename "$req" .request.json)"
  path=/api/scenarios/delay
  [ "$name" = compare ] && path=/api/compare
  got="$(curl -sS -H 'Content-Type: application/json' --data-binary @"$req" "$BASE$path")"
  if python3 -c 'import json,sys; sys.exit(json.loads(sys.argv[1]) != json.load(open(sys.argv[2])))' "$got" "$DIR/$name.response.json"; then
    echo "ok    $name  ($path)"
  else
    echo "DIFF  $name  ($path)"; fail=1
  fi
done
exit $fail
