# Rastreabilidade de requisitos — BS-048 (#50)

Dono: @Ninzinhu. Fonte dos requisitos: `docs/PRODUCT_REQUIREMENTS_TRACEABILITY.md` (branch `ops/spaceapps-2026-coordination`, PR #44). Consulta em 2026-11-14.

Regra: um requisito só vira "concluído" com evidência reproduzível (teste, link, commit ou captura). Presença em README ou mockup não conta.

Legenda de status verificado:
- **Pendente**: sem evidência no repositório.
- **Parcial**: há código ou documento, mas sem evidência de execução contra dados reais.
- **Bloqueado**: depende de dados NASA ainda não adquiridos.

Evidência observada hoje, relevante para vários itens: nenhum dado NASA foi confirmado em `data/NASA_SOURCES_TEMPLATE.md`. O código do PR #45 usa apenas o arquivo sintético `examples/visibility.synthetic.json` e um classificador que declara as entradas como "UNVERIFIED_INPUTS" e não carrega LOLA nem efemérides.

## Requisitos de base (R-01 a R-19)

| ID | Requisito | Prioridade | Issues | Evidência exigida | Status verificado (2026-11-14) | Quem valida |
|---|---|---|---|---|---|---|
| R-01 | Sítios conhecidos e entrada lat/lon lunar | P0 | #5, #19, #26, #52 | Um sítio com fonte e coordenadas válidas; rejeitar coordenadas inválidas | Bloqueado: sem sítio com fonte | @maccachera, @gfreiresjrp |
| R-02 | Comparação lado a lado de vários sítios | P0 | #21, #26 | Dois sítios ou cenários em grade de tempo comum | Pendente | @gfreiresjrp, @lisanogueira |
| R-03 | Data e hora UTC, duração da missão | P0 | #19, #21, #26 | Controles atualizam o cálculo e respeitam limites da efeméride | Pendente | @gfreiresjrp, @lisanogueira |
| R-04 | Exploração temporal (dias, meses, ciclos) | P1 | #4, #15, #21, #46, #52 | Épocas representativas com fonte; geometria lunar documentada | Bloqueado: efemérides não confirmadas (#4) | @maccachera, @joeljato |
| R-05 | Azimute e elevação do Sol em relação ao horizonte do terreno | P0 | #13, #14, #15, #16, #25 | Direção do Sol e altura do terreno validadas, com unidades e fonte | Parcial: classificador sintético no PR #45; sem terreno real | @joeljato |
| R-06 | Azimute e elevação da Terra e visibilidade geométrica | P0 | #13, #14, #15, #16, #25 | Direção da Terra e interseções com o horizonte; sem garantia de enlace de rádio | Parcial: mesmo caso do R-05 | @joeljato |
| R-07 | Tempo até próxima transição de luz ou visibilidade | P1 | #16, #21, #25 | Horários de transição com premissas de discretização | Pendente | @joeljato, @gfreiresjrp |
| R-08 | Horas com luz, escuridão máxima, geometria de iluminação | P0 | #14, #16, #21, #25 | Intervalos em série temporal derivados de horizontes reais | Bloqueado: sem horizonte real | @joeljato |
| R-09 | Janelas diretas para a Terra e máximo de bloqueio | P0 | #16, #21, #25 | Horários e maior intervalo de obstrução; sem afirmar escala DSN ou orçamento de RF | Pendente | @joeljato, @gfreiresjrp |
| R-10 | Terreno LOLA, elevação, paredes de crateras, declive e horizonte topográfico | P0 | #1, #2, #3, #14, #20 | Dados reais do NASA usados no cálculo, com resolução documentada | **Bloqueado**: nenhum dado LOLA adquirido | @maccachera |
| R-11 | Geometria lunar sem refração atmosférica | P0 | #13, #14, #15, #40 | Raio de referência e quadro do corpo documentados; sem refração terrestre | Pendente | @joeljato |
| R-12 | Libração e efeitos orbitais | P0 | #4, #15, #18, #52 | Proveniência SPICE (quadro, época, orientação) e validação contra JPL Horizons | Bloqueado: SPICE não confirmado | @maccachera, @joeljato |
| R-13 | Mapa 2D e visualização 3D explicativa | P1 | #25, #26, #47 | 3D com dados NASA reais ou rotulada como ilustrativa | Pendente | @lisanogueira |
| R-14 | Série temporal e animação | P0 | #21, #25, #26, #47 | Linha do tempo ligada aos mesmos resultados, com rótulos e acessibilidade | Pendente | @lisanogueira |
| R-15 | Sítios alternativos e datas alternativas | P0 | #5, #21, #46, #52 | Alternativa com fonte, ou explicação de que não há alternativa validada | Pendente | @gfreiresjrp, @maccachera |
| R-16 | Replanejamento com atrasos e mudanças de hardware | P0 | #46, #48 | Atraso de entrada, recálculo, restrição alterada e margem; física real, não exemplo estático | Pendente | @gfreiresjrp, @gustavofullstack |
| R-17 | Modos profissional, educativo e público | P0 | #26, #27, #47 | Mesmos valores com explicações técnicas acessíveis | Pendente | @lisanogueira |
| R-18 | Trade-offs entre ciência e engenharia | P1 | #7, #21, #48 | Limiares explícitos, objetivos concorrentes, escolhas não dominadas quando validadas | Pendente | @gustavofullstack |
| R-19 | Datasets NASA, parâmetros, incerteza e rastreabilidade | P0 | #1, #2, #3, #4, #17, #20, #34, #50 | Entradas, IDs, checksums, premissas e limitações visíveis | Bloqueado: nenhum dataset registrado | @maccachera, @Ninzinhu |

## Extensões (D-01 a D-09)

| ID | Requisito | Prioridade | Issues | Evidência exigida | Status verificado (2026-11-14) | Quem valida |
|---|---|---|---|---|---|---|
| D-01 | Hub com cinco áreas: Explorar, Comparar, Recuperar, Ciência e Engenharia, Evidências e Aprendizado | P0 | #47 | Cinco entradas de navegação visíveis; boa hierarquia no celular e teclado | Pendente | @lisanogueira |
| D-02 | Recuperação com atraso de +24/+48/+72 h | P0 | #46 | Cenário reproduzível com entrada, saída e restrições violadas nomeadas | Pendente | @gfreiresjrp |
| D-03 | Sensibilidade a altura do observador, localização, resolução do DEM e passo de tempo | P1 | #49 | Variações quantificadas sem probabilidade não justificada | Pendente | @joeljato |
| D-04 | Negociação ciência–engenharia (Pareto reproduzível) | P1 | #48 | Sem ranking universal opaco nem confusão entre luz e potência elétrica | Pendente | @gustavofullstack |
| D-05 | Histórico de decisões, exportação e recibos de evidência | P1 | #48, #50 | Parâmetros de cenário versionados, manifesto de fontes e status do modelo | Pendente | @gustavofullstack, @Ninzinhu |
| D-06 | Explicações pedagógicas e demo guiada opcional | P1 | #27, #47, #51 | Explicar horizonte lunar, libração, diferença entre luz, potência e comunicação | Pendente | @lisanogueira |
| D-07 | Pesquisa ética dos 15 repositórios concorrentes e licenças | P0 | #51 | Links, data e qualificadores; sem cópia não autorizada | Pendente | @lisanogueira |
| D-08 | Código privado até revisão; demo pública legível pelos juízes | P0 | #10, #11, #32, #34, #50, #51 | Repositório privado com página pública separada; sem senhas para juízes | Parcial: deck de 7 slides com link público existe (comentário em #10); acesso anônimo não verificado | @Ninzinhu, @gustavofullstack |
| D-09 | Submissão em inglês, até 7 slides ou vídeo de 30 s, atribuição correta de IA | P0 | #10, #11, #27, #32, #34, #41, #50 | URL oficial funciona sem login; afirmações batem com o código | Pendente | @Ninzinhu, @lisanogueira |

## Lacunas sem dono claro

- **R-16 e D-02 (recuperação):** #46 e #48 existem, mas não há entrega nem evidência.
- **D-05 (exportação e recibos):** dividido entre #48 e #50, sem dono único. Sugestão: manter em #48 e usar #50 só para o rastreio.
- **R-13 e R-14 (3D e animação):** sem entrega. Dependem de #25 e #47.

## Ações para mim (sem efeito externo)

1. Manter este arquivo atualizado a cada checkpoint.
2. Registrar em `docs/` o que o CI do PR #45 cobre (ver `docs/REVISAO_PR45_CI_NINZINHU.md`).

## Ações que dependem de aprovação

- Atualizar o checklist da issue #50 no GitHub.
- Pedir evidências aos donos das issues listadas acima, por comentário nas issues.
