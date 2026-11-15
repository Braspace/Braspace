# Taxonomia de riscos do computador de bordo

Referência: issue [#59](https://github.com/Braspace/Braspace/issues/59) (BS-056, P0). Dono: @Ninzinhu.
Escopo: os riscos que o cálculo de onboarding (`api/onboard`) já produz, e os alertas do protótipo (`web/onboard`). Não é um guia de segurança de voo.

## 1. Como ler esta página

- **Categoria**: o nome do risco, como aparece no relatório (`category` da API).
- **Severidade**: a gravidade para a missão simulada. Só dois níveis são produzidos hoje pela API: `CRITICAL` e `HIGH`. Níveis mais baixos ainda não estão definidos e não devem ser inventados sem decisão do time.
- **Limiar**: o valor contra o qual o dado medido é comparado. Cada limiar é **premissa** (escolha do time, não validada) ou **valor do código** (fixado em `api/onboard` ou em `web/onboard/model.js`). A coluna diz qual é.
- **Medido e permitido**: os campos `measured` e `allowed` da resposta, com a unidade.

## 2. Riscos produzidos pela API (`api/onboard`)

| Categoria | Severidade | Condição de disparo | Medido / permitido | Unidade | Origem do limiar | Texto de explicação na API |
|---|---|---|---|---|---|---|
| `ENERGY_LOSS` | CRITICAL | Energia não atendida pela bateria e pelo painel (carga constante) | energia não atendida / 0 | Wh | Valor do código: nenhuma energia não atendida é tolerada | "Assumed constant load could not be served by the battery/solar budget." |
| `ENERGY_RESERVE` | HIGH | Carga mínima da bateria atinge ou ultrapassa a reserva | carga mínima / reserva configurada | Wh | Premissa: a reserva é um parâmetro do cenário | "Assumed battery reserve is reached or breached." |
| `EARTH_GEOMETRIC_BLACKOUT` | HIGH | Bloqueio geométrico da Terra mais longo que a tolerância | maior bloqueio / tolerância do cenário | h | Premissa: a tolerância é informada pelo usuário | "Geometric Earth visibility outage exceeds the caller-specified tolerance; no RF or DSN link budget is modeled." |

Observações:
- `EARTH_GEOMETRIC_BLACKOUT` é visibilidade **geométrica**. Não modela orçamento de rádio nem DSN. Por isso a severidade é HIGH, e não CRITICAL, e a explicação precisa dizer isso.
- `ENERGY_LOSS` e `ENERGY_RESERVE` usam o mesmo modelo de bateria, sem medição real. Os valores de exemplo do cenário não podem aparecer como resultado real (regra QA-02 de `QA_REGRESSION_RULES.md`).

## 3. Alertas do protótipo (`web/onboard`)

O protótipo tem limiares próprios para a leitura visual. Eles são premissas do protótipo, não validados, e não são produzidos pela API:

| Alerta | Limiar | Origem | Observação |
|---|---|---|---|
| Escuridão contínua | 30 h | Premissa (`model.js`, `LIMITS.darkH`) | Escuridão acima de 30 h vira alerta de energia |
| Bloqueio da Terra | 24 h | Premissa (`model.js`, `LIMITS.blockH`) | Pode divergir do limite de tolerância da API; a tela deve dizer qual está em uso |
| Bateria | 20 Wh | Premissa (`model.js`, `LIMITS.battery`) | Sem simulação de bateria no protótipo: o gráfico vem da API |
| Reserva de combustível | 150 kg | Premissa (`model.js`, `LIMITS.fuelReserveKg`) | Ilustrativo: não há modelo de propelente |

Regra: qualquer alerta do protótipo precisa mostrar a palavra **SINTÉTICO** ou **PROTÓTIPO** no mesmo lugar do valor (regra 1 de `QA_REGRESSION_RULES.md`).

## 4. Mapeamento para a submissão

| Categoria | Exigência de QA | Caso de teste |
|---|---|---|
| `ENERGY_LOSS` | Valor com unidade, timestamp e aviso de cenário ilustrativo | QA-01, QA-02 |
| `ENERGY_RESERVE` | Limiar explícito ao lado do valor medido | QA-01 |
| `EARTH_GEOMETRIC_BLACKOUT` | Não dizer "comunicação garantida": é visibilidade geométrica | QA-06 (termos proibidos) |
| Todas | Nenhuma severidade pode ser apresentada como "validada pela NASA" | QA-06 |

## 5. Pendências

1. **Níveis abaixo de HIGH** (por exemplo, MEDIUM ou LOW) não existem na API. Se o time quiser, precisa definir o limiar de cada nível e registrar aqui antes de implementar.
2. **Dois limiares de bloqueio da Terra** (24 h no protótipo e a tolerância da API): decidir qual vale para o relatório impresso.
3. **Fonte dos limiares**: as premissas precisam de decisão do time, registrada nesta página, antes de qualquer submissão.
4. Testes automatizados que comparem esta tabela com os valores de `api/onboard/onboard.go` (issue #33).
