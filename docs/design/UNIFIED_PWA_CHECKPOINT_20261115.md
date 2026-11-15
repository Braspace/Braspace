# MoonProof — uma Lua, três experiências

Checkpoint incremental P0, 15/11/2026. Base exata: `7190bb541e68106f8ce409d38ee4108f2dd27d7b`, PR #296 (Joel Moon HD). Dependência explícita: não publicar ou mesclar independentemente da revisão de #296, #287/#299 e #289. O CSS base e os componentes são os tokens do design system Heloísa, sem recriar física, dados ou números de mockup.

## Estado observado na demo publicada

| Superfície inspecionada | Evidência desta sessão | Ação |
|---|---|---|
| Entrada | Quatro cartões, 7 links de navegação e outros links no rodapé | Três experiências e diálogo Ferramentas |
| Explorar | Mapa LOLA 2D com cinco marcadores; cinco cartões empilhados | Preservar mapa registrado; cena lunar compartilhada, portabilidade de cartões em próxima etapa |
| Comparar | API Go indicada como ao vivo; seis cartões, valores quebrando de linha | Ajuste tipográfico e acesso técnico pela experiência Engenheiro |
| Bordo | Redirect para outra página, 13 itens laterais, modelo sintético | Preservar rotas e funcionalidade; migração para componente montável pendente |
| Polar Lab | Redirect, WebGL indisponível, fundo preto; tabela real e status Go/Rust/Postgres/pgvector disponíveis | #296 contém fallback; portabilidade das vistas pendente |

As observações são da versão publicada anterior à mudança. Não são comprovação visual do novo SHA, do GPU real, de contraste WCAG ou de todas as telas.

## Arquitetura incremental

- `/` é o shell Preact/TypeScript. Aluno → `#/explorar`, Professor → `#/aula`, Engenheiro de missão → `#/comparar/tecnico`; são pontos de entrada, não roles de autorização. Comparar, atividade, bordo, replanejar, terreno e provas ficam em `<dialog>` nativo. Nenhuma rota existente é removida.
- Um único `#moon-stage` persiste fora do outlet do roteador: importa `classic-adapter.js` do PR #296 e usa o mesmo Moon HD, cap LOLA, ephemeris e texturas. Nenhum canvas decorativo redundante é montado no shell. O botão Interagir com a Lua revela a cena, sem mudar a rota; Escape volta ao conteúdo. A cena recebe hora e coordenadas do catálogo real. Não anima automaticamente (renderização sob demanda), reduzindo custo de GPU e movimento involuntário.
- O poster `moon-hd/pole-preview.webp` é o derivado CPU com iluminação fixa do mesmo relevo; não é um mapa georreferenciado. A representação de mapa existente para análise (LOLA 2D) continua distinta; não sobrepor marcadores 2D em uma projeção diferente. O estado de contexto real e os valores sintéticos permanecem identificados.
- Manifest e worker de escopo relativo: apenas fallback offline e ativos de apresentação; não armazenam APIs, POST, séries, contexto do usuário ou dados científicos. O ícone é a marca gráfica existente, não uma imagem alternativa da Lua. Offline não implica cálculo científico disponível.

## Aceite antes da entrega

1. Reconciliar @main e #296/#299/#289 no SHA final, mantendo TS e JS gerado iguais e as regras de CSP restritas.
2. Executar `npm --prefix web run lint`, `npm --prefix web test`, `npm --prefix web run check:ts`, regressão Go/Rust/Postgres e `web/browser/route-matrix.mjs` (280 casos do #296). Executar adicional `web/browser/unified-shell.mjs` em servidor fullstack: 320/390/768/1280/1440/1920; três entradas, diálogo e Escape/foco, contexto, persistência do elemento 3D, overflow. Testar GPU real, falha de textura, perda de contexto, zoom/órbita, preferência de movimento, instalação PWA e fallback offline.
3. Teclado, leitores de tela reais, contraste AA de todos os estados, zoom 200–400%, alvos mínimos de toque, textos de estados, responsividade e screenshots por rota. Não declarar conformidade integral sem evidência.
4. Próximo lote: portar `web/onboard/cockpit.js` para módulos de serviços/estado com ciclo `mount/unmount`; depois portar `web/lab/app.ts` e `web/moonproof/screens/*.tsx` como views do mesmo outlet, preservando rotas antigas e respeitando a matriz de rotas. Não usar iframe nem relaxar frame-ancestors. Consolidar Studio e Classic apenas após paridade funcional; remover links legados de lançamento somente após testes.
5. Converter cartões secundários para Resposta/Por quê/Prova com divulgação progressiva, mantendo controles essenciais sempre disponíveis. Usar as fontes e tokens Heloísa; manter hierarquia, espaçamento e interface humanizada. Revisão Heloísa e João Victor antes do merge.

## Evidência de execução neste checkpoint

Espelho local de 87 fontes TypeScript do SHA-base obtido via GitHub autenticado; `tsc` 5.6.3 compilou, `node --test web/tests/unified-shell.test.mjs web/tests/router.test.mjs` 11/11 PASS; `node --check` nos arquivos worker, adapter, dev server e teste browser PASS. Nenhum binário grande ou checkout integral estava disponível via Git CLI não autenticado. Chromium local falhou no lançamento com `socket() failed: Operation not permitted`, antes de carregar a página. A matriz Chromium completa, GPU real, instalação real da PWA e integração fullstack do novo SHA continuam gates pendentes.
