# MoonProof — execução da issue #471

Resultado: **parcial; deploy bloqueado**. 48/53 casos aprovados; 5 BLOCKED; 0 FAIL na célula comportamental testada, após os follow-ups óptico e de voo educacional. A matriz adicional de layout tem 33/36 PASS e 3 FAIL.

## Código e método

- Base: `1169dc50e7553931d2c4a9fe552b062c37f43b44` (main reconferida ao final).
- PR #472: `1667a1a27b7148d2a464e9b8c49b91f9459d5f2b`; PR #473: `98a77f7ae1b64fb7cbd0e2492df8b01d74e29357`. Patches aplicados somente à cópia isolada, com correções adicionais descritas abaixo. Branches originais e main não foram modificadas.
- Manifesto SHA-256 dos arquivos web testados: `source-sha256.json`; hash do próprio manifesto: `c345ac0d4db3575b8ef0742110eb972c532b7dc1d4f5437c872281b5a63df3ec`.
- Node 20.20.2 e 22.23.5: **436/436** em cada versão. Lint, TypeScript 5.6.3 e geração oficial TS→JS passaram; `git diff --check` sem erros.
- Playwright com Chromium Headless Shell 141.0.7390.37: suíte existente desktop/mobile PASS; nove painéis do Cockpit, restauração e cena Three.js exercitados. Backend real não requerido nessa execução.
- 53 casos: PT-BR, 1440×900, local API offline, SwiftShader, ponteiro/teclado; fallback sem WebGL 390 px e sessão móvel paralela. QR decodificado de pixels com jsqr 1.4.0/pngjs 7.0.0; queda livre educacional realmente executada, seguida de debrief persistido e repetição. Isso não é um pouso bem-sucedido nem validação de voo.
- Layout: 320/390/768/1024/1440/1920 px, PT-BR/EN, três modos, movimento reduzido, sem WebGL; cliques reais nos cartões. 36 células. **320 px em inglês: entrada com 6 px de overflow**, afetando os três caminhos. CSS de dono da PR #467 foi preservado.
- 57 assets binários obtidos do site público tiveram tamanho/conteúdo conferidos contra o blob SHA Git da base antes de uso. Não foram inventados dados científicos.

## Correções adicionais

- Comparar isola falha por cenário, mantém N/D, continua com cenários disponíveis e permite tentar novamente; regressão 503→Retry exercitada no navegador.
- Falha de carregamento do mapa não deixa uma rejeição não tratada derrubar a tela de Comparar.
- Regras de Planejar são validadas em conjunto; vazio, negativo, não finito e limites físicos inválidos mantêm as regras anteriores. Frações em limites assumidos são distintas de duração fracionária de uma série horária.
- Hash inválido permanece inválido em Comparar, Planejar, Replanejar e quiz; não vira um cenário aprovado com janela padrão. Links de compartilhamento preservam o marcador e valores originais inválidos. Formulário Comparar exige horas inteiras positivas sem arredondar silenciosamente.
- Tour automático somente na entrada do site; ajuda contextual sob demanda, inclusive em Apresentar. Tutorial manual e apresentação sem interrupção exercitados.
- Quiz ganhou Pergunta anterior e Reiniciar atividade; escolhas e estado de resposta são reiniciados.
- Avisos de dados preliminares e limites assumidos ficam visíveis na tabela de Planejar.
- JavaScript regenerado via build oficial; atualizados testes antigos que exigiam texto obsoleto de coleta automática de respostas e que confundiam script auxiliar de tour com o módulo principal da tela.

## Gates ainda bloqueados

- CI local: testes do Worker e sincronismo docs/API passaram; parou em `docker: command not found`. Não houve testes de Go/Rust/Postgres nessa etapa. O comando `go` disponível não é o toolchain Go 1.26.11 do projeto; Cargo também não está instalado.
- Checks GitHub dos heads #472/#473 permanecem queued, sem conclusão. Fila não equivale a PASS.
- Caso 45/P0-01: a #472 mostra a data UTC efetivamente avaliada pela API; **não altera o contrato Go/OpenAPI para reavaliar todos os vizinhos em cada atraso**. Paridade API/cliente na mesma janela exige backend, owner e testes científicos.
- Casos 8 e 50 exigem decisões/implementação de produto: editor de janela em Explorar e contrato de análise de sensibilidade não foram identificados. Casos 49/52 dependem dos endpoints reais.
- A matriz completa dos 53 casos × todas as larguras × PT/EN × sessão × GPU × falhas 404/500/timeout/malformado não foi executada. As 36 células de layout são smoke de navegação/layout, não substituem os 53 comportamentos em cada célula. Também não foi executado axe ou medição de VRAM/GPU física.
- Sem revisão humana/integrador MAC, sem merge, sem Worker version ID, sem deploy ou smoke pós-deploy. Produção não está aprovada.

## 53 casos e evidências

Arquivos citados estão dentro de `Braspace_issue471_evidencias.zip`. Cada caso tem DOM, logs/URL/duração e screenshot antes/depois em `personas/`; os casos 13/21 também possuem follow-up real em `extra/`.

| Caso | Modo | Verificação | Estado | Evidência / limite |
|---|---|---|---|---|
| 1 | explore | Entry: root redirect and three modes | PASS | `personas/1-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 2 | explore | Explore: choose the mode | PASS | `personas/2-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 3 | explore | Tutorial: open, next, back and skip with pointer | PASS | `personas/3-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 4 | explore | Explore: map pin selection | PASS | `personas/4-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 5 | explore | Explore: all analysis layers | PASS | `personas/5-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 6 | explore | Explore: Sun, Earth and terrain controls | PASS | `personas/6-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 7 | explore | Disclosure: Answer, Why and Proof | PASS | `personas/7-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 8 | explore | Explore: date and duration editing | BLOCKED | `personas/8-after.png` — Explore has no date/duration form; alternative window editing is tested in Compare (case 40). Product acceptance needs an owner decision. |
| 9 | explore | Evidence: open and return | PASS | `personas/9-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 10 | explore | Navigation: Compare and Replan preserve mode | PASS | `personas/10-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 11 | explore | Landing Lab: enter through navigation | PASS | `personas/11-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 12 | explore | Landing Lab: pause, resume, keyboard thrust and reset | PASS | `personas/12-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 13 | explore | Landing debrief and replay after touchdown | PASS | `extra/13-after.png` — Independent follow-up on the same unchanged product code; see extra/results.json. |
| 14 | explore | No WebGL: mobile fallback | PASS | `personas/14-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 15 | class | Class Kit: choose teaching mode | PASS | `personas/15-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 16 | class | Class Kit: four steps | PASS | `personas/16-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 17 | class | Class Kit: laptop and phone preview | PASS | `personas/17-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 18 | class | Class Kit: preview layers and keyboard | PASS | `personas/18-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 19 | class | Class Kit: every guidance switch | PASS | `personas/19-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 20 | class | Class Kit: clipboard permission denied fallback | PASS | `personas/20-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 21 | class | Class Kit: scan QR from rendered pixels | PASS | `extra/21-after.png` — Independent follow-up on the same unchanged product code; see extra/results.json. |
| 22 | class | Class Kit: presentation preserves #sc windows | PASS | `personas/22-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 23 | class | Quiz: select A, B and C | PASS | `personas/23-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 24 | class | Quiz: None is selectable | PASS | `personas/24-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 25 | class | Quiz: individual data failure is N/D, never incorrect | PASS | `personas/25-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 26 | class | Quiz: reveal and hide explanation | PASS | `personas/26-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 27 | class | Quiz: next, previous and restart | PASS | `personas/27-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 28 | class | Quiz: timer pause and resume | PASS | `personas/28-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 29 | class | Quiz: projector and independent mobile session | PASS | `personas/29-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 30 | class | Presentation: clean visit must not interrupt the class | PASS | `personas/30-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 31 | plan | Planning: choose planning mode | PASS | `personas/31-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 32 | plan | Planning: UTC grid and fractional deep-link rejection | PASS | `personas/32-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 33 | plan | Planning: valid limits, invalid input preserves prior rules | PASS | `personas/33-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 34 | plan | Planning: mast, slope, Sun and step controls | PASS | `personas/34-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 35 | plan | Planning: recalculate A/B/C table | PASS | `personas/35-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 36 | plan | Planning: CSV download integrity | PASS | `personas/36-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 37 | plan | Planning: JSON download provenance | PASS | `personas/37-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 38 | plan | Planning: printable passport caveats | PASS | `personas/38-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 39 | plan | Compare: A/B/C, missing-series isolation and Retry | PASS | `personas/39-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 40 | plan | Compare: edit site, date and duration | PASS | `personas/40-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 41 | plan | Compare: remove and add scenarios | PASS | `personas/41-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 42 | plan | Compare: Proof shows source hashes | PASS | `personas/42-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 43 | plan | Replan: +12/+24/+48/+72/+96 pointer changes | PASS | `personas/43-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 44 | plan | Replan: margin and source | PASS | `personas/44-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 45 | plan | Replan: alternatives vs API at identical UTC windows | BLOCKED | `personas/45-after.png` — No reviewed Go/Rust backend is running. Static alternatives cannot establish API window parity or operational validity. |
| 46 | plan | Replan: select alternative and compare | PASS | `personas/46-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 47 | plan | Evidence: source registry and version | PASS | `personas/47-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 48 | plan | Cockpit: inject and clear a fault | PASS | `personas/48-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 49 | plan | Onboard: energy and consumables API | BLOCKED | `personas/49-after.png` — Go/Rust backend and real onboard endpoint are unavailable. Browser-only educational fallback is not an API integration test. |
| 50 | plan | Sensitivity analysis and report export | BLOCKED | `personas/50-after.png` — No identified sensitivity-analysis contract/control in the current product. Planning CSV/JSON/passport are separately exercised in cases 36–38. |
| 51 | plan | Cockpit: Moon only, restore and tutorial | PASS | `personas/51-after.png` — Ação e saída verificadas com ponteiro/teclado |
| 52 | plan | Navigation GNSS: SYNTHETIC contract | BLOCKED | `personas/52-after.png` — Navigation endpoint is not running locally. Source labels alone do not verify the live response contract. |
| 53 | plan | Scientific boundary: no NASA flight certification claim | PASS | `personas/53-after.png` — Ação e saída verificadas com ponteiro/teclado |

## Reproduzir

```bash
npm --prefix web run lint
npm --prefix web run check:ts
npm --prefix web test
npm --prefix web run build:ts
# Playwright 1.56.1 + Chromium; opcional jsqr@1.4.0 e pngjs@7.0.0 para QR óptico
CHROME_PATH=/path/to/headless_shell node web/browser/e2e.mjs
CHROME_PATH=/path/to/headless_shell node web/browser/persona-audit.mjs
CHROME_PATH=/path/to/headless_shell node web/browser/persona-layout-matrix.mjs
bash scripts/ci-local.sh --browser
```

`QR_DECODER_MODULE` e `PNG_MODULE` podem apontar para módulos instalados fora da árvore. Os scripts iniciam o servidor local quando BASE não é informado. Fixtures de rede são rotuladas e não equivalem à API de produção. O frontend continua sendo apoio educacional/exploratório; não é software de voo NASA.
