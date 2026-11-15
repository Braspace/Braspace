# Evidência do backend MoonProof (Go + Rust + PostgreSQL/pgvector)

Branch `qa/moonproof-backend-evidence` (a partir do PR #321). Worktree `~/repos/Braspace-s23`. Data: 2026-11-15. Ambiente 100% local (API em :18282, proxy em :15499, Postgres descartável em :55432). Dados sintéticos e preliminares: nada aqui é validação científica.

## Comandos exatos
```
cd api && go build -o ~/braspace-qa/s23-api .
DATABASE_URL=<dsn local, senha lida de arquivo> BRASPACE_VECTOR_ENABLED=1 BRASPACE_VECTOR_MODEL_ID=braspace-lexical-384-v1 \
  RUST_ENGINE_BIN=~/braspace-qa/target/release/braspace-lunar-engine LISTEN_ADDR=127.0.0.1:18282 ~/braspace-qa/s23-api
BRASPACE_API_PORT=18282 BRASPACE_WEB_PORT=15499 node web/dev-server.mjs
api migrate (x2) / api verify
cd api && go vet ./... && go test -count=1 ./...
TEST_DATABASE_URL=<dsn> TEST_VECTOR_DATABASE_URL=<dsn> go test -count=1 ./...
cd engine && CARGO_TARGET_DIR=~/braspace-qa/target cargo test --locked --all-targets
BRASPACE_E2E_API_BIN=~/braspace-qa/s23-api BRASPACE_E2E_RUST_BIN=~/braspace-qa/target/release/braspace-lunar-engine node scripts/fullstack-e2e.mjs
```
O executor da matriz (script Node com `fetch`, latência por `performance.now()`) está fora do repositório. Os resultados completos estão em `API_MATRIX.csv`, com 87 requisições por lane.

## 1. Inventário (api/openapi.json): 22 operações
GET /api/health, /api/sites, /api/sites/{id}, /api/layers, /api/layers/{id}, /api/layers/{id}/asset, /api/sites/{id}/media, /api/sites/{id}/sky, /api/openapi.json, /healthz, /readyz, /v1/capabilities, /api/vector/status.
POST /api/compare, /api/scenarios/delay, /api/onboard/site-evaluate, /api/onboard/site-report, /api/onboard/report, /api/onboard/navigation, /api/onboard/evaluate, /v1/visibility, /api/vector/search.

## 2. Matriz de API (direto Go :18282 e proxy :15499)
- Casos felizes e 404 documentados: 30 requisições, 30 com status e content-type idênticos nas duas lanes. 22/22 operações cobertas com 200. Status e campos obrigatórios conferem com o schema do OpenAPI (coluna `schema_ok`, 0 divergências).
- Relatórios `/api/onboard/report` e `/api/onboard/site-report`: `text/html` nas duas lanes, conforme o contrato.
- O proxy nunca devolveu HTML de SPA para `/api/*`, `/healthz`, `/readyz` ou `/v1/*`. Inclusive em `/api/inexistente` (404 text/plain) e em tentativa de traversal (404).
- Latência: direto 0 a 37 ms (maior: primeiro `/api/health`), proxy 1 a 7 ms. Tudo dentro da casa dos milissegundos.
- Adversariais (9 POSTs x 5 casos):
  - JSON inválido -> 400 em todos.
  - `text/plain` -> 415 em todos.
  - Corpo de 2 MiB -> 413 em todos.
  - GET em rota POST -> 405 em todos.
  - PUT -> 405 (proxy e direto).
- `/api/onboard/report` erra em `text/plain` (contrato legado, já documentado nos testes). Os demais erram em JSON.
- `scripts/fullstack-e2e.mjs`: `PASS fullstack: 22/22 OpenAPI operations`.

### Achado menor: PUT via proxy
Em 1 de 9 PUTs da primeira rodada e em 3 de 9 da segunda, o `fetch` do Node falhou (provável reset de conexão) logo depois do caso de 2 MiB. Hipótese não confirmada: o proxy responde 405 sem consumir o corpo. Em 20 PUTs isolados via curl e 20 via `fetch`, 0 falhas. Não é bug do Go. É uma ressalva do proxy de desenvolvimento (`web/dev-server.mjs`), não corrigida.

## 3. PostgreSQL
Ver `DB_MIGRATION_RUNBOOK.md`: `migrate` idempotente (2x), `verify` ok, `data_source=postgres`, queda e recuperação sem reinício da API e sem crash. Limitação: o readiness não detecta a queda do banco (snapshot em memória).

## 4. pgvector
- `/api/vector/status` -> `enabled:true, available:true, dimension:384, model_id=braspace-lexical-384-v1`. Busca válida -> 200 (limit 3), campos `source_ref/title/source_url/sha256/similarity`.
- Rejeições (iguais nas duas lanes): dim 383 e 385 -> 422; vetor zero -> 422; `NaN` literal -> 400; limit 11 -> 422; model errado -> 422; chave extra -> 400; JSON com lixo no final -> 400; corpo > 16 KiB -> 413; content-type errado -> 415; método errado -> 405.
- Sobre `ingest_manifest_sha256`: a coluna não existe no schema real (ver runbook), então o cenário de nulo não é aplicável aqui. A fonte auditada é o par `sha256` + `source_url` https, ambos NOT NULL com CHECK.
- Observação: chave duplicada (`"limit":3,"limit":4`) é aceita (a última vence, padrão do `encoding/json`). O OpenAPI não consegue expressar isso. Documentado, sem correção.

## 5. Testes
| Suíte | Resultado |
|---|---|
| `go vet ./...` | sem avisos |
| `go test ./...` (sem DB), testes e subtestes | 296 passou, 0 falhou, 23 pulou (apos merge de origin/main 85ca385 e 5 testes novos) |
| `go test ./...` com `TEST_DATABASE_URL` e `TEST_VECTOR_DATABASE_URL` no banco descartável | 312 passou, 0 falhou, 7 pulou (pulos: motor Rust real/serie real/validacoes Python, sem RUST_ENGINE_BIN ou dados); nenhum schema test_* restou |
| `cargo test --locked --all-targets` | 24 passou (3 + 18 + 3), 0 falhou, 0 ignorado |
| `scripts/fullstack-e2e.mjs` | 22/22 operações PASS |

Os testes de DB usam um schema próprio por teste e o removem no fim. Verifiquei que não restou nenhum. Os 2 pulos com DB: `TestRealEngineAgreesWithContract` (pulava sem `RUST_ENGINE_BIN`; rodando com ele, PASS) e `TestRealSiteRustEngineAgrees` (sem série real neste checkout). Contagens de Go incluem subtestes.

## 6. Bugs
### Corrigido: `limit` explícito 0/null e `null` dentro de `vector` aceitos (BUG-VEC-01)
- Contrato: `limit` tem `minimum: 1` e `vector` é um array de números.
- Reprodução (antes): `POST /api/vector/search` com `"limit":0` ou `"limit":null` devolvia 200 com 5 resultados, porque 0 era confundido com "omitido". Um elemento `null` no vetor virava 0.0 e era aceito (200).
- Teste RED: `api/vector_strict_test.go` falhou em 3 subcasos (limit zero, limit null, vector null element) antes da correção.
- Correção: `api/vector.go` (`parseVectorRequest`) agora distingue "ausente" (padrão 5) de 0/null explícitos (422 `INVALID_LIMIT`) e rejeita null em elementos do vetor (422 `INVALID_VECTOR`).
- GREEN: o mesmo teste passa; as suítes completas acima foram rodadas depois da correção. A matriz foi rodada de novo contra o binário corrigido: limit0 -> 422, limit null -> 422, null no vetor -> 422, nas duas lanes.
- `openapi.json` não mudou, porque o contrato já exigia `minimum: 1`.

### Apenas documentados (não corrigidos)
1. `/readyz` e `/api/health` não refletem a queda do Postgres (dados servidos de snapshot em memória). Só o vetor sinaliza. Mudança de design.
2. `api migrate` imprime `null` quando nada foi aplicado (cosmético).
3. `source_manifest` fica vazio quando `ingest` roda sem `-manifest`.
4. O comando de subida sugerido não habilita o vetor.
5. PUT via proxy com reset intermitente após corpo grande (ver acima).

## Bloqueios
Nenhum bloqueio. Não houve chamada à API pública. A suíte com `TEST_*` não foi verificada contra uma instância Postgres diferente da descartável.


## Atualização 2026-11-15 (squad backend 2)
Merge de origin/main (85ca385) sem conflitos. `go vet ./...` sem avisos; `cargo test --locked --all-targets` 24 passou (3+18+3).

### Corrigido
1. Readiness honesta. `/api/health` agora traz `store: {source, status: ok|degraded, last_ping_ms}`. Com store postgres, a API faz ping (pool lazy, 1 conexão, timeout 500 ms). Falha => `store.status=degraded` e `status=degraded`, mas HTTP 200: o catálogo em memória continua servindo. `/readyz` continua 200 (decisão: o serviço serve da memória). Teste: `api/health_store_test.go` (RED: não compilava, campo `storePing` inexistente; GREEN: 4 testes). `openapi.json` ganhou `Health.store`; testes de contrato passam. Evidência ao vivo com Postgres real: ok (ping 5 ms) -> `docker stop` => degraded 200 (readyz 200) -> `docker start` => ok, sem reiniciar a API.
2. `migrate` sem nada a aplicar imprimia `null`; agora `[]`. Teste: `api/migrate_empty_test.go` (RED: "imprime null"; GREEN). Requer TEST_DATABASE_URL.

### Apenas documentado
3. Chave duplicada em JSON: o contrato não pretende rejeitar (não existe `api/internal/jsoncontract`; o OpenAPI não menciona; `DisallowUnknownFields` só cobre chaves desconhecidas). Continua aceito, a última vence. Se o produto quiser rejeitar, é decisão de contrato (exigiria tokenizar o JSON em `decodeJSON` e `parseVectorRequest`).
4. Reset de PUT via proxy: REPRODUZIDO. `repro/put_after_2mib.mjs` (9 rotas POST x 5 casos x 20 rodadas, fetch keep-alive): proxy 30/180 PUT com `ECONNRESET`, Go direto 0/180. Causa: o dev-server responde 413 (relay do Go) ou 405 antes de ler o corpo; o restante dos 2 MiB fica no socket keep-alive e a requisição seguinte (PUT) é reiniciada. Não é bug do Go. Sugestão de patch (NÃO aplicado, `web/` intocado): `repro/dev-server-drain.patch` (`req.resume()` e `res.shouldKeepAlive=false` quando `!req.complete`, e no 405). Com o patch numa cópia: 0/180 ECONNRESET.
5. Ingestão auditada. Comando completo (banco descartável, senha lida de arquivo):
```
export DATABASE_URL="postgres://braspace:$(cat ~/braspace-qa/.pgpw)@127.0.0.1:55432/braspace?sslmode=disable"
cd api && go build -o ~/braspace-qa/s23-api .
~/braspace-qa/s23-api ingest -manifest ../data/manifest.json   # migra, carrega catálogo/séries e source_manifest
~/braspace-qa/s23-api vector-ingest                            # CLI não aceita manifest; só metadados (10 upserts)
~/braspace-qa/s23-api verify -manifest ../data/manifest.json   # ok:true, problems:[]
```
Executado: `source_manifest` passou de 0 para 1 linha (`manifest_sha256` 15d80e11...). `vector-ingest` não usa manifest (limitação do CLI).
