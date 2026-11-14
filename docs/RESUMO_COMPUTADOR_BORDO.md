# Resumo para o time: computador de bordo

Data: 2026-11-14. Este resumo é para revisão. Nada aqui é validação científica.

## O que existe

- **Interface de cockpit** (`web/onboard/cockpit.html`): 12 painéis (entrada, geometria, horizonte, janelas, energia, vida, replanejamento, visual, sensibilidade, registro, lançamentos, status). Todo dado de Sol, Terra, horizonte e luz é **sintético** e está marcado assim.
- **Cálculo de energia e riscos**: feito pela API Go já em `main` (`POST /api/onboard/evaluate`, PR #70). A interface só envia o cenário e mostra o resultado.
- **Testes**: 24 testes de modelo, validação de pedido e integração com a API (`node --test test/*.mjs`).
- **Documentação**: checklist de 75 funcionalidades, alinhamento com os gates G1–G7 de `SCIENTIFIC_ACCEPTANCE.md`, registro de fontes NASA.

## O que não existe

1. **Dado NASA em uso.** O `LDEM_80S_80M.IMG` foi escolhido e conferido por hash na PR #71, que ainda está em rascunho. Nenhum código lê o arquivo.
2. **Horizonte real.** O horizonte da interface é uma senoide. O cálculo por raio no DEM não foi feito.
3. **Efemérides reais.** Sol e Terra são senoides. Não há SPICE nem validação contra JPL Horizons.
4. **Geometria no backend.** Hoje a geometria roda no navegador. O `architecture.md` manda que ela fique no Rust ou no Go.
5. **Uma interface só.** Há o cockpit (não publicado) e a interface da PR #73. Falta decidir.
6. **Escopo.** Combustível, alimentação, pressurização e O2 não estão na lista do desafio. A PR #53 também adiciona consumíveis. Falta decidir quem fica com isso (issue #7).
7. **Testes de interação.** Não foram feitos cliques reais em CALCULAR, no controle deslizante, em REGISTRO e em COPIAR.
8. **CI local.** O CI do PR #45 não foi rodado localmente (issue #33).
9. **Inglês e declaração de IA.** Pendentes (12.6 e 12.8).
10. **Links públicos e deck.** Não verificados em aba anônima (issue #10 e #32).

## Decisões pedidas ao time

- Qual interface fica: o cockpit ou a PR #73?
- Combustível e suporte de vida entram no MVP?
- Contexto de lançamentos (11.x) entra?
- Quem lê o `LDEM_80S_80M.IMG` e implementa o horizonte?

## Estado do repositório

- Branch `feature/onboard-frontend`, worktree separada, a partir de `main`.
- Contém o cockpit, a atualização do checklist e a atualização do registro de fontes.
- Não foi publicado.
