# Fontes oficiais NASA — verificação do computador de bordo

Consultas feitas em 2026-11-14, por busca pública e leitura das páginas com WebFetch. Nada foi baixado para uso no projeto. Quando uma verificação falhou ou não foi possível, a linha diz isso.

## Resumo

| Fonte | O que foi verificado | Situação |
|---|---|---|
| PGDA, "High-Resolution LOLA Topography for Lunar South Pole Sites" (`pgda.gsfc.nasa.gov/products/78`) | Lista de sítios, nomes de arquivo, datas, quadro e resolução | **Verificada** |
| Diretório de dados do PGDA (`pgda.gsfc.nasa.gov/data/LOLA_5mpp/`) | README com citações | **Verificada**; licença não declarada |
| NAIF, diretório `generic_kernels/fk/satellites/` | Kernels de quadro lunares e datas | **Verificada** |
| JPL Horizons API (`ssd-api.jpl.nasa.gov/doc/horizons.html`) | Versão, endpoint e parâmetros | **Verificada** |
| JPL Horizons manual (`ssd.jpl.nasa.gov/horizons/manual.html`) | Códigos de quantidades do observador | **Verificada** |
| Moon Trek (`trek.nasa.gov/moon/`) | Página abriu parcialmente, sem texto descritivo | **Parcial** |
| Página do desafio no Space Apps 2026 | Erro de certificado no acesso; não encontrado por busca | **Não verificada** |
| QuickMap (`quickmap.lroc.asu.edu`) | Endereço não apareceu nos resultados | **Não verificada** |
| LOLA Data Node (`imbrium.mit.edu`) | Apareceu em busca; não foi aberto | **Não verificada diretamente** |

## 0. Dataset escolhido pela equipe (prevalece sobre as seções 1 e 7)

Atualização de 2026-11-14, após leitura da branch `team/maccachera/spaceapps-2026` (PR #71, em rascunho, ainda não está em `main`):

- **Produto:** `LDEM_80S_80M.IMG` (rótulo `LDEM_80S_80M.LBL`), PDS `LRO-L-LOLA-4-GDR-V1.0`, versão V2.0.
- **Resolução:** 80 m por pixel, 80°S a 90°S, 7.600 × 7.600 amostras, 115.520.000 bytes.
- **Formato:** `LSB_INTEGER` de 16 bits. `HEIGHT_m = DN × 0.5`. Raio de referência 1.737.400 m.
- **Projeção:** polar estereográfica, latitude planetocêntrica, longitude positiva para leste. Quadro MOON_ME do DE421.
- **Verificação:** SHA-256 conferido no arquivo local e no download oficial do PDS, segundo `data/LOLA_80S_80M_VERIFICATION.md` do branch.
- **Status:** o arquivo não está versionado no Git. O time ainda aguarda reconhecimento de Joel e Gabriel. Nenhum cálculo com ele foi feito.

**Correção:** a recomendação anterior de usar o `Site01` do PGDA (5 m) não vale para o time. Esse produto fica como alternativa de maior resolução, sem seleção. A projeção não é mais "a confirmar": o rótulo do dataset já a descreve. Ainda falta conferir com `gdalinfo` no arquivo real.

## 1. LOLA: DEMs do polo sul (PGDA, alternativa não escolhida)

**Produto:** "High-Resolution LOLA Topography for Lunar South Pole Sites", de Michael Kenneth Barker, NASA Goddard.

- **Sítios** (por nome): Site01, Site04, Site06, Site07, Site11, Site20, Site20v2, Site23, Site42, Haworth, Shoemaker, DM1, DM2, SL2, SL3, NPA, NPB, NPC, NPD, LM1 a LM8.
- **Arquivos por sítio:** `SiteXX_final_adj_5mpp_surf.tif` (altura, em metros), `SiteXX_final_adj.xyzi` (nuvem de pontos), `..._ldec.tif` (contagem), `..._slp.tif` (declive, em graus), `..._toterr.tif` (incerteza total), `..._slperr.tif` (incerteza do declive), `SiteXX_ROIs.tgz` (shapefiles) e 100 clones de erro.
- **Datas de publicação na página:** Site42, DM1 e SL2 em 2021-04-26; NPA e NPB em 2021-05-24; NPC e NPD em 2021-06-14; LM1 a LM8 em 2021-08-10; Site20v2 em 2022-08-15. A página não dá uma data geral do produto nem um número de versão.
- **Quadro e projeção:** GeoTIFFs em estereográfica polar sul, em metros, no quadro MOON_ME da efeméride DE421.
- **Resolução:** 5 m/pixel. Cerca de 90% dos pixels são interpolados.
- **Download:** `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/` e subpastas `SiteXX/`.

**Citações pedidas pelo README do diretório** (`https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README`):
- Barker et al., 2021, *Planetary and Space Science*, vol. 203, 105119, doi:10.1016/j.pss.2020.105119.
- Mazarico et al., 2011, *Icarus*, vol. 211, n. 2, p. 1066–1081, doi:10.1016/j.icarus.2010.10.030 (numeração dos sítios).

**Licença:** não declarada na página nem no README. Antes de redistribuir, verificar com a NASA ou a equipe LOLA.

**Atenção à citação:** uma busca anterior citou "Barker et al., 2023, *Planetary Science Journal*, 4, 183" para os produtos 20 m. O README consultado cita o artigo de 2021 acima. A citação de 2023 **não foi confirmada** nesta consulta e não deve ser usada até ser verificada.

**Ainda não confirmado:** qual sítio ou produto o projeto usaria, e o identificador de versão de cada arquivo.

## 2. NAIF SPICE: quadros lunares

Diretório `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/`:

| Arquivo | Última modificação |
|---|---|
| `moon_de440_250416.tf` | 2025-04-16 |
| `moon_080317.tf` | 2013-07-18 |
| `moon_assoc_pa.tf` | 2008-03-18 |
| `moon_assoc_me.tf` | 2008-03-18 |

- **Mais recente:** `moon_de440_250416.tf`. Isso corrige a versão anterior citada (`moon_de440_220930.tf`), que não é a atual.
- **Quadros:** MOON_PA (eixos principais de inércia) e MOON_ME (média Terra–polo). A diferença é uma rotação constante, no kernel de quadro em texto.
- **Nomes gerados por versão:** `MOON_ME_DE421` (id 31007) e `MOON_PA_DE421` (id 31006). Os nomes genéricos `MOON_PA` e `MOON_ME` apontam para a versão mais recente.
- **Associação:** `moon_assoc_me.tf` define o quadro do corpo como MOON_ME; `moon_assoc_pa.tf`, como MOON_PA.
- **Aviso da NAIF:** `IAU_MOON` não serve para orientação lunar de alta precisão. Usar MOON_ME ou MOON_PA.
- **Binário de orientação:** não verificado nesta consulta. A versão mencionada antes (`moon_pa_de440_200625.bpc`) precisa ser conferida no diretório `pck/` antes de uso.

## 3. JPL Horizons

- **Versão da API:** 1.3 (junho de 2025).
- **Endpoint:** `https://ssd.jpl.nasa.gov/api/horizons.api`.
- **Parâmetros de um exemplo de observador:** `format=text`, `COMMAND='301'` (Lua), `OBJ_DATA='YES'`, `MAKE_EPHEM='YES'`, `EPHEM_TYPE='OBSERVER'`, `CENTER='500@399'` (geocentro, codificado como `500%40399`), `START_TIME`, `STOP_TIME`, `STEP_SIZE` e `QUANTITIES`.
- **Códigos de quantidades** (manual, seção "Definition of Observer Table Quantities"):
  - 1: RA e DEC astrométricos.
  - 4: azimute e elevação aparentes (AZ-EL).
  - 10: fração iluminada.
  - 20: alcance e taxa de alcance.
  - 23: elongação solar (Sol–observador–alvo).
  - 24: ângulo de fase (Sol–alvo–observador).
  - 25: ângulo alvo–observador–Lua e fração iluminada.

**Correção:** uma versão anterior deste documento dizia que o código 25 era a fração iluminada. O código correto para a fração iluminada é o 10. O código 25 trata do ângulo com a Lua.

## 4. Moon Trek

A página `https://trek.nasa.gov/moon/` abriu, com título, cabeçalho e logo JPL, mas sem texto descritivo. Não foi possível confirmar ferramentas (como DEM LOLA), termos de download nem citação. Não usar como fonte até uma leitura completa.

## 5. Página do desafio no Space Apps 2026

- As issues do GitHub e o quadro de trabalho citam `https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/`.
- A busca não encontrou esse nome.
- Duas tentativas de leitura (`/2026/challenges/` e `/2026/`) retornaram erro de certificado ("unable to get local issuer certificate"). Não foi possível confirmar o texto do desafio por essa via.

**Ação necessária:** abrir o endereço no navegador e copiar o texto oficial para o repositório. Sem isso, o escopo do projeto não está confirmado.

## 6. QuickMap

O nome e a função foram confirmados por notícia de terceiros. O endereço `quickmap.lroc.asu.edu` não apareceu na busca nem foi lido.

## 7. LOLA Data Node (`imbrium.mit.edu`)

Apareceu em busca como nó de dados LOLA com DEMs de 5 m/pixel. A página não foi aberta nesta consulta, então o produto e o identificador não foram confirmados.

## Pendências antes de usar qualquer dado

1. Abrir a página do desafio no navegador e salvar o texto oficial.
2. Produto LOLA já escolhido pela equipe (seção 0). Falta o reconhecimento de Joel e Gabriel e a entrada em `main` pela PR #71.
3. Confirmar licença de redistribuição do produto LOLA escolhido.
4. Confirmar o binário de orientação lunar (`pck/`) e a versão do kernel de quadros.
5. Abrir Moon Trek e QuickMap no navegador e registrar o que de fato oferecem.
6. Só então marcar a fonte como "baixada" ou "usada" em `data/NASA_SOURCES_TEMPLATE.md`.

Até lá, todas as fontes continuam no estado **candidata**.
