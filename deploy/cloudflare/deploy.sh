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
cfg="$root/web/config.js"; cp "$cfg" "$cfg.bak"
trap 'mv -f "$cfg.bak" "$cfg"' EXIT
printf 'const BRASPACE_COMMIT = "%s";\n' "$sha" >> "$cfg"
npx -y wrangler@4 deploy --message "main $short${note:+ ($note)}"
echo "deployed $sha; rollback: npx wrangler rollback ${prev:-<previous version id>}"
