#!/usr/bin/env bash
# Zero-downtime swap of the Braspace API on the harness (/docker/braspace, Traefik 3 docker provider).
# Start-first: a second `api` replica comes up with the new image next to the old one; Traefik only routes to
# containers whose healthcheck is `healthy`, so traffic keeps flowing to the old replica until the new one is
# ready. Then the old replica is stopped. A plain `docker compose up -d api` (stop-then-start) left every /api
# route answering 404 through the Worker for a few seconds on 15/11/2026 16:39Z.
#
# Usage on the harness (as root):  deploy/harness/swap-api.sh <IMAGEM tag>   e.g. 2b6247498db4-sha
#   BRASPACE_DIR=/docker/braspace   compose directory (default)
#   SKIP_INGEST=1                    only swap the api (same data, e.g. a re-stamp); default runs ingest + vector-ingest
# Always: backup/pre-<tag>-<UTC>.dump (pg_dump -Fc, checked with pg_restore -l) and backup/env-antes-<tag>-<UTC>.
# Rollback: run this script again with the previous tag (the dump restores data if a migration must be undone).
set -euo pipefail
TAG="${1:?usage: swap-api.sh <IMAGEM tag>}"
DIR="${BRASPACE_DIR:-/docker/braspace}"
cd "$DIR"
docker image inspect "braspace-api:$TAG" >/dev/null || { echo "image braspace-api:$TAG not loaded" >&2; exit 1; }

api_ids() { docker compose ps -q api; }
health() { docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null || echo missing; }
old=$(api_ids)
[ "$(echo "$old" | grep -c .)" = 1 ] || { echo "expected exactly one running api replica, found: $old" >&2; exit 1; }
echo "old api: $(docker inspect -f '{{.Name}} {{.Config.Image}}' "$old")"

ts=$(date -u +%Y%m%d-%H%M%S)
cp -p .env "backup/env-antes-$TAG-$ts"
dbu=$(docker compose exec -T db sh -c 'echo $POSTGRES_USER'); dbn=$(docker compose exec -T db sh -c 'echo $POSTGRES_DB')
docker compose exec -T db pg_dump -U "$dbu" -d "$dbn" -Fc > "backup/pre-$TAG-$ts.dump"
tables=$(docker compose exec -T db pg_restore -l < "backup/pre-$TAG-$ts.dump" | grep -c "TABLE DATA" || true)
[ "$tables" -gt 0 ] || { echo "backup has no table data, aborting" >&2; exit 1; }
echo "backup: backup/pre-$TAG-$ts.dump ($tables tables)"

sed -i "s/^IMAGEM=.*/IMAGEM=$TAG/" .env
grep -q "^IMAGEM=$TAG$" .env || { echo "IMAGEM not set in .env" >&2; exit 1; }

if [ "${SKIP_INGEST:-0}" != 1 ]; then
  docker compose up --no-deps ingest
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -a -q ingest)")" = 0 ] || { echo "ingest failed; old api still serving" >&2; exit 1; }
  docker compose up --no-deps vector-ingest
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -a -q vector-ingest)")" = 0 ] || { echo "vector-ingest failed; old api still serving" >&2; exit 1; }
fi

# Start-first: second replica with the new image, old one untouched.
docker compose up -d --no-deps --no-recreate --scale api=2 api
new=$(api_ids | grep -v "^${old:0:12}" | head -1)
[ -n "$new" ] || { echo "new replica did not start" >&2; exit 1; }
for i in $(seq 1 60); do s=$(health "$new"); [ "$s" = healthy ] && break; [ "$s" = unhealthy ] && break; sleep 2; done
if [ "$(health "$new")" != healthy ]; then
  echo "new replica not healthy ($(health "$new")); removing it, old api keeps serving" >&2
  docker rm -f "$new" >/dev/null; sed -i "s/^IMAGEM=.*/$(grep '^IMAGEM=' "backup/env-antes-$TAG-$ts")/" .env; exit 1
fi
echo "new api healthy: $(docker inspect -f '{{.Name}} {{.Config.Image}}' "$new")"
sleep 3   # let Traefik pick the new backend up before the old one goes away
docker stop -t 15 "$old" >/dev/null && docker rm "$old" >/dev/null
docker compose up -d --no-deps --no-recreate --scale api=1 api
docker compose ps api --format '{{.Name}} {{.Image}} {{.Status}}'
