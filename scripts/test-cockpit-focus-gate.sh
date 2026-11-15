#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Exercise the exact function, without Docker/Chrome/network in a throwaway fixture.
eval "$(sed -n '/^cockpit_focus_qa() {$/,/^}$/p' ci-local.sh)"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
BTMP="$ROOT/tree"
mkdir -p "$BTMP/web/moonproof" "$BTMP/web/browser" "$ROOT/bin"
export PATH="$ROOT/bin:$PATH"
export REAL_NODE=$(command -v node)
export BRASPACE_BROWSER_ARTIFACTS="$ROOT/artifact output"
export BRASPACE_API_PORT=45892
export MOCK_CAPTURE="$ROOT/launch"
export MOCK_RESULT=0
freeport() { echo 45893; }
curl() { [[ "$*" == *'http://127.0.0.1:45893/moonproof/'* ]]; }
printf '#!/bin/bash\nexit 0\n' >"$ROOT/bin/google-chrome"
printf '%s\n' '#!/bin/bash' 'if [[ "$1" == -e ]]; then exec "$REAL_NODE" "$@"; fi' 'if [[ "$1" == web/dev-server.mjs ]]; then exec sleep 10; fi' 'if [[ "$1" == web/browser/cockpit-focus-ci.mjs ]]; then printf "%s\n" "$BRASPACE_COCKPIT_QA_URL" "$BRASPACE_API_PORT" "$BRASPACE_BROWSER_ARTIFACTS" >"$MOCK_CAPTURE"; exit "$MOCK_RESULT"; fi' 'exit 12' >"$ROOT/bin/node"
chmod +x "$ROOT/bin/google-chrome" "$ROOT/bin/node"
[[ ! -f "$BTMP/web/moonproof/cockpit.html" ]]
if cockpit_focus_qa; then echo 'missing cockpit should fail'; exit 1; fi
printf '<html>old</html>\n' >"$BTMP/web/moonproof/cockpit.html"
cockpit_focus_qa
[[ ! -e "$MOCK_CAPTURE" ]]
printf '<script type="module" src="screens/cockpit-panels.js"></script>\n' >"$BTMP/web/moonproof/cockpit.html"
if cockpit_focus_qa; then echo 'candidate missing mandatory suite should fail'; exit 1; fi
printf 'import {chromium} from "playwright"; await chromium.launch({headless:true});\n' >"$BTMP/web/browser/cockpit-focus-e2e.mjs"
cockpit_focus_qa
grep -q "from 'playwright-core'" "$BTMP/web/browser/cockpit-focus-ci.mjs"
grep -q 'executablePath:' "$BTMP/web/browser/cockpit-focus-ci.mjs"
grep -qx 'http://127.0.0.1:45893/moonproof/' "$MOCK_CAPTURE"
grep -qx 45892 "$MOCK_CAPTURE"
grep -Fxq "$ROOT/artifact output/cockpit-focus" "$MOCK_CAPTURE"
export BRASPACE_REQUIRE_COCKPIT_GPU=1
cockpit_focus_qa
grep -q -- '--enable-webgl' "$BTMP/web/browser/cockpit-focus-ci.mjs"
! grep -q -- 'swiftshader' "$BTMP/web/browser/cockpit-focus-ci.mjs"
export MOCK_RESULT=17
rc=0
cockpit_focus_qa || rc=$?
[[ $rc == 17 ]]
echo 'PASS: missing HTML, compatible legacy skip, required suite failure, exact local URLs, artifact path, Chrome adapter, failure propagation'
