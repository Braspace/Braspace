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

- Imagem: `62bf446e386d`, publicada às 11:35 BRT (14:35Z).
- Backup antes do deploy: `backup/pre-62bf446e386d-20261115-143519.dump`.
- Rollback: `IMAGEM=20882693109b`.

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
