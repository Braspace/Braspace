# Benchmark independente JPL Horizons — ângulos de Sol e Terra (BS-017, gate G5)

Benchmark independente de efemérides aparentes do Sol (alvo 10) e da Terra (alvo 399)
visto da superfície da Lua, usado como referência externa para o gate G5 (comparação
independente) do BRASPACE / NASA Space Apps 2026. Issue BS-017 (dono humano: Joel, @joeljato).

## O que contém

- `raw/<site>/<epoch>/<body>.json` — resposta bruta (corpo HTTP completo, JSON) de cada uma
  das 48 consultas à API pública do Horizons (3 sites × 8 épocas × 2 corpos), sem chave.
- `benchmark.json` — normalização das 48 entradas: ponto, época, corpo, azimute, elevação,
  convenção de azimute, frame, versão do Horizons e fonte de efeméride informada na resposta,
  mais SHA-256 de cada resposta bruta para rastreabilidade.
- `api/cmd/downloadbenchmark` — comando Go (biblioteca padrão; porta de `download_benchmark.py`) que refaz o
  download de todas as consultas (respeitando no máximo 1 requisição por segundo) e regrava `raw/` + `benchmark.json`.
  Seu teste (`go test ./cmd/downloadbenchmark`) reproduz `raw/` e `benchmark.json` byte a byte a partir das
  respostas brutas já commitadas, sem rede.
- `api/cmd/compareangles` — comando Go (porta de `compare_angles.py`) que compara um arquivo de ângulos
  calculados com o benchmark e imprime o resíduo (calculado − benchmark) por entrada, mais resumo estatístico.
  Seu teste porta `test_compare_synthetic.py` (desvios injetados conhecidos + caso idêntico).

## Como regenerar

```bash
go -C api run ./cmd/downloadbenchmark
```

Reexecuta as 48 consultas contra `https://ssd.jpl.nasa.gov/api/horizons.api` (sem chave),
 aguarda ≥ 1 s entre requisições, grava as respostas brutas em `raw/` e regenera
`benchmark.json`.

## Parâmetros das consultas

| Parâmetro | Valor |
|---|---|
| URL | https://ssd.jpl.nasa.gov/api/horizons.api |
| format | json |
| COMMAND | 10 (Sol) / 399 (Terra) |
| CENTER | coord@301 (superfície lunar por coordenada) |
| SITE_COORD | longitude,latitude,altitude(km) — altitude 0 |
| START_TIME / STOP_TIME | uma época cada (janela de 1 min com STEP_SIZE=1d → uma linha) |
| STEP_SIZE | 1d |
| QUANTITIES | 4 (azimute e elevação aparentes) |

## Convenções (conforme resposta do Horizons)

- **Azimute**: medido no sentido horário a partir do norte local:
  North(0) → East(90) → South(180) → West(270) → North(360).
- **Elevação**: graus acima do plano perpendicular à direção do zenito local da superfície
  de referência; toposcêntrica; refere-se ao **centro do corpo celeste** (não à borda/límb superior).
- **Refração**: NENHUMA (airless); a Lua não tem atmosfera (`Atmos refraction: NO (AIRLESS)`).
- **Correção de luz**: compensada — atraso de luz da ida (down-leg light-time), desvio
  gravitacional da luz, aberração estelar, precessão e nutação.
- **Frame**: `MEAN_ME` (eixo médio Terra/Polar da Lua), reportado no cabeçalho (`Center pole/equ`).
- **Efeméride**: DE441 (reportado como `{source: DE441}`).
- **Versão do Horizons**: 1.2 (campo `signature.version` da resposta).

## Pontos do polo sul lunar (documentados no repositório, `data/LUNAR_SOUTH_POLE_SITES.md` da main)

Todos são *feature centers* da NASA Lunar Surface Data Book (ACD-50044 Rev. A, Appendix A2),
coordenadas planetocêntricas, longitude leste-positiva, acurácia do ponto do feição aprox. 5–10 m.
Não são pontos de pouso nem recomendações de pouso.

| site | nome | latitude (°) | longitude (°) |
|---|---|---:|---:|
| lm1 | Shackleton Rim B | -89.5244 | 56.30993 |
| haworth | Haworth | -86.7639 | -22.77700 |
| shoemaker | Shoemaker | -87.1835 | 62.83502 |

## Épocas (UTC, 12:00) — 8 épocas espalhadas por ~2 meses a partir de 01/12/2026

2026-12-01, 2026-12-09, 2026-12-17, 2026-12-25, 2027-01-02, 2027-01-10, 2027-01-18, 2027-01-26.

## Limites (importante)

1. **O Horizons usa a superfície de referência (esfera/liso MEDIO da Lua, raio 1737,4 km, MEAN_ME),
   NÃO o relevo topográfico (LOLA).** Este benchmark valida o ângulo do corpo celeste
   (Sol/Terra) acima do horizonte de referência, **não** o horizonte do terreno nem a
   visibilidade acima de crateras/encostas.
2. Não substitui máscara de horizonte LOLA nem efemérides SPICE (BS-014/BS-015). É a referência
   independente para comparação (gate G5), não uma declaração de validação científica por si só.
3. `VALIDATED` é uma decisão do responsável científico (Joel); este artefato não a declara.

## Comparação com o código de ângulos do PR 75

O código de ângulos do PR 75 (`api/cmd/spicelunarangles`, NASA/NAIF SPICE; portado de `science/spice_lunar_angles.py`) é source-gated,
PRELIMINAR, válido apenas para o sítio Connecting Ridge (-89.4632, -137.49) e exige kernels
SPICE (o cálculo é feito por `api/naif`, em Go puro). Não foi executado contra estes 3 sítios neste escopo; se for executado no clone,
os resíduos versus este benchmark devem ser reportados no relato (não aqui).

## Status científico

Entradas NASA reais (Horizons/DE441), resposta bruta preservada com SHA-256. Classificação:
`UNVERIFIED_INPUTS` (dados reais não interpretados como medição validada). Este benchmark é a
referência independente; a validação (resíduos vs código do PR 75 / modelo próprio) cabe ao
responsável da área.
