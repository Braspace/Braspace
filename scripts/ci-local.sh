#!/usr/bin/env bash
# scripts/ci-local.sh [--browser] [--keep-going]
# The whole CI in one command; the Actions workflow runs exactly this.
#   1. docker build --target test .   (Go vet+race, Rust, web lint/tests/e2e, science: all inside the Dockerfile)
#   2. Compose (compose.yaml + compose.db.yaml, own project) -> /healthz /readyz /api/sites /v1/capabilities
#   3. Go tests that need Postgres (TEST_DATABASE_URL -> a throwaway database in the Compose Postgres)
#   4. docker compose down --volumes (always)
#   5. --browser (optional): Chromium QA with the host Chrome/Playwright browser
# Exit code != 0 on any failure; one summary line per step at the end.
set -uo pipefail
cd "$(dirname "$0")/.."

BROWSER=0
for a in "$@"; do case "$a" in --browser) BROWSER=1 ;; *) echo "unknown option: $a" >&2; exit 2 ;; esac; done

PROJECT="${CI_PROJECT:-braspace-ci-$$}"
PORT="${BRASPACE_PORT:-$(python3 -c "import socket;s=socket.socket();s.bind((\"127.0.0.1\",0));print(s.getsockname()[1]);s.close()")}"
export BRASPACE_PORT="$PORT"
export CORS_ALLOWED_ORIGINS="https://braspace.github.io"
POSTGRES_PASSWORD="$(openssl rand -hex 16)"; export POSTGRES_PASSWORD
BASE="http://127.0.0.1:${PORT}"
DC=(docker compose -p "$PROJECT" -f compose.yaml -f compose.db.yaml)
SUMMARY=(); FAIL=0; T0=$(date +%s)

step() { # step <name> <command...>
  local name="$1"; shift; local s=$(date +%s)
  echo "=== $name"
  if "$@"; then SUMMARY+=("PASS  $name ($(( $(date +%s) - s ))s)"); return 0
  else SUMMARY+=("FAIL  $name ($(( $(date +%s) - s ))s)"); FAIL=1; return 1; fi
}
skip() { SUMMARY+=("SKIP  $1 ($2)"); }
cleanup() {
  "${DC[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$PROJECT-pgvector" >/dev/null 2>&1
  [ -n "${BCID:-}" ] && docker rm -f "$BCID" >/dev/null 2>&1
  [ -n "${BTMP:-}" ] && rm -rf "$BTMP"
}
trap cleanup EXIT
finish() {
  echo; echo "=========== ci-local summary (project $PROJECT)"
  printf "%s\n" "${SUMMARY[@]}"
  echo "TOTAL $(( $(date +%s) - T0 ))s  -> $([ $FAIL = 0 ] && echo GREEN || echo RED)"
  exit $FAIL
}

# BRASPACE_CI_CACHE=<dir>: use buildx local layer cache (needs a docker-container builder; set up by the workflow).
dbuild() {
  if [ -n "${BRASPACE_CI_CACHE:-}" ]; then
    docker buildx build --load --cache-from "type=local,src=$BRASPACE_CI_CACHE" --cache-to "type=local,dest=$BRASPACE_CI_CACHE.new,mode=max" "$@"
    local rc=$?; [ -d "$BRASPACE_CI_CACHE.new" ] && rm -rf "$BRASPACE_CI_CACHE" && mv "$BRASPACE_CI_CACHE.new" "$BRASPACE_CI_CACHE"; return $rc
  else docker build "$@"; fi
}
build_tests()  { dbuild --target test . ; }
build_go_img() { dbuild --target test-go -t "$PROJECT-go" . ; }
build_rel()    { dbuild -t "$PROJECT-rel" . ; }
compose_up()   { "${DC[@]}" up --build -d --wait --wait-timeout 180 ; }
endpoints() {
  local rc=0 p code
  for p in /healthz /readyz /api/sites /v1/capabilities; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$p")
    echo "$p -> $code"; [ "$code" = 200 ] || rc=1
  done
  # CORS contract (was compose-cors.yml): exact origin allowed (204), others refused (403, no ACAO header)
  code=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/api/sites" -H "Origin: https://braspace.github.io" -H "Access-Control-Request-Method: GET")
  echo "CORS allowed origin -> $code"; [ "$code" = 204 ] || rc=1
  code=$(curl -s -D ${TMPDIR:-/tmp}/cors-deny.$$ -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/api/sites" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET")
  echo "CORS other origin -> $code"; [ "$code" = 403 ] && ! grep -qi "^access-control-allow-origin:" ${TMPDIR:-/tmp}/cors-deny.$$ || rc=1; rm -f ${TMPDIR:-/tmp}/cors-deny.$$
  curl -fsS "$BASE/api/health" | python3 -c "import json,sys; assert json.load(sys.stdin)[\"data_source\"]==\"postgres\"" || rc=1
  ./examples/mission/replay.sh "$BASE" || rc=1
  return $rc
}
postgres_tests() {
  "${DC[@]}" exec -T db psql -U braspace -d braspace -c "CREATE DATABASE braspace_test" || return 1
  docker run --rm --network "${PROJECT}_default" \
    -e "TEST_DATABASE_URL=postgres://braspace:${POSTGRES_PASSWORD}@db:5432/braspace_test?sslmode=disable" \
    "$PROJECT-go" go test -race -count=1 ./... || return 1
  # Guard: the DB tests must really run (not skip) against the Compose Postgres.
  local out; out=$(docker run --rm --network "${PROJECT}_default" \
    -e "TEST_DATABASE_URL=postgres://braspace:${POSTGRES_PASSWORD}@db:5432/braspace_test?sslmode=disable" \
    "$PROJECT-go" go test -count=1 -v -run "TestDB" ./ 2>&1); echo "$out" | grep -E "^(--- |ok|FAIL)" 
  ! echo "$out" | grep -q -- "--- SKIP" && echo "$out" | grep -q -- "--- PASS: TestDB"
}
pgvector_tests() { # real pgvector lane: own container in this project's network, disposable
  local vc="$PROJECT-pgvector"; docker rm -f "$vc" >/dev/null 2>&1
  docker run -d --name "$vc" --network "${PROJECT}_default" -e POSTGRES_USER=braspace -e "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
    -e POSTGRES_DB=braspace_vector_test pgvector/pgvector:pg17 >/dev/null || return 1
  for i in $(seq 1 30); do docker exec "$vc" pg_isready -U braspace -d braspace_vector_test >/dev/null 2>&1 && break; sleep 1; done
  local out; out=$(docker run --rm --network "${PROJECT}_default" \
    -e "TEST_VECTOR_DATABASE_URL=postgres://braspace:${POSTGRES_PASSWORD}@$vc:5432/braspace_vector_test?sslmode=disable" \
    "$PROJECT-go" go test -count=1 -v -run "TestVector" ./ 2>&1); local rc=$?
  echo "$out" | grep -E "^(--- |ok|FAIL)"; docker rm -f "$vc" >/dev/null 2>&1
  [ $rc = 0 ] && ! echo "$out" | grep -q -- "--- SKIP" && echo "$out" | grep -q -- "--- PASS: TestVectorDBQuarantineAndStates"
}
freeport() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
cockpit_focus_qa() {
  # Older checkouts do not yet have the P0 cockpit focus suite. Once the
  # cockpit panel controller is shipped, its six-width browser gate is mandatory.
  local suite=web/browser/cockpit-focus-e2e.mjs
  [ -f "$BTMP/web/moonproof/cockpit.html" ] || return 1
  if [ ! -f "$BTMP/$suite" ]; then
    if grep -q 'cockpit-panels.js' "$BTMP/web/moonproof/cockpit.html"; then
      echo "Cockpit panel controller present without mandatory $suite" >&2
      return 1
    fi
    echo "SKIP six-width cockpit focus: controller not yet present"
    return 0
  fi
  local wp chrome web_pid rc=0 artifacts
  wp=$(freeport) || return 1
  chrome=$(command -v google-chrome) || return 1
  artifacts="$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "${BRASPACE_BROWSER_ARTIFACTS:-$BTMP/shots}/cockpit-focus")" || return 1
  mkdir -p "$artifacts" || return 1
  # Run the same checked-in suite with the host Chrome and already installed
  # playwright-core. The source tree remains untouched (only a temporary copy).
  sed -e "s#from [\"']playwright[\"']#from 'playwright-core'#" \
      -e "s#chromium.launch({#chromium.launch({executablePath:\"$chrome\",args:[\"--use-angle=swiftshader\",\"--enable-webgl\",\"--enable-unsafe-swiftshader\"],#" \
      "$BTMP/$suite" > "$BTMP/web/browser/cockpit-focus-ci.mjs" || return 1
  (cd "$BTMP" && exec env BRASPACE_WEB_PORT="$wp" node web/dev-server.mjs) >"$BTMP/cockpit-web.log" 2>&1 & web_pid=$!
  local ready=0
  for i in $(seq 1 30); do
    kill -0 "$web_pid" 2>/dev/null || break
    if curl -fsS --max-time 2 "http://127.0.0.1:$wp/moonproof/" >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    echo "Cockpit QA web did not start" >&2; tail -10 "$BTMP/cockpit-web.log"; rc=1
  else
    (cd "$BTMP" && BRASPACE_COCKPIT_QA_URL="http://127.0.0.1:$wp/moonproof/" \
      BRASPACE_BROWSER_ARTIFACTS="$artifacts" node web/browser/cockpit-focus-ci.mjs) || rc=$?
  fi
  kill "$web_pid" 2>/dev/null || true
  wait "$web_pid" 2>/dev/null || true
  return "$rc"
}
smoke_publico() { # front via dev-server (proxies /api, /healthz, /v1) + Compose API, as main-smoke did
  local wport; wport=$(freeport)
  # Node may be absent on the CI host: run the dev-server in the same Node image the Dockerfile tests with.
  local wc="$PROJECT-smoke-web"; docker rm -f "$wc" >/dev/null 2>&1
  docker run -d --name "$wc" --network host --security-opt label=disable -v "$PWD:/src:ro" -w /src -e BRASPACE_API_PORT=$PORT -e BRASPACE_WEB_PORT=$wport \
    node:22.23.5-alpine node web/dev-server.mjs >/dev/null || return 1
  for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:$wport/" >/dev/null 2>&1 && break; sleep 1; done
  ./scripts/smoke-publico.sh "http://127.0.0.1:$wport" "$BASE"; local rc=$?
  [ $rc = 0 ] || docker logs --tail 20 "$wc"; docker rm -f "$wc" >/dev/null 2>&1; return $rc
}
browser_qa() {
  command -v node >/dev/null && command -v google-chrome >/dev/null || { echo "need node + host Chrome"; return 1; }
  BTMP=$(mktemp -d); BCID=$(docker create "$PROJECT-rel" ) || return 1
  docker cp "$BCID:/app/bin/api" "$BTMP/api" && docker cp "$BCID:/app/bin/lunar-engine" "$BTMP/engine" || return 1
  cp -r web "$BTMP/web"; (cd "$BTMP/web" && npm install --no-save playwright-core@1.56.1 >/dev/null 2>&1) || return 1
  # Own free port: 8080 may belong to another stack on the host, and the QA would then talk to that API.
  local qp; qp=$(python3 -c "import socket;s=socket.socket();s.bind((\"127.0.0.1\",0));print(s.getsockname()[1]);s.close()")
  LISTEN_ADDR=127.0.0.1:$qp RUST_ENGINE_BIN="$BTMP/engine" "$BTMP/api" >"$BTMP/api.log" 2>&1 & local ap=$!
  local up=0; for i in $(seq 1 30); do kill -0 $ap 2>/dev/null || break; curl -fsS http://127.0.0.1:$qp/readyz >/dev/null 2>&1 && { up=1; break; }; sleep 1; done
  [ $up = 1 ] || { echo "QA API did not start on 127.0.0.1:$qp"; tail -5 "$BTMP/api.log"; kill $ap 2>/dev/null; return 1; }
  export BRASPACE_API_PORT=$qp
  sed "s#from \"playwright\"#from \"playwright-core\"#; s#chromium.launch({#chromium.launch({executablePath:\"$(command -v google-chrome)\",#" web/browser/e2e.mjs > "$BTMP/web/browser/e2e.mjs"
  ( cd "$BTMP" && cp -r "$OLDPWD/data" "$OLDPWD/examples" . 2>/dev/null; NODE_PATH="$BTMP/web/node_modules" BRASPACE_REQUIRE_BACKEND=1 BRASPACE_BROWSER_ARTIFACTS="$BTMP/shots" \
    BRASPACE_REQUIRE_BACKEND=1 BRASPACE_BROWSER_ARTIFACTS="$BTMP/shots" node web/browser/e2e.mjs ); local rc=$?
  if [ "$rc" = 0 ]; then cockpit_focus_qa || rc=$?; fi
  kill $ap 2>/dev/null; return $rc
}

worker_contract() {
  # The harness host has no node: run the Worker contract suite in the same pinned image as the smoke.
  if command -v node >/dev/null 2>&1; then node --test deploy/cloudflare/*.test.mjs
  else docker run --rm --security-opt label=disable -v "$PWD:/src:ro" -w /src node:22.23.5-alpine sh -c 'node --test deploy/cloudflare/*.test.mjs'; fi
}
cockpit_contract() {
  # The MoonProof cockpit's own request builders/readers (web/moonproof/screens/cockpit-*.js) against the compose
  # Go + Rust + Postgres stack: every site, fallback route, determinism, energy/crew/report, negatives, vector status.
  if command -v node >/dev/null 2>&1; then BRASPACE_COCKPIT_API="$BASE" node scripts/cockpit-backend-contract.mjs
  else docker run --rm --network host --security-opt label=disable -e BRASPACE_COCKPIT_API="$BASE" -v "$PWD:/src:ro" -w /src node:22.23.5-alpine node scripts/cockpit-backend-contract.mjs; fi
}
step "cloudflare worker same-origin API proxy contract (node --test)" worker_contract || finish
step "docker build --target test (go vet+race, rust, web, science)" build_tests || finish
step "build release image (needs test)" build_rel || finish
step "build go test image" build_go_img || finish
if step "compose up (api + postgres + ingest)" compose_up; then
  step "endpoints /healthz /readyz /api/sites /v1/capabilities + replay" endpoints
  step "cockpit ↔ Go/Rust/Postgres contract (scripts/cockpit-backend-contract.mjs)" cockpit_contract
  step "public smoke (scripts/smoke-publico.sh: dev-server front + compose API)" smoke_publico
  step "go tests against compose Postgres" postgres_tests
  step "go tests against real pgvector (quarantine, states, rollback)" pgvector_tests
else
  "${DC[@]}" logs 2>&1 | tail -30
fi
step "compose down" "${DC[@]}" down --volumes --remove-orphans
if [ $BROWSER = 1 ]; then step "chromium (host Chrome): onboard + polar lab e2e" browser_qa; else skip "chromium browser QA" "optional: --browser"; fi
docker rmi -f "$PROJECT-rel" "$PROJECT-go" >/dev/null 2>&1
finish
