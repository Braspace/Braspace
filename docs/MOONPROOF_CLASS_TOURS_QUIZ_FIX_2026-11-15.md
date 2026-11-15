# Correção de quizzes e onboarding contextual — MoonProof (15/11/2026)

## Por que
O Kit Aula / Apresentar avaliava as quatro perguntas com o mesmo gabarito: escuridão **e** comunicação. Como os cenários podem não atender a ambos os limites, todos apareciam "errados" mesmo em perguntas que só exigiam um dos critérios. Uma resposta ausente (N/D) também não podia ser considerada um erro de aluno.

## Alterações propostas

- `screens/quiz-grading.ts` e `.js`: Q1/Q4 exigem **as duas** regras; Q2 exige **apenas o tempo no escuro**; Q3 exige **apenas o intervalo sem ver a Terra**. IDs estáveis A/B/C são independentes da posição visual.
- Gabarito pode ter **múltiplos cenários**, **Nenhum deles** se todos certamente falharem, ou **Indeterminado** se nenhum passar e faltar dado. Não classificar N/D como resposta errada.
- O projetor permite escolher A/B/C/Nenhum, revela o gabarito por pergunta e mostra feedback claro. Vermelho sinaliza somente um cenário **selecionado** que realmente não atende; não colore os três automaticamente.
- O Kit Aula compartilha `present.html` com o cenário e as orientações, não a página de edição `activity.html`. `Copiado!` só aparece após `navigator.clipboard.writeText` realmente resolver; em falha há explicação.
- Clique nos quatro passos do Kit Aula foca/rola até a área correspondente; o primeiro passo não aparece falsamente como já concluído.
- As cinco opções do professor são **orientações pedagógicas**, não restrições efetivas do navegador. O texto agora é explícito. O sistema **não** coleta respostas dos alunos automaticamente.
- Tours opcionais e localizados para Explorar e Kit Aula: primeiro uso com consentimento, cinco destaques com mensagens simples, próximo/voltar, X, Esc, pular, reabrir com ajuda, salvamento local separado, foco preso ao diálogo e preferência de movimento reduzido.

## Conteúdo dos tours
**Explorar:** mapa → camadas → lugares → Sol/Terra → navegação e comparação.
**Kit Aula:** passos → prévia → orientações → quiz → compartilhar.

## Testes realizados pelo autor
- 6 casos da lógica de avaliação executados isoladamente no JavaScript do commit (Q2/Q3, dois válidos, nenhum, dados faltantes e ID).
- 9 verificações estáticas de integração do tour e dos quizzes passaram.
- Parse JavaScript isolado dos arquivos alterados com suporte a top-level await passou (não é navegador).

## Gate antes do merge / deploy
1. `npm --prefix web run check:ts` para garantir que o `.js` commitado corresponde ao `.tsx/.ts`.
2. `npm --prefix web test`, em especial `class-quiz-grading.test.mjs`, `class-tour.test.mjs` e `kits-screens.test.mjs`.
3. `npm --prefix web run lint`, `node web/browser/e2e.mjs`.
4. Testar Explorar e Kit Aula em 320, 390, 768, 1440 px: abertura primeira visita, Pular, X, Esc, voltar, próximo, foco do teclado, reabertura e scroll; com `prefers-reduced-motion`.
5. Testar apresentação com métricas reais + sem API: cada uma das 4 perguntas, A/B/C/Nenhum, explicação N/D, cronômetro, avanço, volta ao Kit Aula. Conferir QR/copiar em HTTPS e quando clipboard está bloqueado.
6. Testar o mesmo SHA publicado no Worker após aprovação; não há deploy neste PR.

## Fora do escopo
Nenhum número NASA foi alterado. Nenhuma hipótese de voo foi validada. Não implementa bloqueio técnico de permissões do aluno, sala ao vivo, armazenamento remoto de respostas ou autenticação; só corrige o quiz/apresentador existente. A comparação de horizonte 100 km × 200 km permanece como limitação científica separada.


## Atualização de integração — Comparar → Kit Aula → Apresentar
- O botão **Dar aula com estes cenários** em Comparar preserva no hash `#sc=` os sítios, datas UTC e durações escolhidos, incluindo o mesmo sítio em duas janelas distintas.
- `class-scenarios.ts/.js` resolve apenas IDs existentes no catálogo e mantém o fallback anterior (três primeiros sítios) quando a aula é aberta diretamente.
- Kit Aula transporta os cenários no QR/link; Apresentar usa `apiWindowMetrics` com a janela de cada cenário e preserva o contexto ao voltar para o Kit Aula.
- Os rótulos de quiz não afirmam a existência de uma conexão de rádio certificada: o cálculo usa tempo sem visibilidade geométrica da Terra.
- Resposta selecionada com dados ausentes permanece **inconclusiva**, inclusive se outra opção for comprovadamente válida; ausência integral de cenários também não produz um falso "Nenhum".
- Novos testes: `class-scenarios.test.mjs` (seleção, tempos, repetição e integração estática), além de casos adicionais em `class-quiz-grading.test.mjs`.
- **Verificação parcial local:** 7/7 casos isolados de quiz, 3/3 cenários dinâmicos do hash, paridade de TS/JS dos módulos puros com TypeScript 5.8.3. A versão exata de CI (5.6.3), o navegador real, todos os testes do repositório e a produção continuam pendentes.
