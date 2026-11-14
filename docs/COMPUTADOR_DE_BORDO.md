# Computador de bordo — documentação do tema

Status: protótipo de interface com modelo sintético. Nenhum valor exibido é validado.
Artefatos relacionados: `docs/schema/onboard-computer.schema.json` (esquema), `docs/REQUISITOS_RASTREABILIDADE_NINZINHU.md` (requisitos), `docs/FONTES_OFICIAIS_NASA.md` (fontes).

## 1. Problema

Planejadores de missão e engenheiros precisam comparar locais e datas de pouso no polo sul lunar. Os critérios são iluminação, visibilidade da Terra e obstrução pelo relevo. As ferramentas existentes (QuickMap, Moon Trek, JPL Horizons) são difíceis para quem não é especialista. A missão também muda de data e de local com frequência, e os engenheiros precisam reavaliar alternativas rapidamente.

Público: educadores, planejadores de missão e o público em geral.

## 2. Escopo

### 2.1 Requisitos do desafio (lista da equipe, 19 de base)

Os 19 requisitos R-01 a R-19 e as 9 extensões D-01 a D-09 estão em `REQUISITOS_RASTREABILIDADE_NINZINHU.md`. Resumo:

- **Seleção e comparação de locais:** sítios predefinidos, coordenadas lunares, comparação lado a lado.
- **Tempo:** data e hora UTC, duração, exploração de dias e ciclos, alternativas de data.
- **Geometria:** azimute e elevação do Sol e da Terra em relação ao horizonte real do terreno. Sem refração atmosférica.
- **Janelas:** transições de luz e de visibilidade da Terra, horas com luz, maior escuridão e maior bloqueio.
- **Terreno:** dados LOLA, horizonte topográfico, declives e crateras.
- **Replanejamento:** atrasos de +24, +48 e +72 h, alternativas de sítio e data, restrições violadas.
- **Visualização:** mapa 2D, 3D explicativo (quando houver dado real), linha do tempo com animação.
- **Públicos:** modo técnico e modo educativo.
- **Base científica:** fontes, premissas e limitações visíveis.

### 2.2 Subsistemas adicionados pelo time

Combustível, alimentação, pressurização e oxigênio. Estão no esquema e no protótipo, marcados como ilustrativos. **Não constam da lista de requisitos do desafio.** O escopo do MVP (issue #7) ainda não foi ratificado pelo time, então a inclusão depende dessa decisão.

### 2.3 Fora de escopo

- Orçamento de rádio e janelas da rede de antenas (DSN). A visibilidade geométrica não garante enlace.
- Probabilidade ou percentual de confiança sem calibração.
- Ranking único de sítios que misture ciência e engenharia.
- Relevo 3D apresentado como real sem o dado LOLA carregado.

## 3. Modelo de dados

Esquema: `docs/schema/onboard-computer.schema.json`, versão 0.1.0.

Seções principais: `scenario` (sítio, data, duração, atraso, público), `sky` (Sol, Terra e horizonte), `timeline` (horas com luz, escuridão, visibilidade e janelas), `power` (luz, bateria e combustível), `crew` (alimentação, pressão e O2), `alternatives`, `requirements` (status por requisito) e `provenance`.

Regras do esquema:
- Campos de suporte de vida são ilustrativos por descrição, não por campo.
- Um requisito só pode ser `verified` com pelo menos uma evidência.
- `status` aceita `unverified`, `prototype` e `validated`. Nenhum resultado atual passa de `unverified`.

## 4. Modelo do protótipo

Arquivo: `scratchpad/onboard-full-v2.html`, publicado em https://claude.ai/artifact/368kF1z3jF7BbCGu7fYEqw. Não está no repositório.

### 4.1 Sítios de exemplo

| Sítio | Latitude | Longitude | Rugosidade do horizonte |
|---|---|---|---|
| SYN-SITE-A | −89,5° | 45,0° | 0,0 |
| SYN-SITE-B | −88,9° | −30,2° | 1,0 |
| SYN-SITE-C | −87,6° | 120,0° | 0,5 |

Os valores são sintéticos. Não são sítios de pouso reais.

### 4.2 Equações do modelo

- Sol: elevação `3·sen(2πt/T_lunar)` em graus; azimute `360·t/T_lunar`. `T_lunar = 29,53 dias`.
- Terra: elevação `−1 + 2·sen(2πt/T_orbital + 1)`; azimute `180·t/T_orbital + 90`. `T_orbital = 27,32 dias`.
- Horizonte: `1,5·sen(2·az) + 1,5 + rugosidade·fator + altura_do_observador`.
- Luz: o Sol está acima do horizonte quando sua elevação supera o horizonte no mesmo azimute. A Terra segue a mesma regra.
- Bateria: sobe 3 % por hora com luz e cai 2 % por hora sem luz, limitada entre 0 e 100 %.
- Combustível: massa inicial 450 kg, consumo 1,2 kg/h, reserva mínima 150 kg.
- Alimentação: estoque de 500 kg, consumo de 0,62 kg/pessoa/dia, 4 pessoas.
- O2: estoque de 64 kg, consumo de 0,84 kg/pessoa/dia, pressão parcial fixa em 21,2 kPa.
- Pressão da cabine: fixa em 101,3 kPa, faixa aceita de 95 a 105 kPa.

**Nenhum desses valores tem fonte.** Os períodos das senoides aproximam os ciclos lunar e orbital, mas não usam efeméride. O horizonte é uma função matemática, não o relevo LOLA. Os consumos e estoques são números de exemplo.

### 4.3 Limites para decisão (ilustrativos)

- Escuridão máxima: 30 h.
- Bloqueio da Terra: 24 h.
- Bateria mínima: 20 %.
- Reserva de combustível: 150 kg.

Os limites servem para testar a lógica de viabilidade. Não correspondem a requisitos de missão.

### 4.4 Telas

| Tela | Conteúdo |
|---|---|
| Início | Escolha de sítio, coordenadas, data UTC, duração e público |
| Explorar | Horizonte com Sol e Terra, linha do tempo, próximas transições, mapa polar, reprodução |
| Comparar | Três sítios lado a lado |
| Recuperar | Atrasos de 0 a 72 h por sítio, restrições violadas |
| Ciência e engenharia | Luz, bateria e Terra visível; compromissos; sensibilidade |
| Evidências | Fontes, limitações, requisitos, histórico e exportação JSON |
| Suporte de vida | Combustível, alimentação, pressurização e O2 |

Idiomas: português e inglês. A versão em inglês não passou por revisão técnica.

## 5. Estado dos requisitos

Nenhum requisito está verificado. A lista completa, com issues e evidências exigidas, está em `REQUISITOS_RASTREABILIDADE_NINZINHU.md`. Os bloqueios principais são:

- **Dados NASA:** nenhum dataset foi baixado nem registrado (ver `FONTES_OFICIAIS_NASA.md`).
- **Efemérides:** o Sol e a Terra são senoides. Não há validação contra JPL Horizons.
- **Terreno:** o horizonte é sintético. Não há leitura de DEM.
- **Código real:** o protótipo é JavaScript de interface. O motor Rust do repositório ainda classifica entradas, não calcula efemérides.

## 6. Riscos

1. **Parecer validado sem ser.** Os números e as telas têm aparência de resultado. Todas as telas trazem o aviso de dados sintéticos, mas um print sem legenda pode induzir ao erro. Antes de qualquer captura para a submissão, a legenda deve ser incluída.
2. **Suporte de vida sem base.** Os valores de combustível, alimentação e O2 não têm fonte e não devem aparecer na demo como resultado.
3. **Desafio mal identificado.** A página do desafio citada no repositório não foi encontrada na busca. Se o texto oficial pedir outra coisa, o escopo muda.
4. **Fontes não confirmadas.** Moon Trek e QuickMap ainda não foram verificados por endereço.
5. **Inglês sem revisão.** Termos técnicos traduzidos automaticamente podem ser imprecisos.

## 7. Próximos passos

Estado após a consulta de 2026-11-14 (detalhes em `FONTES_OFICIAIS_NASA.md`):

1. **Texto oficial do desafio:** pendente. A página não abriu por erro de certificado. Abrir no navegador e salvar o texto.
2. **Escopo do MVP:** pendente de decisão do time sobre combustível, alimentação, pressurização e O2.
3. **Dados LOLA:** produtos do PGDA identificados (sítios, arquivos, datas e quadro MOON_ME). Falta escolher o sítio, anotar a versão e confirmar a licença, que não está declarada.
4. **Kernels SPICE:** o kernel de quadros mais recente é `moon_de440_250416.tf`. Falta confirmar o binário de orientação em `pck/`.
5. **Citação dos DEMs:** usar Barker et al. 2021 e Mazarico et al. 2011, conforme o README. A citação de 2023 não está confirmada.
4. Substituir o horizonte sintético por um horizonte calculado a partir do DEM real, com resolução documentada.
5. Validar Sol e Terra contra JPL Horizons em pelo menos um sítio e uma data.
6. Só então alterar os status dos requisitos e os valores exibidos de `ilustrativo` para `validado`, com evidência.

## 8. Itens não verificados

- Texto oficial do desafio no site do Space Apps 2026 (erro de certificado no acesso automático).
- Binário de orientação lunar (`pck/`) e versão exata do kernel de quadros.
- Conteúdo do Moon Trek (página abriu sem texto descritivo).
- Endereço e conteúdo do QuickMap.
- Licença de redistribuição dos produtos LOLA.
