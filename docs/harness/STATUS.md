# Status da harness, 15/11/2026

Horas em BRT (America/Sao_Paulo). Horas UTC entre parênteses quando informadas em Z.

## Repositório

- `main`: `a405aaa` (Merge PR #315, `fix/worker-proxy-contract-regressions`).
- PR #312 e PR #315 mesclados. Commits confirmados no histórico: `f3364c6` (`redirect:"manual"`) e `5d2e754` (entrada do Worker só com default export).
- Branch de trabalho deste documento: `docs/harness-status-20261115`, a partir de `origin/main`.

## Worker Cloudflare `braspace-moonproof`

- Versão: `e651c1fa`, publicada às 11:21 BRT (14:21Z).
- Proxy same-origin para `/api`, `/v1`, `/healthz` e `/readyz`; assets mantidos.
- Rollback: `2361697f` (somente assets) ou `fb7a8e7b`.

## API em produção (harness, `/docker/braspace`)

- Imagem: `5f06ee30aa2c-sha` (main `5f06ee3`, #404), publicada às 14:47 BRT (17:47Z) com `swap-api.sh`, sem downtime.
- Backup antes do deploy: `backup/pre-5f06ee30aa2c-sha-*.dump`, gerado pelo próprio script.
- Rollback: `./swap-api.sh 2b6247498db4-sha`. Depois disso, `41dedbb4705b-sha`.

## Verificado ao vivo pela borda

Medido nesta rodada com curl (ver `API_MATRIX.csv`):

- Os 13 GET operacionais do `api/openapi.json` respondem 200 no direto e na borda. O status anterior citava 12; a contagem real é 13.
- `POST /api/onboard/navigation` responde 200 no direto e na borda.

Informado pelo responsável e **não reverificado nesta rodada**:

- `vector/search` 200 com 384 dimensões e 422 com 3 dimensões.
- Rota desconhecida retorna 404 em JSON.
- Origem de terceiros retorna 403.
- Smoke da sessão PWA: 35/35.

## Em andamento

- PR #319: Lua interativa e pins dos locais.
- PR #323: contrato do navigation.
- Nave Artemis 3D.
- Painéis recolhíveis.

## Bloqueio

- GitHub Actions sem execução por cobrança da organização.
- O portão real é `scripts/ci-local.sh`, rodado na harness ou no EXO-X1.

## Pendências

- `api/openapi.json` ainda marca `start_utc`, `duration_hours` e `step_minutes` como opcionais em `/api/onboard/navigation` (só `lat` e `lon` são obrigatórios). A decisão em `DECISIONS.md` exige os três. Alinhar o contrato e o código antes de fechar o PR #323.
- O caminho do navigation é `/api/onboard/navigation`, não `/api/navigation`.

## Deploy da API `ad83cfe7517c` — 15/11/2026 12:47 BRT (15:47Z)

Feito pela sessão do #296 com autorização do Gustavo. O integrador MAC estava fora do ar.

- **Código:** main `ad83cfe` (#345). Inclui `/api/health.store` (`ok`/`degraded`, `last_ping_ms`), `vector/search` rejeitando `limit` 0/null com 422 e `migrate` imprimindo `[]`.
- **Imagem:** `braspace-api:ad83cfe7517c` (`14fc2b6ae3da`, alvo `release`), construída no EXO-X1 e carregada com `docker save | docker load`. Smoke local com Postgres: `store.status=ok`.
- **Backup:** `backup/pre-ad83cfe7517c-20261115-154625.dump` (2,8 MB, 9 tabelas, checado com `pg_restore -l`) e `backup/env-antes-ad83cfe7517c-20261115-154625` (permissão 600).
- **Subida:** `.env` com `IMAGEM=ad83cfe7517c`, depois `docker compose up -d` (`ingest` → `vector-ingest`, 10 upserts → `api` healthy).
- **Rollback:** `IMAGEM=62bf446e386d` no `.env` e `docker compose up -d`. A imagem anterior continua no host.


Smoke pós-deploy, direto e pela borda do Worker:
- `/api/health`: 200, `data_source: postgres`, `store.status: ok`, 16 locais, 7 com série.
- `/readyz` e `/api/sites`: 200.
- `vector/search` com `limit: 0`: 422.

Matriz `web/browser/route-matrix.mjs` em produção (16 páginas × 6 tamanhos), Worker `3f1b9c03` (main `acbd5d6`):
- Antes deste deploy, 96/96 sem WebGL e 96/96 com GPU.
- Depois, 95/96 em cada trilha. A única falha de cada uma foi `net::ERR_NETWORK_CHANGED` ao baixar o three.js de `cdn.jsdelivr.net`: a rede do host de teste oscilou, não é defeito da aplicação.

Risco anotado: o three.js vem do CDN jsDelivr (CSP `script-src`). Se o CDN falhar, a cena 3D cai no poster. Vendorizar o three.js em `web/vendor/` eliminaria essa dependência externa; ainda não foi feito.

## Re-stamp da API `ad83cfe7517c-sha` — 15/11/2026 12:53 BRT (15:53Z), EXO-X1

- **Motivo:** `/healthz` do deploy acima respondia `build_commit: "unknown"` (imagem construída sem `--build-arg BRASPACE_GIT_SHA`). Sem o SHA, o smoke de release não prova qual código está no ar.
- **Código:** o mesmo commit `ad83cfe7517c481adb2b8ba4c0971c9ada0c302a`, sem migração. Build no EXO-X1: `docker build --target release --build-arg BRASPACE_GIT_SHA=<sha completo>` a partir de `git archive`.
- **Imagem:** `braspace-api:ad83cfe7517c-sha`. Só o serviço `api` foi trocado (`docker compose up -d --no-deps api`), healthy.
- **Backup:** `backup/pre-ad83cfe7517c-sha-20261115-155332.dump` e `backup/env-antes-ad83cfe7517c-sha-20261115-155332`.
- **Verificado:** `BRASPACE_EXPECT_COMMIT=ad83cfe7517c… BRASPACE_COCKPIT_PACE_MS=150 node scripts/cockpit-backend-contract.mjs` com 49/49 pela borda do Worker e 49/49 direto na API. `smoke-publico.sh` também passou.
- **Rollback:** `IMAGEM=ad83cfe7517c` (mesmo código, sem SHA) ou `IMAGEM=62bf446e386d`.
- **Regra para os próximos deploys:** sempre construir com `BRASPACE_GIT_SHA=$(git rev-parse HEAD)` e validar com `BRASPACE_EXPECT_COMMIT`. Rodar o contrato com `BRASPACE_COCKPIT_PACE_MS=150`, porque o Traefik limita 20 req/s com burst 40 por IP.

## Deploy do Worker `f26e95fa` — main `6433866` (#365), 15/11/2026 ~13:10 BRT

Feito pela sessão do #296 com autorização do Gustavo. A configuração ao vivo (`3f1b9c03`) foi conferida antes: `compatibility_date` 2026-11-01, binding `ASSETS`, handler `fetch`, igual ao `deploy/cloudflare/wrangler.toml.example`.

- **Origem:** worktree limpa em `origin/main`. Antes do upload, `web/config.js` recebeu `BRASPACE_COMMIT` com o SHA completo, só na árvore de deploy, sem commit.
- **Testes do Worker:** `node --test deploy/cloudflare/*.test.mjs`, 55/0.
- **Rollback:** `npx wrangler rollback 3f1b9c03-0f0c-4988-b9b6-d381dd632cb2` (versão anterior, main `acbd5d6`).

Verificado ao vivo:
- `/config.js` traz o commit;
- `/vendor/three/three.module.min.js` responde 200;
- `/moon-hd/scene.js` importa o three vendorizado;
- `/api/health` responde `store.status: ok`.

Matriz em produção (16 páginas × 6 tamanhos): **96/96 sem WebGL** e **96/96 com GPU**. Não há mais dependência do CDN jsDelivr; o risco anotado no deploy da API está resolvido.

## Deploys da API `41dedbb4705b-sha` e `2b6247498db4-sha` — 15/11/2026, EXO-X1

| Hora (Z) | Imagem | Conteúdo | Backup |
|---|---|---|---|
| 16:16 | `41dedbb4705b-sha` | #363 contratos + vector-ingest sem flag, #369 disc_fraction corrigido; migração `optional-vector.sql` (tabela `source_semantic_ingest_runs`, PK `(source_ref, model_id)`, CHECK norma > 0) | `pre-41dedbb4705b-sha-20261115-161650.dump` |
| 16:39 | `2b6247498db4-sha` | #374: quarentena pgvector e estados (#331+#358), saída exata do Rust (#347), grade do sky (#332) | `pre-2b6247498db4-sha-20261115-163914.dump` |

Procedimento usado nos dois deploys:
1. `ci-local --browser` GREEN no SHA. No último, 12/12, com a faixa de pgvector real.
2. Build com `--build-arg BRASPACE_GIT_SHA=<sha completo>`.
3. Ensaio num pgvector:pg17 local, restaurado de um dump atual da produção: `ingest`, `vector-ingest` e `api`.
4. `docker save | tailscale ssh harness docker load`.
5. `pg_dump`.
6. `IMAGEM` no `.env`, depois `up --no-deps ingest`, depois `vector-ingest`, depois `api`.
7. Contrato com `BRASPACE_EXPECT_COMMIT` e `BRASPACE_COCKPIT_PACE_MS=150` (49/49 pela borda e direto), `smoke-publico.sh` e QA do cockpit em 6 viewports com toque e GPU real.

Estado do pgvector depois do deploy: `index_ready`, 4 auditados com manifesto `8fdc414e…`, 10 legados em quarentena (`legacy_unverified`, não servidos; as linhas não foram apagadas).

## Deploy da API `5f06ee30aa2c-sha` — 15/11/2026 17:47Z, EXO-X1, primeiro com `swap-api.sh`

- **Conteúdo (#404):** códigos de erro alinhados ao enum do OpenAPI.
  - 415 passa a ser `UNSUPPORTED_MEDIA_TYPE` em navigation, onboard e no Worker.
  - Dado sobrando no corpo passa a ser `INVALID_JSON`.
  - `INVALID_INPUT` entrou no enum.
  - Teste Go que garante código ⊂ enum.
  - `tests/` agora roda no stage `test-science`.
- **Procedimento:**
  - `ci-local --browser` com 13/13 GREEN;
  - build com `BRASPACE_GIT_SHA`;
  - `docker load` na harness;
  - `/docker/braspace/swap-api.sh 5f06ee30aa2c-sha`, que faz o dump, roda ingest e vector-ingest (exit 0) e sobe a réplica nova antes de derrubar a antiga.
- **Disponibilidade durante a troca:** um watcher em `/readyz` pela borda, a cada 250 ms, teve **184/184 respostas 200**. No deploy de 16:39Z, com `compose up -d api`, foram alguns segundos de 404.
- **Verificado depois do deploy:**
  - contrato com `BRASPACE_EXPECT_COMMIT=5f06ee3…`: 49/49 pela borda e 49/49 direto;
  - `smoke-publico.sh` passou;
  - 415 responde `UNSUPPORTED_MEDIA_TYPE` direto e pela borda;
  - vector em `index_ready` (4 auditados).
