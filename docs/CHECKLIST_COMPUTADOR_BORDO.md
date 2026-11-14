# Checklist de funcionalidades do computador de bordo

Atualizado em 2026-11-14. Legenda de estado:

- **Protótipo**: existe no dashboard (`docs/prototype/onboard-dashboard.html`), com modelo sintético. Não é validado.
- **Esquema**: definido em `docs/schema/onboard-computer.schema.json`, sem implementação.
- **Pendente**: não iniciado.
- **Bloqueado**: depende de dado, decisão ou código que ainda não existe.

Requisitos (R-xx, D-xx) e issues seguem `docs/REQUISITOS_RASTREABILIDADE_NINZINHU.md`. Nenhum item está verificado com evidência.

## Alinhamento com os gates científicos (atualizado em 2026-11-14)

Os gates vêm de `docs/SCIENTIFIC_ACCEPTANCE.md`. Até a data acima, **nenhum gate está cumprido**. Os estados "Protótipo" abaixo significam tela com dado sintético, não validação.

| Gate | Situação | Observação |
|---|---|---|
| G1 Origem dos dados | Parcial | `LDEM_80S_80M` escolhido e com SHA-256 conferido, na PR #71 (rascunho). Não está em `main` nem foi lido pelo código. |
| G2 Coordenadas dos sítios | Pendente | Sítios atuais são sintéticos (`SYN-SITE-*`). |
| G3 Derivação SPICE | Pendente | Kernels identificados; nada carregado. |
| G4 Horizonte do DEM | Pendente | Horizonte atual é senoide. Método de referência do time: `illumf_c` com DSK ou elipsoide. |
| G5 Validação | Pendente | Sem comparação com Horizons ou com benchmark. |
| G6 Derivado | Pendente | Séries de Sol e Terra são sintéticas. |
| G7 Interface e submissão | Bloqueado | Depende de G1–G6, de links públicos e do CI. |

**Regra de exibição:** toda tela que mostre Sol, Terra, horizonte, luz ou energia deve trazer a etiqueta "SINTÉTICO" e não pode ser lida como resultado científico.

## 1. Entrada do cenário

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 1.1 | Escolha de sítio (predefinidos) | Protótipo | R-01 | #5, #26 | Três sítios sintéticos |
| 1.2 | Coordenadas lunares personalizadas | Protótipo (validação) | R-01 | #19, #26 | Valida faixa, mas o cálculo usa só o sítio escolhido. Aviso exibido. |
| 1.3 | Data e hora de pouso em UTC | Protótipo | R-03 | #19, #21 | Limite de efeméride não validado |
| 1.4 | Duração da missão | Protótipo | R-03 | #26 | Faixa 1 a 336 h |
| 1.5 | Público técnico e educativo | Protótipo | R-17 | #26, #47 | Educativo mostra explicações; falta revisão de texto |
| 1.6 | Sítio com fonte NASA (ID de fonte) | Esquema | R-01, R-19 | #1, #2 | Nenhum sítio real carregado |

## 2. Geometria do Sol e da Terra

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 2.1 | Azimute e elevação do Sol | Protótipo (sintético) | R-05 | #15, #25 | Senoide, não efeméride |
| 2.2 | Azimute e elevação da Terra | Protótipo (sintético) | R-06 | #15, #16 | Senoide, não efeméride |
| 2.3 | Efemérides reais (SPICE ou Horizons) | Pendente | R-05, R-06, R-12 | #4, #15 | Ver `PESQUISA_ALGORITMO.md`, seção 1 |
| 2.4 | Libração e orientação lunar | Pendente | R-12 | #4, #18 | Kernel `moon_pa_de440_200625.bpc` identificado |
| 2.5 | Validação contra Horizons (um sítio, três datas) | Pendente | R-05, R-06, R-19 | #15, #34 | Único teste científico viável sem dado de missão |
| 2.6 | Sem refração atmosférica | Protótipo | R-11 | #13, #15 | Declarado no esquema (`refraction_applied` removido na versão 0.1.0; regra no texto) |

## 3. Horizonte e terreno

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 3.1 | Horizonte do terreno por azimute | Protótipo (matemático) | R-05, R-10 | #14, #16 | Função senoidal, não relevo |
| 3.2 | Leitura do DEM LOLA (`LDEM_80S_80M.IMG`) | Pendente | R-10 | #2, #14, #20 | Dataset escolhido e com hash conferido (PR #71). Leitura do binário ainda não implementada. Projeção descrita no rótulo; conferir com `gdalinfo` ou com o rótulo. |
| 3.3 | Cálculo de horizonte por raio no DEM | Pendente | R-05, R-08 | #14, #16 | Método em `PESQUISA_ALGORITMO.md`, seção 3 |
| 3.4 | Distância máxima de busca documentada | Pendente | R-10 | #14 | Parâmetro a justificar |
| 3.5 | Tratamento de pixels interpolados | Pendente | R-10 | #17 | Cerca de 90% dos pixels de 5 m |
| 3.6 | Declive, paredes de cratera e crateras | Pendente | R-10 | #14 | Não citado no protótipo |
| 3.7 | Resolução do DEM registrada | Esquema | R-10, R-19 | #17 | Campo `dem_resolution_m` |

## 4. Janelas de luz e de visibilidade da Terra

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 4.1 | Horas com luz | Protótipo | R-08 | #21, #25 | Amostragem de 1 h |
| 4.2 | Maior escuridão contínua | Protótipo | R-08 | #21, #25 | |
| 4.3 | Horas com a Terra visível | Protótipo | R-06, R-09 | #16, #21 | Não garante enlace |
| 4.4 | Maior bloqueio da Terra | Protótipo | R-09 | #16, #21 | |
| 4.5 | Próxima transição de luz e de visibilidade | Protótipo | R-07 | #16, #21 | Por amostra, não por refinamento |
| 4.6 | Transição com instante exato (bissecção) | Pendente | R-07 | #16 | Tolerância a declarar |
| 4.7 | Lista de janelas de visibilidade | Esquema | R-09 | #16, #21 | Campo `earth_windows` |

## 5. Energia e combustível (ilustrativo)

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 5.1 | Luz disponível separada de potência elétrica | Protótipo | R-08, D-04 | #40 | Aviso exibido |
| 5.2 | Bateria (carga e descarga) | Protótipo (ilustrativo) | — | #40 | Coeficientes sem fonte |
| 5.3 | Modelo de painel (área, eficiência, perdas) | Esquema | — | #40 | Sem parâmetros de hardware |
| 5.4 | Combustível: massa, consumo, reserva e margem | Protótipo (ilustrativo) | D-02 | — | Números de exemplo; escopo não decidido (#7) |

## 6. Suporte de vida (ilustrativo, escopo não decidido)

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 6.1 | Alimentação (estoque e racionamento) | Protótipo (ilustrativo) | — | #7 | Não consta da lista do desafio |
| 6.2 | Pressurização da cabine (faixa aceita) | Protótipo (ilustrativo) | — | #7 | Pressão fixa |
| 6.3 | Pressão parcial e estoque de O2 | Protótipo (ilustrativo) | — | #7 | Valores fixos |
| 6.4 | Decisão de escopo pelo time | Pendente | — | #7 | Bloqueia a inclusão na demo |

## 7. Replanejamento

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 7.1 | Atrasos de 0, +24, +48 e +72 h | Protótipo | D-02, R-16 | #46 | Por sítio |
| 7.2 | Restrições violadas nomeadas | Protótipo | R-16 | #46, #48 | Escuridão, bloqueio, bateria e combustível |
| 7.3 | Resultado (viável, margem reduzida, inviável) | Protótipo | R-16 | #46, #48 | Limiares ilustrativos |
| 7.4 | Busca de data alternativa no mesmo sítio | Pendente | R-15 | #46 | Grade de datas a definir |
| 7.5 | Busca de sítio alternativo com fonte | Pendente | R-15 | #5, #52 | Protótipo mostra os três sítios, sem busca |
| 7.6 | Explicação quando não há alternativa validada | Pendente | R-15 | #52 | Estado `no_validated_alternative` no esquema |

## 8. Visualização

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 8.1 | Gráfico de horizonte com Sol e Terra | Protótipo | R-05, R-06 | #25 | |
| 8.2 | Linha do tempo de luz e de visibilidade | Protótipo | R-14 | #25, #26 | |
| 8.3 | Controle deslizante e reprodução | Protótipo | R-14 | #25, #47 | Avanço por passo fixo |
| 8.4 | Mapa polar do sítio | Protótipo | R-13 | #25, #47 | Projeção ampliada, sem escala real |
| 8.5 | Mapa 2D com dado LOLA | Pendente | R-13 | #25, #47 | Depende de 3.2 |
| 8.6 | 3D do terreno | Pendente | R-13 | #47, #54 | Só com dado real, ou rotulado ilustrativo |
| 8.7 | Comparação lado a lado | Protótipo | R-02 | #26 | Três sítios, mesma data |
| 8.8 | Animação de transições | Pendente | R-14 | #25 | |

## 9. Análise e sensibilidade

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 9.1 | Sensibilidade a altura do observador | Protótipo (multiplicador) | D-03 | #49 | Parâmetro sintético |
| 9.2 | Sensibilidade a resolução do DEM | Protótipo (multiplicador) | D-03 | #49 | Precisa de DEM real |
| 9.3 | Sensibilidade a passo de tempo | Protótipo | D-03 | #49 | |
| 9.4 | Método documentado de sensibilidade com DEM real | Pendente | D-03 | #49 | |
| 9.5 | Compromissos ciência × engenharia | Protótipo (texto) | R-18, D-04 | #48 | Sem ranking universal |
| 9.6 | Pareto reproduzível | Pendente | D-04 | #48 | |

## 10. Histórico, exportação e evidência

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 10.1 | Salvar cenário no histórico | Protótipo | D-05 | #48 | Sessão apenas |
| 10.2 | Exportar JSON (copiar) | Protótipo | D-05 | #48, #50 | Cópia manual; download bloqueado no artefato |
| 10.3 | Recibo com versão, parâmetros e fontes | Pendente | D-05 | #50 | |
| 10.4 | Fontes oficiais com links | Protótipo | R-19 | #34, #52 | Estado "candidata" |
| 10.5 | Limitações visíveis | Protótipo | R-19 | #34, #31 | |
| 10.6 | Estado dos requisitos | Protótipo | R-19 | #50 | Todos pendentes ou bloqueados |
| 10.7 | Proveniência por resultado (terreno, efeméride, quadro) | Esquema | R-19 | #50 | Campo `provenance` |

## 11. Lançamentos e falhas (contexto)

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 11.1 | Bloco `launch_context` (fonte, horário, estado) | Pendente | — | #7 | Decisão de escopo pendente |
| 11.2 | Consulta à Launch Library 2 pelo backend, com cache | Pendente | — | #7 | Limite de 15 por hora sem chave |
| 11.3 | Registro de falhas recentes com fonte primária | Pendente | — | #59 | Ver `VARREDURA_APIS_LANCAMENTOS.md` |
| 11.4 | Lançamentos fora do cálculo de viabilidade | Pendente | — | #59 | Regra de rotulagem |

## 12. Qualidade, entrega e segurança

| # | Funcionalidade | Estado | Requisito | Issue | Observação |
|---|---|---|---|---|---|
| 12.1 | Regras de QA (timestamp, fonte, unidades, aviso) | Esquema (documento) | D-09 | #31 | `QA_REGRESSION_RULES.md` |
| 12.2 | Testes automatizados de UI | Pendente | R-19 | #31, #33 | Depende de build |
| 12.3 | CI com Go, Rust e Docker | Bloqueado | — | #33 | PR #45 revisado, testes locais não rodados |
| 12.4 | Smoke test do compose | Bloqueado | — | #33 | Depende de 12.3 |
| 12.5 | Links públicos em aba anônima | Bloqueado | D-08, D-09 | #10, #32 | Projeto público não existe |
| 12.6 | Idioma inglês para submissão | Protótipo (sem revisão) | D-09 | #27, #47 | Revisão técnica pendente |
| 12.7 | Acessibilidade (contraste, foco, redução de movimento) | Protótipo (parcial) | — | #28 | Não auditado |
| 12.8 | Declaração de uso de IA | Pendente | D-09 | #34 | Necessária na submissão |
| 12.9 | Motor de cálculo real (Rust ou Go) | Pendente | R-05 a R-12 | #13 a #21 | O protótipo é JavaScript de interface |
| 12.10 | API que expõe o cálculo | Pendente | R-01 a R-03 | #19 a #24 | `/v1/visibility` atual só aceita entrada sintética |

## 13. Resumo por estado

| Estado | Quantidade |
|---|---|
| Protótipo (sintético ou com ressalva) | 39 |
| Esquema | 6 |
| Pendente | 27 |
| Bloqueado | 3 |
| **Total** | **75** |

Contagem feita por script sobre a coluna "Estado" das tabelas. Os números medem o andamento, não a qualidade: "Protótipo" significa que a tela existe, não que o cálculo está correto.

## 14. O que falta para o mínimo viável

Pela ordem de dependência:

1. Ler o DEM LOLA e confirmar a projeção (3.2), o que destrava 3.3 a 3.5.
2. Efemérides reais para um sítio (2.3), com validação contra Horizons (2.5).
3. Horizonte real por raio (3.3) e transições refinadas (4.6).
4. Decisão do time sobre o escopo (#7), que define 6.x e 11.x.
5. Motor de cálculo (12.9) e API (12.10), para que o dashboard leia resultados reais.
6. CI (12.3) e testes de UI (12.2).
7. Links públicos e revisão de inglês (12.5, 12.6), antes da submissão.
