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

echo "Front: $FRONT"
echo "API:   $API"

# 1. Pagina abre (200, sem login)
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$FRONT/" || true)
[ "$code" = "200" ] || fail "front $FRONT/ retornou HTTP $code (esperado 200)"
ok "front $FRONT/ -> $code"

# 2. Subrecursos da pagina nao dão erro HTTP (somente script/img/link/css;
#    ancoras <a href> sao ignoradas propositalmente)
resources=$(curl -fsS --max-time 30 "$FRONT/" \
  | grep -oE '<(script|img|iframe|source|link)[^>]+(src|href)="[^"]*"' \
  | grep -oE '(src|href)="[^"]*"' | sed -E 's/^(src|href)="//;s/"$//' | sort -u)
resources="$resources ./moon3d.js"
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

echo "RESULTADO: smoke-publico passou em $FRONT (API $API)"
exit 0
