#!/usr/bin/env bash
# scripts/smoke-publico.sh <FRONT_URL> [API_URL]
#
# Teste de fumaça público do BRASPACE MoonProof, sem login.
#
# Verifica:
#  1. a front page retorna 200;
#  2. os subrecursos da pagina (CSS/JS) carregam sem erro HTTP;
#  3. /healthz e /v1/capabilities respondem 200;
#  4. uma comparacao de exemplo (POST /api/compare) responde 200.
#
# Links de ancora (<a href>) para sites externos nao sao subrecursos da
# pagina e nao fazem o teste falhar (ex.: repositorio GitHub privado
# sem login retorna 404, e isso e esperado).
#
# Sai com != 0 se qualquer verificacao falhar.
# Uso: scripts/smoke-publico.sh https://braspace.github.io/

set -euo pipefail

FRONT="${1:?uso: smoke-publico.sh <FRONT_URL> [API_URL]}"
API="${2:-}"

fail() { echo "FALHA: $*" >&2; exit 1; }
ok()   { echo "OK: $*"; }

FRONT="${FRONT%/}"

# Se API_URL nao informada, extrai de config.js (const API = "...")
if [ -z "$API" ]; then
  API=$(curl -fsS --max-time 20 "$FRONT/config.js" | sed -n "s/.*const API = \"\([^\"]*\)\".*/\1/p" | head -n 1)
  if [ -z "$API" ]; then
    fail "nao foi possivel determinar a API_URL a partir de $FRONT/config.js"
  fi
fi
API="${API%/}"

# Optional exact frontend build provenance gate (the backend has its own SHA).
# Usage: BRASPACE_EXPECT_FRONT_COMMIT=$(git rev-parse HEAD) scripts/smoke-publico.sh <origin>
if [ -n "${BRASPACE_EXPECT_FRONT_COMMIT:-}" ]; then
  [[ "$BRASPACE_EXPECT_FRONT_COMMIT" =~ ^[0-9a-f]{40}$ ]] ||
    fail "BRASPACE_EXPECT_FRONT_COMMIT deve ser um SHA Git completo (40 hex lowercase)"
  build_config=$(curl -fsS --max-time 20 "$FRONT/config.js") ||
    fail "config.js indisponivel para conferir build do Worker"
  printf '%s\n' "$build_config" | grep -Fxq "const BRASPACE_COMMIT = \"$BRASPACE_EXPECT_FRONT_COMMIT\";" ||
    fail "config.js nao publica o SHA exato esperado do frontend"
  ok "frontend /config.js identifica o SHA exato $BRASPACE_EXPECT_FRONT_COMMIT"
fi

echo "Front: $FRONT"
echo "API:   $API"

# 1. Pagina abre (200, sem login)
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$FRONT/" || true)
[ "$code" = "200" ] || fail "front $FRONT/ retornou HTTP $code (esperado 200)"
ok "front $FRONT/ -> $code"

# 2. Subrecursos da pagina nao dão erro HTTP (somente script/img/link/css;
#    ancoras <a href> sao ignoradas propositalmente)
# `/` is a redirect to the canonical MoonProof entry since the legacy web was archived (#321/#330):
# check the resources of the real pages — the entry and the cockpit, the panel that matters.
resources=""
for page in moonproof/ moonproof/cockpit.html; do
  # -L: Cloudflare assets answer 307 cockpit.html → /moonproof/cockpit (pretty URLs); the page must end in 200.
  code=$(curl -sSL -o /dev/null -w "%{http_code}" --max-time 30 "$FRONT/$page" || true)
  [ "$code" = "200" ] || fail "pagina $FRONT/$page retornou HTTP $code (esperado 200)"
  ok "pagina $page -> $code"
  base="${page%/*}"; [ "$base" = "$page" ] && base=""
  found=$(curl -fsSL --max-time 30 "$FRONT/$page" \
    | grep -oE '<(script|img|iframe|source|link)[^>]+(src|href)="[^"]*"' \
    | grep -oE '(src|href)="[^"]*"' | sed -E 's/^(src|href)="//;s/"$//' | sort -u || true)
  [ -n "$found" ] || fail "pagina $page sem recursos (script/link) — HTML inesperado"
  for r in $found; do
    case "$r" in http://*|https://*|/*) resources="$resources $r" ;; *) resources="$resources ${base:+$base/}$r" ;; esac
  done
done
for r in $resources; do
  case "$r" in
    http://*|https://*) url="$r" ;;
    /*) url="${FRONT}${r}" ;;
    *) url="${FRONT}/${r}" ;;
  esac
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$url" || true)
  case "$code" in
    2[0-9][0-9]) ok "recurso $r -> $code" ;;
    "") fail "recurso $r -> sem resposta (conexao falhou)" ;;
    *) fail "recurso $r -> HTTP $code" ;;
  esac
done

# 3. /healthz e /v1/capabilities
for p in /healthz /v1/capabilities; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$API$p" || true)
  [ "$code" = "200" ] || fail "$API$p retornou HTTP $code (esperado 200)"
  ok "$API$p -> $code"
done

# 4. Comparacao de exemplo (site sintético ja ingerido; sem campo constraints,
#    que o endpoint /api/compare nao aceita)
tmp=$(mktemp)
cat > "$tmp" << JSON_EOF
{"site_ids":["synthetic-demo-a"],"start_utc":"2026-12-01T00:00:00Z","duration_hours":72,"include_series":true}
JSON_EOF
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 60 \
  -H "Content-Type: application/json" --data-binary @"$tmp" "$API/api/compare" || true)
rm -f "$tmp"
[ "$code" = "200" ] || fail "$API/api/compare retornou HTTP $code (esperado 200)"
ok "$API/api/compare -> $code (comparacao de exemplo)"

# 5. Public NASA SVS Moon GLB asset must survive the API/Worker proxy.
# Fetch only 32 bytes (not a 14 MB download); full-file SHA-256 is enforced
# by the Go asset cache before ServeContent returns any bytes.
model_headers=$(mktemp)
model_probe=$(mktemp)
trap 'rm -f "$model_headers" "$model_probe"' EXIT
model_path=/api/layers/svs-14959-moon-small-glb/asset
code=$(curl -sS --max-time 90 --range 0-31 -D "$model_headers" -o "$model_probe" \
  -w "%{http_code}" "$API$model_path" || true)
[ "$code" = "206" ] || fail "$API$model_path range 0-31 retornou HTTP $code (esperado 206)"
grep -qiE '^content-type:[[:space:]]*model/gltf-binary([;[:space:]]|$)' "$model_headers" || \
  fail "$API$model_path nao serviu model/gltf-binary"
grep -qiE '^content-range:[[:space:]]*bytes 0-31/13799876' "$model_headers" || \
  fail "$API$model_path Content-Range incorreto (esperado 32/13799876 bytes)"
[ "$(wc -c < "$model_probe")" -eq 32 ] || fail "$API$model_path deveria retornar 32 bytes"
[ "$(head -c 4 "$model_probe")" = "glTF" ] || fail "$API$model_path GLB magic incorreto"
ok "$API$model_path -> 206 (32-byte range, glTF, 13,799,876-byte catalog asset)"

echo "RESULTADO: smoke-publico passou em $FRONT (API $API)"
exit 0
