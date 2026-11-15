# Decisões (ADR curtos), harness Braspace

## ADR-001: Worker publicado via API com keep_assets

- **Contexto:** o Worker `braspace-moonproof` serve assets estáticos e o proxy de API. Publicar sem preservar os assets derruba o front.
- **Decisão:** publicar a nova versão do Worker pela API, com `keep_assets`, mantendo os assets da versão anterior.
- **Consequência:** a versão nova troca só o código. Rollback possível para `2361697f` (só assets) ou `fb7a8e7b`.

## ADR-002: `redirect:"manual"` no proxy

- **Contexto:** o workerd rejeita `redirect:"error"` com TypeError. Cada chamada proxied virou 502 em produção (commit `f3364c6`).
- **Decisão:** usar `redirect:"manual"` no `fetch` do proxy e recusar 3xx com `permittedResponse`.
- **Consequência:** redirecionamentos continuam bloqueados, sem depender de `redirect:"error"`.

## ADR-003: Entrada do Worker só com default export

- **Contexto:** o workerd rejeita exports nomeados na entrada do Worker (commit `5d2e754`).
- **Decisão:** `deploy/cloudflare/moonproof-worker.mjs` exporta apenas `default`. Helpers ficam em `moonproof-proxy.mjs`.
- **Consequência:** testes de contrato importam o módulo auxiliar. A entrada fica mínima.

## ADR-004: Navigation exige `start_utc`, `duration_hours` e `step_minutes`

- **Contexto:** um default "agora" torna o cálculo não reprodutível: o mesmo pedido dá resultados diferentes em momentos diferentes.
- **Decisão:** `POST /api/onboard/navigation` exige `start_utc`, `duration_hours` e `step_minutes`. Não há default de "agora".
- **Consequência:** o cliente sempre informa a janela. **Pendência:** `api/openapi.json` ainda marca esses campos como opcionais. Ver `STATUS.md`.

## ADR-005: Cockpit como painel único

- **Contexto:** havia várias telas concorrentes para o mesmo fluxo.
- **Decisão (ordem do Gustavo, 15/11):** o Cockpit é o painel único. As demais telas são arquivadas, não apagadas.
- **Consequência:** nada é removido do histórico. Telas antigas ficam fora da navegação.

## ADR-006: Nave Artemis procedural em Three.js

- **Contexto:** um asset 3D externo traz custo de licença, peso e dependência de terceiros.
- **Decisão:** a nave Artemis é gerada por código em Three.js, sem asset externo. É a mesma usada no Landing Lab.
- **Consequência:** sem arquivo binário no repositório. A aparência depende do código de geração.
