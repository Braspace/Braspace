# Modelo de habitat: pressão da cabine e propelente

Pacote: `api/habitat`. Status: **modelo puro, sem endpoint e sem números embutidos.** Nada aqui é valor validado de voo.

## O que o modelo calcula

**Cabine**
- Pressão no fim da janela: `P(t) = P0 - vazamento × t`, com piso em zero.
- Pressão parcial de O₂: `pO2 = fração de O₂ × P`.
- Instante em que a pressão cruza o mínimo: `t = (P0 - Pmin) / vazamento`, se ocorrer dentro da janela.

**Propelente**
- Estoque no fim da janela: `estoque - taxa × t`, com piso em zero.
- Instante de esgotamento: `estoque / taxa`, se ocorrer dentro da janela.

Ambos são lineares. Não há modelo de vazamento real, de queima real ou de propulsão.

## Premissas que o time precisa fornecer

O modelo não tem padrão. Quem chama a função informa cada valor. A resposta devolve `status: PREMISE_NOT_VALIDATED` e uma nota de premissa.

| Entrada | Unidade | Quem fornece | Fonte exigida antes de usar |
|---|---|---|---|
| Pressão inicial da cabine | kPa | time | Requisito da missão ou documento de projeto |
| Taxa de vazamento | kPa/h | time | Medida ou especificação do hardware |
| Pressão mínima aceitável | kPa | time | Requisito de segurança da tripulação |
| Fração de O₂ na cabine | adimensional | time | Especificação da atmosfera escolhida |
| Estoque de propelente | kg | time | Plano de massa do lander |
| Taxa de queima | kg/h | time | Dado de propulsão (não modelado aqui) |
| Janela | h | usuário | Já existe no cockpit (máximo de 720 h) |

## O que ainda não está decidido

1. **Valores de referência.** Pressão e fração de O₂ dependem da atmosfera escolhida (por exemplo, 101,3 kPa com 21% de O₂, ou outra). A escolha é do time e precisa de fonte.
2. **Taxa de vazamento.** Sem medida ou especificação, a linha de pressão é uma hipótese, e não um resultado.
3. **Propelente.** A taxa de queima depende do perfil de voo, que o projeto não modela. O modelo só divide estoque por taxa.
4. **Endpoint e interface.** Não criei rota na API nem aba no cockpit. Isso exige decisão sobre onde exibir e com qual rótulo.

## Regras de uso

- Não exibir o resultado como "pressão segura" ou "propelente suficiente". O texto precisa dizer que é premissa.
- Toda saída deve mostrar as premissas usadas, junto do valor.
- Mudar um padrão de exemplo para um valor de missão exige fonte registrada aqui.
