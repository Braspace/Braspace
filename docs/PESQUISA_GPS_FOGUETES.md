# Pesquisa: GNSS em foguetes e na Lua, verificada nos documentos

Versão 2, 2026-11-14. Substitui a versão de resumos. Os números abaixo vêm dos PDFs lidos (trechos técnicos completos, indicados por seção). Nada aqui é dado de missão do nosso projeto.

## 1. Documentos lidos

| Documento | Como foi lido | Uso |
|---|---|---|
| LSIS V1.0 (NASA, jan/2025): sinal AFS | texto completo extraído; seções 2.2, 2.3, 2.4, 2.5 e 2.5.3–2.5.5 lidas | parâmetros de sinal e tempo |
| LNIS V5 (NASA, jan/2025): interoperabilidade | texto extraído; seções 2.1, 3.2.3 e tabelas de mensagens | referência de tempo e quadro |
| LANS Interoperability Demo (ION, 2025) | texto completo; modelo de erro (eq. 5), tabelas 3–7 e resultados | modelo de pseudo-distância e PVT |
| LuGRE, análise de visibilidade (AAS 2022) | seções de simulação, link budget e resultados | C/N0 e filtro |
| LuGRE, artigo NAVIGATION (2025) | texto extraído; resultados de voo e tabela de PVT | resultados reais |
| EUCASS 2019-0657: segurança de voo de lançador | texto extraído; estados do EKF/IKF e tabelas de erro | navegação de foguete |
| EUCASS 2019-0241: PMWE-1 (foguete de sondagem) | texto extraído; resultados de posição | GNSS + IMU em voo |

Não consegui baixar o artigo do ION sobre o SL-15 (a URL devolveu página HTML, não PDF). Os dados do SL-15 continuam vindos só de resumos.

## 2. O que a Lua usa: sinal AFS (LSIS V1.0)

Números verificados:
- **Banda:** 2483,5–2500 MHz (LSIS-010).
- **Portadora:** 2492,028 MHz (LSIS-020); tolerância de 10 Hz (LSIS-030).
- **Polarização:** circular à direita (RHCP) (LSIS-040).
- **Modulação:** BPSK em dois canais em quadratura (LSIS-130).
  - **Canal de dados (AFS-I):** código primário de 2046 chips (Gold de 2047 encurtado), 1,023 Mchip/s, período de 1 ms, 500 símbolos/s (LSIS-140, 221, 200).
  - **Canal piloto (AFS-Q):** código primário Weil de 10230 chips, 5,115 Mchip/s, período de 2 ms; código secundário de 4 chips (8 ms); código terciário de 1500 símbolos (12 s) (LSIS-140, 200, 222).
- **Largura de referência do receptor:** 15,944 MHz (LSIS-090).
- **Potência:** o canal I e o canal Q dividem a potência por uma tabela (LSIS-103).

**Requisitos de erro do sinal (SISE):**
- Posição: **40 m (95%)**, calculado pelo percentil 95 em 24 h (LSIS-001). Atenção: uma versão anterior deste documento dizia "menos de 10 m". Estava errado.
- Velocidade: **1 cm/s (95%)** (LSIS-002).
- Cada nó deve prever o próprio SISE na mensagem MSG-G4 (LSIS-005).

**Tempo de transmissão (ToT, LSIS-720/730):** o receptor calcula o instante de transmissão a partir de quatro campos: TOI (7 bits, 0–99), ITOW (9 bits, 0–503), WN (13 bits, 0–8191) e a contagem de códigos. Um intervalo de bloco (BI) dura 1200 s (20 min); um quadro dura 12 s.

**Mensagem de navegação:**
- Subquadro 1 (SB1): identificador de quadro (FID, 2 bits) e intervalo de tempo (TOI, 7 bits); codificado com BCH(51,8) (LSIS-410 a 420).
- Subquadros 2, 3 e 4: LDPC de taxa 1/2. SB2 tem 1200 bits de dados (2400 símbolos); SB3 e SB4 têm 870 bits cada (1740 símbolos); todos com CRC de 24 bits (LSIS-FID0-440 a 460).
- **Lacuna central:** o conteúdo da mensagem de efemérides e relógio (MSG-G4, seção 2.5.3) é descrito como "a ser especificado" (marcado como `LSIS-TBW-2006`). O documento só diz que a mensagem deve permitir calcular posição e velocidade do nó e corrigir o relógio. **Os parâmetros orbitais e de relógio ainda não estão definidos em público.** Um receptor conforme não consegue calcular a posição de um satélite lunar só com este documento.
- No total, o LSIS tem 44 etiquetas `TBD` ou `TBW`. As mensagens MSG-G5, G10, G11, G14 e G15 também estão sem conteúdo.

## 3. Referência de tempo e quadro (LNIS V5)

- Escala de tempo comum: **LunaNet Reference Time (LRT)**. Cada operador (LNSP) pode manter a própria escala e deve publicar o desvio até o LRT (LNIS 2.1, 3.2.3.2).
- Quadro de referência: selenocêntrico, comum, definido no documento **AD5 "Lunar Reference System and LunaNet Reference Time System Standard"**, marcado como `LNIS-TBD-AD0005`. **O AD5 não está publicado.** Sem ele, nenhum cálculo de posição pode ser comparado entre operadores.
- Tudo isso significa: a interoperabilidade completa depende de um documento que ainda não existe em versão pública.

## 4. Como os resultados de voo se comparam ao LANS

**LuGRE (missão real, 2025), artigo NAVIGATION:**
- Primeira posição GNSS na superfície lunar: 3 de março de 2025, a cerca de 356 237 km da Terra; ponto mais distante, 398 350 km (16 de março). Todas as datas e distâncias estão no texto lido.
- Sinal: a partir de cerca de **33 dB-Hz**, o rastreamento passa a captar lóbulos laterais (side-lobes). Há um limite claro entre lóbulo principal e lateral.
- Geometria: o **GDOP** variou de cerca de 50 (a 15 RE) a valores entre **1000 e 1 000 000** na superfície, dependendo da geometria.
- Erro de PVT em voo: a 15 RE, entre **100 m e 1 km** na componente de distância, e mais de 1 km na lateral. Ou seja, nos dados de voo, a solução de pseudo-distância não atinge precisão de metros na Lua.
- Filtro: o receptor usa solução de mínimos quadrados (PVT) e um filtro de Kalman estendido para órbita (POD). Os dois foram usados em voo.
- Diferença em relação ao previsto: a potência do sinal em voo ficou abaixo da previsão de pré-voo (versão de slides; não verifiquei o número exato no artigo).

**LuGRE, análise de projeto (AAS 2022):**
- Limite de aquisição planejado: **23 dB-Hz**, com 3 dB de margem sobre os 20 dB-Hz esperados.
- Link budget (tabela 2): perdas de implementação 0,9 dB; temperatura do sistema 162 K; perda de polarização 1 dB; ganho de antena de recepção 16 dB; potência de transmissão dos satélites GPS: IIR 17,3 dBW, IIR-M 18,8 dBW, IIF 16,2 dBW, III 18,8 dBW; Galileo 11 dBW.
- Clock: VCTCXO (oscilador de cristal compensado em temperatura), comparado com relógio atômico (USO) nas simulações. Doppler melhora muito o resultado nos dois casos.
- Duração mínima de operação recomendada: **1 hora**.

**LANS (ESA, NASA, JAXA), simulação de 2025:**
- Modelo de pseudo-distância (eq. 5): distância geométrica (com tempo de luz), mais o erro de relógio do receptor, menos o erro de relógio do satélite, mais o erro de correção GPS-Galileo (GGTO, 2 ns) e o ruído térmico do DLL. Não modela atmosfera (a Lua não tem atmosfera relevante) nem multicaminho ainda.
- Satélites simulados: 27 Galileo (almanaque de 2025-04-11) e 31 GPS (Yuma, semana 311 de 2025), na semana de 10 a 17 de junho de 2026.
- **Erro de SISE:** modelo de Gauss-Markov de primeira ordem. Cenário de 20 m (95%), que é a meta da especificação AFS.
- **Resultados de PVT (tabela 4):**
  - Texto do artigo: 4,2 m (68%) com DEM e 13,5 m (68%) sem DEM.
  - Tabela 4, linha 'LANS + DEM': média 13,24 m e percentil 68% de 13,49 m. Os dois números não batem com o texto; o artigo deve ser lido com cuidado antes de citar um valor.
  - Com DEM e SISE de 10 ± 1 m: média de 4,31 m.
  - Com troca de medidas de dois sentidos (TWM) síncrona: 3,70 m.
- Ponto-chave: sem DEM, o DOP fica muito alto por causa do número pequeno de satélites. O DEM é usado como medida de altura vertical.

## 5. Como um foguete usa GNSS (artigos lidos)

**Arquitetura (EUCASS 2019-0657, lançador de 50–500 kg):**
- O módulo de navegação funde IMU e GNSS.
- **Antes da liberação:** filtro de Kalman indireto (IKF), que compara posição, velocidade e atitude com a IMU.
- **Em queda livre:** filtro de Kalman estendido (EKF), com estado de posição, velocidade, aceleração específica, velocidade angular e ângulos de Euler (eq. 1).
- O alinhamento da IMU é feito com GNSS em voo ("transfer alignment").
- O módulo de navegação alimenta o cálculo de impacto (GSA) e o de segurança de voo (FSA).

**Resultados de simulação (mesmo artigo):**
- Erro de posição depois do alinhamento: 0,17 m (média).
- Erro de velocidade no ignição: 0,00073 m/s² (ver tabela 6).
- Erro de posição com falha de IMU/GNSS: a tabela 7 mostra o raio de 99,99% de até 9,61 m para uma combinação de fator de carga e repetições.

**Voo real (PMWE-1, foguete de sondagem, 2018, artigo EUCASS 2019-0241):**
- Sensores: IMU MEMS STIM300, receptor GPS DLR Phoenix, e direção do Sol a partir de vídeo.
- Interrupções de até **10 s** de sinal GNSS são comuns; é por isso que a IMU é necessária.
- Erro estimado (3σ) de posição do GPS/IMU: **16,1 m (Norte), 14,1 m (Leste), 16,8 m (Baixo)**.
- O erro de posição vem sobretudo da precisão das pseudo-distâncias e da geometria da constelação GPS.

**Limites de exportação:** o artigo do PMWE-1 registra que plataformas inerciais "roll-isolated" são controladas pelo ITAR. Isso confirma o problema que eu já tinha apontado (receptor espacial controlado). Não verifiquei o texto regulatório.

## 6. Diferenças em relação à versão anterior

| Item | Versão anterior | Verificado nos PDFs |
|---|---|---|
| Erro de posição do sinal lunar | "< 10 m (95%)" | **40 m (95%)** (LSIS-001) |
| Canal de dados | não tinha | 1,023 Mchip/s, 500 sps, código de 2046 chips |
| Canal piloto | não tinha | 5,115 Mchip/s, código de 10230 chips, 12 s de terciário |
| "900 bits para efemérides" | citado de um resumo | **não encontrado** nos documentos lidos; removido |
| Efemérides lunares | "exemplo de parâmetros" | **não definidas** (MSG-G4 em TBW) |
| Quadro e tempo | não tinha | AD5 não publicado (TBD) |

## 7. Caminho para um GPS funcional

Existem dois caminhos distintos, e eles não são equivalentes:

**A. Motor de PVT para GNSS terrestre e de foguete (funcional com dados reais).**
- Entradas: efemérides broadcast (RINEX) ou almanaques (Yuma), e pseudo-distâncias e Doppler medidos ou simulados.
- Algoritmos: mínimos quadrados ponderados (WLS), depois EKF com IMU sintética (a arquitetura do EUCASS 2019-0657).
- Validação: contra as tabelas publicadas (PMWE-1 e LANS), não contra números inventados.
- Pode ser feito no projeto como ferramenta offline, em Python, sem quebrar as regras do ADR-0001 (cálculo offline, API só lê).

**B. Simulação do sinal lunar LANS (funcional só como simulação).**
- Pode usar o modelo de erro da eq. 5 do LANS, o link budget do LuGRE e os parâmetros de sinal do LSIS.
- **Não pode** calcular posição de satélite lunar real, porque a mensagem de efemérides e o quadro de referência ainda não existem em público.
- Tudo deve ser rotulado SINTÉTICO, sem números de voo como entrada.

**Recomendação:** começar pelo caminho A, porque ele tem dados reais e validação publicada. O caminho B fica como simulação exploratória, com a lacuna do MSG-G4 declarada na interface.

## 8. Restrições

- **COCOM:** não implementar contorno do limite de 18 km e 515 m/s em nenhum simulador ou receptor. Qualquer receptor espacial exige avaliação de exportação.
- **Não é missão real:** a saída é de pesquisa e de simulação. Não usar palavras como "validado" ou "certificado".
- **Licenças:** verificar a licença de qualquer dado de efemérides (NAVCEN, IGS) antes de incorporar ao repositório.

## 9. Próximos passos

1. Decidir com o time se o motor de PVT (caminho A) entra no escopo da missão. Isso muda o trabalho de dias para semanas.
2. Baixar um almanaque Yuma público (NAVCEN) e um RINEX de navegação (IGS/CDDIS), e validar um cálculo de posição estática contra a solução de referência.
3. Acompanhar a publicação do AD5 e do MSG-G4 (LunaNet). Enquanto não houver, o caminho B fica como simulação.
4. Ler na íntegra o artigo do SL-15 (ION), por URL de PDF direta, quando estiver disponível.

## 10. Como fica no nosso projeto (estado em 2026-11-14)

Esta seção descreve o que o projeto já faz, o que está em andamento e o que ainda depende de dados ou decisões. Ela substitui a lista de próximos passos da seção 9 para o trabalho de navegação.

### 10.1 O que já existe

- **Aba Navegação** na dashboard (PR #250, em rascunho). Calcula, a cada passo, quantos satélites GPS-like estariam visíveis para um lugar lunar, o GDOP e se há solução, com três limites de GDOP (6, 50 e 1000). Tudo rotulado SINTÉTICO.
- **Geometria** em `web/onboard/nav.js`: referencial centrado na Lua, posição do lugar pela latitude e longitude, Terra no ponto sub-Terra com libração aproximada, 24 satélites em 6 planos, máscara de 5°, bloqueio pela Lua e pela Terra.
- **Testes:** 10 testes de geometria, incluindo GDOP calculado à mão (valor 2).

### 10.2 Como vai ser a API

- Um endpoint `POST /api/onboard/navigation` no Go, com a mesma geometria de `nav.js`. A dashboard passa a consumir o resultado da API, em vez de calcular no navegador.
- Entrada: lugar (ou latitude e longitude), janela de tempo, passo, e os limites de GDOP e de satélites.
- Saída: uma linha por passo (satélites visíveis, GDOP, solução sim ou não), o resumo e as interrupções, com as premissas usadas, para a dashboard mostrar a origem de cada número.
- Dois cálculos (JavaScript e Go) devem dar o mesmo resultado para a mesma entrada. Um teste de paridade garante isso.

### 10.3 O que vem do almanaque real (depois)

- **Efemérides GPS reais** (almanaque Yuma, publicado pelo NAVCEN) substituem a constelação genérica. Isso exige decidir a fonte, verificar a licença e salvar a data do almanaque no repositório.
- **Processamento offline:** a conversão do almanaque para uma tabela de posições fica fora da API, como manda o ADR-0001. A API só lê a tabela.
- **Validação:** a geometria com almanaque real deve bater com um cálculo de referência em um ponto conhecido (ver seção 9, passo 2).

### 10.4 O que depende de dados que ainda não existem publicamente

- **MSG-G4 (efemérides lunares) e AD5 (referencial e tempo lunar):** sem eles, não há posição lunar real via LANS. O projeto continua com a constelação GPS-like (simulação) até esses documentos serem publicados.
- **Sinais de lóbulo lateral:** o LuGRE mostra que parte das soluções na Lua vem desses sinais. O modelo atual não os inclui, então a disponibilidade calculada é uma estimativa conservadora para o caso de feixe principal.

### 10.5 O que a dashboard vai afirmar e o que não vai

- **Vai afirmar:** quando, na simulação, a geometria dos satélites GPS-like daria solução com cada limite de GDOP, e por quanto tempo essas soluções faltam.
- **Não vai afirmar:** precisão de posição em metros. Isso depende de erro de medida e de relógio, que ainda não são premissas decididas. Quando forem, a tela mostra o erro como GDOP vezes erro de medida, com o erro escolhido visível.
- **Não vai afirmar:** que o lugar terá GNSS na missão real.

### 10.6 Etapas e critérios para avançar

| Etapa | Entrega | Critério para avançar |
|---|---|---|
| 1 (feita, PR #250) | Aba Navegação no navegador | Time aprova as premissas |
| 1b (em andamento) | Endpoint Go e paridade com `nav.js` | Testes Go e JS dão o mesmo resultado para a mesma entrada |
| 2 | Almanaque GPS real, processamento offline | Licença verificada e validação contra cálculo de referência |
| 3 | Erro de posição (GDOP × erro de medida) | Premissa de erro escolhida pelo time e rotulada |
| 4 | Filtro de Kalman com IMU | Etapa 3 concluída e decisão de escopo |

### 10.7 Decisões que o time precisa tomar

1. Aprovar os três limites de GDOP e a máscara de 5°, ou escolher outros.
2. Escolher a fonte do almanaque real (NAVCEN) e autorizar o download.
3. Decidir se o erro de medida entra na dashboard antes do almanaque real, ou depois.
4. Confirmar se a etapa 4 (Kalman) entra no escopo da missão.
