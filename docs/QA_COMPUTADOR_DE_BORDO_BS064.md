# QA do computador de bordo (BS-064, issue #68)

Data da verificação: 2026-11-14. Base: branch `team/Ninzinhu/onboard-features`, com o commit `4588b94` por cima de `7680910` (main). Este documento registra o que foi executado e o que não foi. Nada aqui é certificação de voo.

## 1. Resultado em uma linha

- A API de simulação (`api/onboard`) passa nos testes de depleção de bateria, bloqueio da Terra, entradas inválidas e determinismo.
- O protótipo (`web/onboard`) passa nos 24 testes de unidade e as abas Entrada e Janelas montam sem erro no navegador.
- Falha conhecida fora do escopo: `api` (pacote raiz) tem um teste que quebra no Windows porque o engine fake não é reconhecido como executável (ver seção 5).
- Não foi verificado o cenário de bateria esgotada na interface do protótipo.

## 2. Tabela de testes

| # | Condição (critério do #68) | Onde está o teste | Resultado |
|---|---|---|---|
| T1 | Bateria cruza a reserva e esgota (`POWER_LOSS`, carga final 0, 10 Wh não atendidos) | `api/onboard/onboard_test.go` › `TestBatteryDepletionAndBlackout` | PASS |
| T2 | Bloqueio longo da Terra (2 h) gera risco `EARTH_GEOMETRIC_BLACKOUT` | mesmo teste | PASS |
| T3 | Dado ausente (Sol ou Terra `null`) é rejeitado, sem inventar valor | `TestRejectUnsafeInputs` › `missing Sun`, `missing Earth` | PASS |
| T4 | Entradas inválidas: lista vazia, duplicata, data ruim, passo zero, carga negativa, NaN, reserva > capacidade, carga inicial > capacidade, bloqueio fora da duração | `TestRejectUnsafeInputs` (11 casos) | PASS |
| T5 | Mesma entrada gera o mesmo hash e o mesmo resultado | `TestCandidatesAndDeterminism` | PASS |
| T6 | Sem alternativa que passe nos limites, não há candidato de laboratório | `TestBatteryDepletionAndBlackout` | PASS |
| T7 | Ciência nunca aparece como verificada (`UNVERIFIED_INPUTS`, `no_flight_recommendation` true) | `TestBatteryDepletionAndBlackout`, `TestCandidatesAndDeterminism` | PASS |
| T8 | Relatório HTML bate com os riscos da API e escapa entrada do usuário | `TestReportContentAndRiskAgreement`, `TestReportEscapesUserInput`, `TestReportRejectsInvalidInputs` | PASS |
| T9 | Erros HTTP e sucesso no endpoint | `TestHTTPErrorsAndSuccess` | PASS |
| T10 | Interface: nenhum texto chama o protótipo de certificado ou validado | busca por `certific`, `validated`, `VALIDADO`, `flight-ready` em `web/onboard` e `api/onboard` | PASS (só aparecem negações ou comentários de código) |
| T11 | Interface: fontes NASA aparecem como candidatas, não usadas | `cockpit.js` aba Status, aviso "Todas estão como candidatas" | PASS por leitura |
| T12 | Entrada inválida bloqueia CALCULAR na interface | `entryProblems()` em `cockpit.js` (aba Entrada) | PASS por leitura de código e captura |
| T13 | Janelas e Entrada montam no navegador sem "Erro ao montar" | captura headless de `#entrada` e `#janelas` | PASS |
| T14 | Bateria esgotada na interface do protótipo | não executado | **PENDENTE** |
| T15 | Replay de um cenário com dados NASA | não há dado NASA no repositório (ver `docs/FONTES_OFICIAIS_NASA.md`) | **BLOQUEADO** |
| T16 | Links públicos da demo sem login | não verificado (depende do deploy) | **PENDENTE** |

## 3. Comandos executados

```
cd api && go test ./onboard/ -v        # PASS (todos os testes listados)
cd web/onboard && node --test test/front.test.mjs test/cockpit.test.mjs   # 24 pass, 0 fail, 1 skip (integração sem ONBOARD_API_URL)
```

## 4. Achados (para o time decidir)

1. **Combustível negativo.** `lifeSupport` retorna `fuelRemainingKg` com piso em zero, mas `fuelMarginKg` pode ser negativo. A tela mostra zero sem indicar que a reserva foi violada, a menos que o alarme FUEL dispare. Sugestão: mostrar a margem negativa junto ao valor.
2. **Bloqueio da Terra no protótipo não é bisseccionado.** `transitions` usa o índice da primeira amostra que mudou (checklist 4.6 pendente). O horário de transição tem erro de até um passo de amostragem. Já está rotulado na aba Janelas.
3. **Bateria só existe na API.** O protótipo não simula bateria; o gráfico de carga vem do `POST /api/onboard/evaluate`. Por isso T14 depende do servidor no ar.
4. **Teste quebrado no Windows (`api` raiz).** `TestDelayOutsideCoverageIsReportedNotInvented` falha com `interface {} is nil`. A causa é o engine fake: `engineClient.available()` exige bit de execução (`st.Mode()&0o111`), que o Go no Windows não reporta. É o mesmo problema da correção `b78a284`, que ainda não está na main.

## 5. Não verificado

- Não rodei o pacote `api` inteiro como ambiente de CI. O `api` raiz depende de engine Rust, e o Windows não passa pelo teste acima sem a correção.
- Não testei a interface com bateria esgotada (T14) nem as URLs públicas (T16).
- Não há replay com dados NASA (T15): nenhuma fonte foi baixada ou usada.
