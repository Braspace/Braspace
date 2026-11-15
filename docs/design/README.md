# docs/design

| Arquivo | O que é | Fonte de verdade |
|---|---|---|
| `DESIGN_TOKENS.json` | Tokens em JSON para ferramentas (Flow, Figma, Omni) | **gerado** de `web/ds/tokens.css` por `node web/scripts/tokens.mjs`; `web/tests/design-tokens.test.mjs` falha se divergir |
| `SCREEN_MATRIX.csv` | Superfície × viewport: rota no HEAD, captura de baseline (pacote visual 15/11), conceito Flow, captura depois, status | `coverage.csv` do pacote visual + rotas do código |

As fichas por tela continuam em `web/moonproof/designer/*.designer.mds` e `web/studio/designer/`.

## Estado da matriz (base b899730)
- 54 superfícies (as 53 do inventário + a aba `navegacao` do bordo, descoberta no código) × 4 viewports = 216 combinações.
- Baseline: 197 capturadas, 5 capturadas com falha (Moon HD em loading negro), 10 pendentes; a aba `navegacao` não tem nenhuma captura.
- Conceitos Flow gerados: 0. Capturas depois: 0. Nenhuma combinação está `SCREEN_VERIFIED`.

## Google Flow (conferido em 15/11/2026, Chrome)
- Projeto `0f909245-…` acessível, plano PRO, sem mídias.
- Modelos de imagem no seletor: Nano Banana Pro, Nano Banana 2 Lite, Nano Banana 2.1. Não existe "Nano-Banana-Pro-2.1". Vídeo: Omni 1.2 Flash.
- Agente configurado com "Confirmar antes de gerar: Nunca", padrão 16:9 × 4 saídas. Saldo de créditos não aparece na tela. Nada foi gerado.
