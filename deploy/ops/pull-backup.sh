#!/usr/bin/env bash
# Off-site copy of the production database: the harness keeps its dumps in /docker/braspace/backup on the same VPS
# as the database, so losing the VPS would lose both. This pulls a FRESH pg_dump (-Fc) over Tailscale SSH to the
# workstation, verifies it with pg_restore -l (needs the table data entries) and keeps the newest $KEEP copies.
# Read-only on production (pg_dump). Run daily by a systemd user timer on EXO-X1.
#
#   BRASPACE_BACKUP_DIR=~/backups/braspace   KEEP=7   HARNESS=root@harness
set -euo pipefail
DIR="${BRASPACE_BACKUP_DIR:-$HOME/backups/braspace}"; KEEP="${KEEP:-7}"; HOST="${HARNESS:-root@harness}"
mkdir -p "$DIR"; chmod 700 "$DIR"
ts=$(date -u +%Y%m%d-%H%M%S)
img=$(timeout 60 tailscale ssh "$HOST" 'docker ps --filter label=com.docker.compose.service=api --format "{{.Image}}" | head -1' 2>/dev/null | tr -d '\r')
tag="${img#braspace-api:}"; [ -n "$tag" ] || tag=unknown
out="$DIR/braspace-$tag-$ts.dump"
timeout 600 tailscale ssh "$HOST" 'cd /docker/braspace && u=$(docker compose exec -T db sh -c "echo \$POSTGRES_USER") && n=$(docker compose exec -T db sh -c "echo \$POSTGRES_DB") && docker compose exec -T db pg_dump -U "$u" -d "$n" -Fc' > "$out.part" 2>/dev/null
# Verify with a throwaway pg_restore (same major as production) — the dump must list table data.
tables=$(docker run --rm -i pgvector/pgvector:pg17 pg_restore -l < "$out.part" 2>/dev/null | grep -c "TABLE DATA" || true)
if [ "${tables:-0}" -lt 1 ]; then rm -f "$out.part"; echo "$(date -u +%FT%TZ) FAIL backup unreadable" >&2; exit 1; fi
mv "$out.part" "$out"; chmod 600 "$out"
sha256sum "$out" > "$out.sha256"
ls -1t "$DIR"/braspace-*.dump | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$(date -u +%FT%TZ) OK $out ($(stat -c %s "$out") bytes, $tables tables, keep $KEEP)"
