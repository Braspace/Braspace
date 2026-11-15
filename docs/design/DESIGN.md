# BRASPACE MoonProof: direção visual

Status: **direção escolhida no piloto Flow de 15/11/2026**. Ainda não está implementada.
Tokens: `web/ds/tokens.css` é a fonte; `DESIGN_TOKENS.json` é gerado dele.
Fichas por tela: `web/moonproof/designer/*.designer.mds` e `web/studio/designer/`.

## Decisão: direção híbrida

O piloto gerou 48 conceitos no Google Flow com o modelo Nano Banana Pro: 6 telas × 2 direções × PC/mobile. Uma revisão independente classificou 15 como ACCEPT, 22 como REVISE e 11 como REJECT. A escolha ficou assim:

| Onde | Linguagem |
|---|---|
| Início, Comparar, Bordo, Provas, Aula, Planejar | **A, clareza**: cartões opacos `--c-card` com borda hairline, barra lateral compacta que vira rail de ícones, barra de cenário no topo (local, início UTC, duração, estado da API) |
| Explorar (mapa) e Landing Lab (3D) | **B, terreno como ferramenta**: o mapa ou o 3D ocupa a largura útil; painéis só nas bordas, com fundo opaco por token |
| Mobile (390) | Layout próprio, **sem barra lateral**: resumo do cenário no topo, coluna única, barra inferior com 5 itens (Explorar, Comparar, Bordo, Aula, Provas) + "Mais", detalhes em bottom sheet |
| Tablet (768) | Rail de ícones, cartões em 2 colunas onde couber, side sheet |
| Notebook (1440) | Rail de ícones, inspector mais estreito que em 1920 |

Motivo: na direção B, texto pequeno fica direto sobre o terreno nas telas de dados, o que é ilegível e não pode ser verificado. Na direção A, o terreno, que é a ferramenta, ficava pequeno demais no Explorar e no Landing. No mobile, todos os conceitos de Bordo saíram como desktop encolhido, com barra lateral, e foram rejeitados.

## Regras que valem para conceito e código

1. **Violeta (`--c-sim`) só para SIMULADO**: selo, rótulo e borda. Nunca série de gráfico, rampa ou sobreposição de terreno. Teste: `web/tests/sim-color-reserved.test.mjs`.
2. **Verde tem três papéis distintos**: ação (`--c-jade`), selo VAL com ícone próprio e "melhor entre os locais". Nunca há check verde num resultado negativo como "Nenhum atende a tudo".
3. **Status = ícone + texto**, legível em escala de cinza.
4. **Selo de proveniência vem do dado** (EST/SIM/VAL/N/D). Sem valor, mostra N/D hachurado, nunca 0.
5. **Campos fechados por tela**: só o que existe no contrato e no baseline. Os conceitos inventaram Delta-V, tempo de voo, temperatura, "Viável", "Ótimo" e "System integrity", e nada disso entra.
6. **Rampa de altitude neutra** (cinza para ciano), distinta do sol (amarelo), da Terra (azul) e do SIM (violeta).
7. **Texto sobre terreno só dentro de painel opaco**. Nada abaixo de 18 px diretamente sobre imagem.
8. **Mínimos**: corpo ≥ 14 px no mobile, selos ≥ 11 px, alvos de toque ≥ 44 px (`--touch`). Contrastes medidos em `web/tests/design-tokens.test.mjs`.
9. **pt-BR com acentos completos** e o seletor PT/EN mantido.
10. **Imagem gerada é ilustração**, nunca DEM, efeméride ou medição. Os assets do Flow carregam o rótulo "ilustração".

## Ritmo e grade

Espaçamento 4/8/13/21/34/55 como ponto de partida, não como dogma. Grade de 12 colunas no desktop, 8 no tablet e 4 no mobile. Movimento de 120 a 250 ms, respeitando `prefers-reduced-motion`.

## Rastreabilidade

Prompts, hashes dos 48 conceitos e da rodada 2, crítica completa e galeria antes/conceito ficam no workspace privado `braspace-visual-workspace/`, fora do git: `flow/FLOW_JOBS.jsonl`, `flow/FLOW_RUNS.csv`, `analysis/CRITIQUE_PILOT_01.md` e `reports/gallery_pilot_01.html`. Um conceito aceito não prova runtime; uma tela só fica `SCREEN_VERIFIED` com captura real, testes e a11y no SHA exato.
