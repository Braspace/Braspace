#!/usr/bin/env bash
# Publish the MoonProof Worker (static web/ + same-origin API proxy) from a clean checkout.
# Usage: CLOUDFLARE_ACCOUNT_ID=<id> deploy/cloudflare/deploy.sh ["short note"]
# - refuses a dirty tree (what is published must be a commit anyone can check out);
# - runs the Worker tests first;
# - writes BRASPACE_COMMIT into web/config.js only for the upload (Evidence/Plan show the build), then restores it;
# - prints the version to roll back to (`npx wrangler rollback <id>`).
set -euo pipefail
root=$(git rev-parse --show-toplevel); cd "$root"
[ -z "$(git status --porcelain)" ] || { echo "deploy.sh: working tree is not clean; commit or use a clean worktree" >&2; exit 1; }
sha=$(git rev-parse HEAD); short=${sha:0:7}; note=${1:-}
cd deploy/cloudflare
node --test ./*.test.mjs
[ -f wrangler.toml ] || cp wrangler.toml.example wrangler.toml
prev=$(npx -y wrangler@4 deployments list --name braspace-moonproof 2>/dev/null | awk '/Version\(s\):/{v=$3} END{print v}')
# Backup outside web/ (web/ is the assets directory: anything there would be uploaded).
cfg="$root/web/config.js"; bak=$(mktemp); cp "$cfg" "$bak"
trap 'cp -f "$bak" "$cfg"; rm -f "$bak"' EXIT
printf 'const BRASPACE_COMMIT = "%s";\n' "$sha" >> "$cfg"
npx -y wrangler@4 deploy --message "main $short${note:+ ($note)}"
# Post-deploy smoke: a new version can take a moment to serve everywhere (seen 15/11: brief /api 404s).
origin=${MOONPROOF_ORIGIN:-https://braspace-moonproof.almeida-me.workers.dev}
ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 10 "$origin/api/health" >/dev/null 2>&1 && curl -fsS --max-time 10 "$origin/config.js" 2>/dev/null | grep -q "$sha"; then ok=1; break; fi
  sleep 4
done
[ "$ok" = 1 ] || { echo "deploy.sh: smoke FAILED: $origin/api/health or config.js ($short) not served after 2 min; rollback: npx wrangler rollback ${prev:-<previous version id>}" >&2; exit 2; }
echo "deployed $sha; smoke ok ($origin/api/health 200, config.js $short); rollback: npx wrangler rollback ${prev:-<previous version id>}"
