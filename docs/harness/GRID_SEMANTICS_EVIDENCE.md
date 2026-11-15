# Grade da série: mesma semântica em todos os endpoints (15/11/2026)

Item P0-A do harness: duração ou início fora da grade da série nunca são expandidos nem arredondados em silêncio, em sky, compare, delay, evaluate, report e navigation.

## Como foi medido

- Produção pela borda: `https://braspace-moonproof.almeida-me.workers.dev`.
- API `build_commit` `2b62474` (release `v2026.11.15-prod-2b62474`).
- Local `connecting-ridge`, cuja série tem `step_seconds` 3600 a partir de 2025-01-01T00:00Z.
- Só chamadas de cálculo (GET e POST que não gravam). Corpos tirados do próprio front (`cockpit-model.js`, `scenario-data.ts`).

## Resultado

| Endpoint | 24 h alinhado | 0,5 h | 24,5 h | início 00:30 |
|---|---|---|---|---|
| `GET /api/sites/{id}/sky` | 200 | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` |
| `POST /api/compare` | 200 | 200, local com `data_status: GRID_NOT_ALIGNED` | 200, idem | 200, idem |
| `POST /api/scenarios/delay` | 200 | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` |
| `POST /api/onboard/site-evaluate` | 200 | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` |
| `POST /api/onboard/site-report` | 200 | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` | 422 `GRID_NOT_ALIGNED` |
| `POST /api/onboard/navigation` | 200 | 422 `INVALID_INPUT` | 200 | 200 |

## Leitura

- **compare** é multi-local: responde 200 e marca cada local com `data_status: GRID_NOT_ALIGNED` e o motivo ("requested start and duration must match the 3600-second sample grid exactly"). Não devolve números expandidos. A semântica é a mesma, por local.
- **navigation** não lê a série horária: calcula a geometria na hora, com `step_minutes`. A grade da série não se aplica. 0,5 h com passo de 60 min é recusado por ser menor que um passo.
- **Delay** exige `constraints`. Sem elas, responde 422 `CONSTRAINTS_REQUIRED` antes de olhar a grade.

## Também verificado nesta rodada

- Contrato do Cockpit (`scripts/cockpit-backend-contract.mjs`, `BRASPACE_EXPECT_COMMIT=2b62474…`) pela borda: 49/49 PASS.
- `/api/vector/status`:
  - `state: index_ready`
  - `audited_count` 4
  - `legacy_unverified_count` 10, linhas antigas sem manifesto, preservadas e não servidas
- Os 14 GET do OpenAPI corretos pela borda:
  - 200 JSON
  - o asset da camada em `image/jpeg`
  - rota desconhecida em 404 JSON
