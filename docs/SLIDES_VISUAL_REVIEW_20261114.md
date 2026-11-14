# BRASPACE — review visual e factual dos sete slides, 14/11/2026

**Fonte verificada:** [Google Slides oficial da equipe](https://docs.google.com/presentation/d/1Nnv1C1XU2SQCmnPam1REc5_2Wix_Uo4x3u5Smmk3tLs/edit). Exportação PDF Google Drive: 7 páginas, sem criptografia, 840.870 bytes, página 720 × 405 pt. A rota de exportação PDF também passou sem login no [CI de links públicos #43618268519](https://github.com/Braspace/Braspace/actions/runs/43618268519), com SHA-256 `09e70cdd9fa3842e8895b332cc555d96b977f5f57d62709bb186782de7711a9e`.

A inspeção abaixo compara visualmente as sete páginas renderizadas com o estado **comprovado** do repositório em 2026-11-14. Não significa que o material foi alterado, aprovado pela equipe ou enviado à NASA.

## Achados por slide

| Slide | Situação | Achado e reparo recomendado |
|---|---|---|
| **1 — Capa** | Adequado visualmente | Boa identidade BRASPACE. Manter referência explícita ao Lunar Landing Site Navigator e Polo Sul. |
| **2 — O desafio** | Adequado como contextualização | Diagrama corretamente separa sombras e visibilidade geométrica da Terra. Garantir créditos e explicar que visibilidade geométrica não garante link RF. |
| **3 — Experiência de comparação** | **ALTO: demo ilustrativa** | A imagem contém três lugares e scores **41/100, 29/100, 99/100**. São demonstrativos, não métricas derivadas das séries NASA. Manter um rótulo MUITO visível **“ILUSTRATIVO / DADOS SINTÉTICOS — NÃO É RANKING REAL”**, ou substituí-los por screenshot do MoonProof real e seu estado de cobertura: apenas Connecting Ridge disponível no app público publicado. Não usar esses números como pontuação científica. |
| **4 — Engenharia** | **ALTO: estado desatualizado** | Diagrama mostra o Rust como “STANDALONE” e integração Go↔Rust com linha tracejada. Atualmente o adaptador Go/Rust, testes de integração, computador de bordo e relatórios já existem em `main`; integrar o desenho/legenda com prova de CI, sem alegar precisão física independente. PostgreSQL é opcional, não pré-requisito para o demo público do AppDeploy. |
| **5 — Método científico** | **ALTO: estado desatualizado** | Título enquadra o fluxo terreno→visibilidade como futuro. O PR científico [#75](https://github.com/Braspace/Braspace/pull/75) já produziu uma **série preliminar de 72 h** com NASA LOLA + JPL/NAIF para **Connecting Ridge**; o app público a exibe. Os cálculos existem para UM sítio, mas ainda **não possuem validação geométrica/efemérides independente**. Atualizar o texto e separar “implementado” de “pendente”. |
| **6 — Resultados e integridade** | **CRÍTICO: afirmação incorreta** | O rodapé diz em inglês **“NO NASA DATA IS YET INTEGRATED INTO THE MODEL”**. Isso ficou falso com os pipelines comprovados em [PR #75](https://github.com/Braspace/Braspace/pull/75) e o snapshot público. Substituir por **“REAL NASA LOLA + JPL/NAIF INPUTS INTEGRATED FOR CONNECTING RIDGE ONLY — PRELIMINARY / UNVERIFIED — NOT FOR FLIGHT OR LANDING DECISIONS.”** Manter lista de dívidas: outras localizações, teste independente, incerteza, modelo de painéis, link RF e comunicação. |
| **7 — Impacto / equipe** | **MÉDIO: falta chamada pública** | Indicar o link de demo HTTPS real, a URL acessível dos slides e, caso pertinente, um QR com destino verificado. Verificar nomes/participação por todos os seis integrantes; não inferir registro NASA da imagem. |

## Problema adicional de acessibilidade

As sete páginas exportadas são **slides rasterizados em imagens**: o `pdftotext` não extrai conteúdo selecionável de nenhuma página e o outline nativo da apresentação não contém texto estruturado. Isto **não torna o documento inválido**, mas prejudica busca, acessibilidade de leitores de tela, revisão de citações e tradução. Não presumir que os textos de figuras contam como conteúdo acessível. Preferir na revisão final caixas de texto nativas e descrições/links verdadeiramente acessíveis em vez de texto preso em imagem.

## Texto editorial recomendado para o slide de integridade (6)

**Título sugerido:** “Real NASA inputs. Transparent limits.”

**IMPLEMENTADO / COM EVIDÊNCIA:**
- NASA LOLA 80 m DEM com SHA-256 conferido; Connecting Ridge, observador 2 m.
- JPL/NAIF SPICE, 72 amostras horárias, Sun/Earth centers no referencial lunar documentado.
- Classificação geométrica por horizonte (Go/Rust), análise de blackout, riscos, timeline e relatório educacional.
- Aplicação HTTPS pública com aviso `UNVERIFIED` e link verificável.

**NÃO VALIDADO / AINDA PENDENTE:**
- Comparação independente com referência JPL Horizons/control points, tolerâncias e orçamento de erro.
- Série real para os demais sítios e ranking defensável; pipeline de 3 sítios permanece em PR separado.
- RF/DSN, eclipses, disco solar, power/thermal, geometria de pouso e segurança de voo.

**Rodapé:** “PRELIMINARY NASA/JPL-SOURCED EDUCATIONAL MODEL · NOT SCIENTIFICALLY CERTIFIED · NOT A LANDING RECOMMENDATION.”

## Links que podem ser inseridos no slide final

- Public MoonProof: https://braspace-moonproof-mxyowk.v2.appdeploy.ai/
- Seven-slide deck: https://docs.google.com/presentation/d/1Nnv1C1XU2SQCmnPam1REc5_2Wix_Uo4x3u5Smmk3tLs/edit
- Reprodutibilidade dos links: https://github.com/Braspace/Braspace/actions/runs/43618268519
- NASA Space Apps prazo oficial: https://www.spaceappschallenge.org/2026/ — **15/11/2026 23:59, horário local**.

**Handoff:** @lisanogueira (texto/slide/UX), @Ninzinhu (QA e links públicos), @joeljato (limites científicos), @gustavofullstack (evidência técnica/submissão). **NÃO declarar apresentação revisada/corrigida ou NASA submetida** até verificação posterior do deck nativo e do portal.
