# Handoff, como retomar

Horas em BRT (America/Sao_Paulo). Estado de referência: `STATUS.md`.

## Gate de CI (portão real)

GitHub Actions está parado por cobrança da organização. Rodar `scripts/ci-local.sh` em um destes hosts:

- Harness: `ssh root@100.119.13.50`, depois `cd /docker/braspace` e `scripts/ci-local.sh`.
- EXO-X1: `ssh gustavo_edc@100.80.219.7`, depois `scripts/ci-local.sh` no checkout do branch.

## Deploy do backend (troca de imagem com backup)

1. Gerar backup do banco antes de trocar: `backup/pre-<IMAGEM>-<AAAAMMDD-HHMMSS>.dump`.
2. Trocar a variável `IMAGEM` para a nova imagem e subir o serviço na harness.
3. Conferir `/healthz` e `/readyz`, e a lista de GET em `API_MATRIX.csv`.
4. Rollback: `IMAGEM=<imagem anterior>` e subir de novo. Imagem atual: `2b6247498db4-sha` (main `2b62474`, 16:39Z). Anteriores: `41dedbb4705b-sha`, `ad83cfe7517c-sha`, `62bf446e386d`. Construir sempre com `BRASPACE_GIT_SHA`, ensaiar a migração num dump atual e validar com `BRASPACE_EXPECT_COMMIT` (ver STATUS.md).

## Deploy do Worker

Duas opções:

- Wrangler pela sessão PWA.
- API com `keep_assets`, conforme ADR-001. Sem `keep_assets`, os assets somem.

Após publicar, conferir a borda com o mesmo curl da matriz (`API_MATRIX.csv`).

## Rollbacks

- Worker: `2361697f` (só assets) ou `fb7a8e7b`.
- Backend: `IMAGEM=41dedbb4705b-sha`, restaurando `backup/pre-2b6247498db4-sha-20261115-163914.dump` se for preciso desfazer o estado do pgvector.

## Coordenação entre sessões

- **Sessão "Moonproof PWA integração e UI":** dona de backdrop, artemis, `cockpit.tsx` e `wrangler`.
- **Sessão MAC (Opus):** dona de merges, backend, painéis recolhíveis e documentação.

Antes de editar um arquivo de outro dono, avisar pela fila de coordenação. Não sobrescrever trabalho de outra sessão.

## Pendências abertas

- Alinhar `api/openapi.json` com ADR-004 (campos obrigatórios de navigation).
- Reverificar smoke 35/35, `vector/search` e rotas de erro (404, 403, 422), que não foram refeitos nesta rodada.
- Fechar PR #319 e PR #323.
