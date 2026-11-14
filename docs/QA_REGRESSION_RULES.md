# Regras de regressão de QA e guardrails científicos — BRASPACE 2026

Referência: issues [#31](https://github.com/Braspace/Braspace/issues/31) (BS-031, P0) e [#35](https://github.com/Braspace/Braspace/issues/35) (BS-035, P1).
Dono: @Ninzinhu. Estas regras são o critério de aceite. Uma falha em qualquer item bloqueia a submissão.

## 1. Regras de interface (falham o build se violadas)

A UI deve mostrar, em toda tela que exibe dados científicos:

| Regra | Como verificar |
|---|---|
| **Timestamp** do dado (data e hora da observação ou do cálculo, com fuso) | Abrir a tela e localizar o horário. Falha se estiver ausente ou sem fuso. |
| **Atribuição de fonte** (missão, instrumento, portal ou modelo) | Localizar o rótulo de fonte próximo ao valor. Falha se o valor não tiver fonte. |
| **Unidades** em todo valor numérico (km, m/s, graus, etc.) | Inspecionar cada valor. Falha se houver número sem unidade. |
| **Aviso de dados ilustrativos** quando o dado não for real ou validado | Verificar que o aviso aparece quando a fonte for simulada ou não validada. |

## 2. Regras de honestidade científica

- A UI e a documentação não podem usar termos como "precisão de missão", "pronto para voo" ou "validado pela NASA" sem validação registrada.
- Todo cálculo deve declarar suas premissas e limitações, em texto visível ao usuário.
- Valores de exemplo ou de teste não podem aparecer como resultados reais.

## 3. Casos de teste mínimos

Para cada caso, registrar entrada, saída esperada, saída observada e resultado (passou/falhou).

| ID | Caso | Esperado |
|---|---|---|
| QA-01 | Abrir a tela principal com dado real | Timestamp, fonte, unidades visíveis, sem aviso de ilustrativo |
| QA-02 | Abrir a tela com dado ilustrativo | Aviso de ilustrativo visível, fonte marcada como simulada |
| QA-03 | Dado sem fonte | Falha de QA; a tela não deve exibir o valor |
| QA-04 | Dado sem unidade | Falha de QA |
| QA-05 | Dado sem timestamp | Falha de QA |
| QA-06 | Texto com termos proibidos ("precisão de missão" etc.) | Falha de QA |
| QA-07 | Link de fonte quebrado | Registrar como defeito |

## 4. Triagem de defeitos (#35)

### Severidade

| Nível | Definição | Exemplo | Prazo de correção |
|---|---|---|---|
| **Bloqueador** | Impede submissão ou viola regra científica/NASA | Dado sem fonte, falta campo obrigatório | Antes da submissão |
| **Grave** | Funcionalidade principal quebrada, mas com contorno | Gráfico não carrega em um navegador | Antes da submissão, se possível |
| **Cosmético** | Visual ou texto, sem impacto na função | Alinhamento, typo | Depois da submissão |

### Registro de cada defeito

- ID e título
- Severidade
- Dono
- Passos de reprodução (numerados)
- Resultado esperado e observado
- Evidência (print, log ou saída)
- Mitigação, se houver
- Status: aberto, em correção, corrigido, verificado

## 5. Como usar este documento

1. Antes de cada PR, rodar os casos QA-01 a QA-07 e anexar os resultados ao PR.
2. Qualquer falha de regra da seção 1 ou 2 é bloqueador.
3. Quando o código for enviado, transformar as seções 1 e 2 em testes automatizados no CI (issue #33).
