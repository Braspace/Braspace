# Front end do computador de bordo (simulador educacional)

Interface estática para o endpoint `POST /api/onboard/evaluate` (`api/onboard/onboard.go`).
Usa **dados sintéticos**. Não é software de voo e não é ferramenta aprovada pela NASA.

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Layout, estilos e formulário |
| `sim.js` | Gerador sintético de visibilidade do Sol e da Terra (mesmo modelo do protótipo) |
| `request.js` | Montagem e validação do pedido, com os mesmos limites da API |
| `app.js` | Editor de cenários, chamada à API, resultado e gráfico de carga |
| `test/front.test.mjs` | Testes unitários e teste de integração opcional |

## Como rodar

1. Suba a API Go em `127.0.0.1:8080` (com Docker `docker compose up --build -d`, ou `go run .` em `api/`).
2. Na raiz do repositório, rode o servidor do front (o mesmo de todo o `web/`):

   ```sh
   BRASPACE_API_PORT=8080 BRASPACE_WEB_PORT=8090 node web/dev-server.mjs
   ```

3. Abra `http://127.0.0.1:8090/onboard/` e clique em **Simular**.

O `web/dev-server.mjs` serve os arquivos e encaminha `/api/*`, `/healthz`, `/readyz` e `/v1/*` para a API Go, o que evita CORS: a API não envia cabeçalhos CORS.

## Testes

```sh
node --test web/onboard/test/
# com a API no ar:
ONBOARD_API_URL=http://127.0.0.1:8080 node --test web/onboard/test/
```

## Limitações conhecidas

- O modelo sintético de Sol e Terra tem ciclo de cerca de 29,5 dias. Janelas curtas, como 72 h, podem ficar sem luz em qualquer lugar sintético. O padrão da tela é 720 h com passo de 120 min.
- A visibilidade é gerada por um modelo matemático, não por efemérides nem por DEM LOLA.
- Os valores de bateria e de painel são premissas do cenário, não parâmetros de hardware.
- A API marca todos os resultados como `UNVERIFIED_INPUTS`. A interface mostra isso no topo.
- A interface não tem tela de dashboard completa (mapa, 3D, histórico). Eles estão no protótipo em `docs/prototype/`, e ficaram de fora deste primeiro corte.
