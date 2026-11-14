# MoonProof — front novo pelo design da Heloísa: contrato para todos os agentes

Ordem do Gustavo (14/11, ~19:35 UTC): pegar o artefato inteiro da Heloísa, transformar todas as telas em `.designer.mds` e construir o front novo, completo, com várias telas.
Dona do design e do front: Heloísa (@lisanogueira). Quem constrói entrega PR `[agent]` com ela e o João Victor (@Ninzinhu) como revisores.

## Fontes do design (leia antes de escrever qualquer coisa)
- Capturas: `/opt/data/work/braspace/ref/front/heloisa-telas/*.png`. ABRA com a ferramenta de visão as telas do seu cartão, no arquivo inteiro e depois em recortes (`region`) para ler os números pequenos.
- Texto completo do artefato (todos os rótulos e números): `ref/front/heloisa-telas/ARTEFATO-TEXTO.md`.
- Os dois renders de terreno do artefato (`terreno-*.jpg`) são "render procedural ilustrativo": servem só de referência visual. NÃO entram no repositório.

| Arquivo | Tela |
|---|---|
| `A-mission-control.png` | A · Mission Control (visão geral do local) |
| `B-explorar.png` | B · Explorar (camadas do terreno, cartão do local, "O que se vê daqui") |
| `C-comparar.png` | C · Comparar (3 cenários, veredito, diferenças) |
| `D-replanejar.png` | D · Replanejar (atraso em 4 passos, saídas) |
| `E-cockpit.png` | E · Cockpit (operação simulada, regras, testar um problema, linha do tempo) |
| `F-landing-lab.png` | F · Landing Lab (simulador de pouso) |
| `G-debrief.png` | G · Debrief do pouso |
| `H-evidencias.png` | H · Evidências (passaporte, fontes, hipóteses, quanto confiar) |
| `S-design-system.png` | Design system (componentes, cores, tipografia, medidas) |
| `M1-explorar-celular.png`, `M2-comparar-celular.png` | versões de celular |
| `V3-1-entrada-por-tarefa.png` | v3 · "O que você quer fazer hoje?" (Explorar a Lua / Dar uma aula / Planejar uma missão) |
| `V3-2-mission-control-camadas.png`, `V3-3-comparar-camadas.png` | v3 · cartões em 3 camadas |
| `V3-4-comparar-kit-planejamento.png` | v3 · Kit Planejamento (regras editáveis, exportar, tabela Prova) |
| `V3-5-kit-aula-apresentar.png`, `V3-6-kit-aula-montar-atividade.png` | v3 · Kit Aula |
| `V3-7-arquitetura-camadas.png` | v3 · regras do sistema (núcleo, camadas, kits) |
| `N1-nota-kit.png`, `N2-nota-como-comparar.png` | notas da autora |

A v3 é a proposta mais nova dela ("um núcleo, três camadas, dois kits"). Construímos a v3: as telas A–H são o núcleo, e todo cartão abre em Resposta → Por quê → Prova.

## Design system (do artefato; não invente outro)
- Princípios: "Mapa primeiro. Uma pergunta por tela." O terreno ocupa a tela e os painéis ficam nas bordas; cada tela responde a uma pergunta; todo número diz de onde vem.
- Cores: fundo `#07090C`; cartão preto (números) `#050607`; vidro (contexto e ações) `rgba(12,15,18,.58)` com blur 22; pílula branca `#F2F4F5`; destaque Jade `#2EC4A0` com texto `#04110D`; texto secundário `#B7C0C9`.
- Ciência, nunca só pela cor: Sol `#FFD166`; Terra `#4C9BFF`; Simulação `#B48CF2` (só simulação, hachura); Dado real `#D5DEE7` (contorno); Desconhecido `#808C99` (hachura); Falha `#E5484D` + ícone ✕. Amarelo é reservado ao Sol.
- Tipografia: Manrope + IBM Plex Mono. Título de tela 60/800 (−2,5%); Resposta 22/800; título de cartão 16/700; corpo 14–15/500; rótulo 12,5/600 cinza; número 26/800 tabular; coordenada Plex Mono 12.
- Medidas: raio 26 (cartões), 18 (internos), 999 (pílulas); alvo de toque 44 px; margem de tela 28 px; 8–16 px entre painéis.
- Componentes: navegação em pílulas (Explorar, Comparar, Replanejar, Cockpit, Evidências, Landing Lab em lilás; à direita Aula, Planejar, ajuda, idioma); barra de contexto (local • data • duração, selo de estado, "Abrir em", ação principal); pílula branca; cartão preto de dados; cartão de vidro; círculo de estatística com 4 satélites; marcadores numerados com rota pontilhada; seletor central (anterior, local, próximo) e zoom; selos `VAL` `EST` `SIM` `N/D` `FALHA`; chips de camada "1 Resposta · 2 Por quê · 3 Prova".
- Regras do sistema (v3): toda tela tem as três camadas; um vocabulário só; kits somam, não substituem; estado sempre visível; nada de modos globais; nada de adivinhar o usuário.

## Integridade: o que muda entre o desenho e a tela real
O artefato diz no rodapé: "Números ilustrativos; relevo é render procedural." Os números dele (SR-02, 71%, 46 h, +14 h, a41c9e2) NÃO vão para o código.
1. **Nenhum número fixo no HTML ou no JS.** Todo valor vem de um arquivo de dado do repositório ou de uma resposta da API. Sem dado: "—" com selo `N/D`, nunca 0.
2. **Selo `VAL` só aparece se a origem disser `VALIDATED`.** Hoje nada no projeto está validado. O dado derivado de LOLA + SPICE do Polar Lab tem estado "PRELIMINARY not NASA-reviewed": mostre o selo `PRE` (mesmo estilo de contorno do "dado real", com o texto do estado na camada Prova). Série sintética da API: selo `SIM` e a palavra "synthetic". O teste de cada tela tem que falhar se aparecer "VAL" ou "validated" sem a origem dizer.
3. **Locais reais, não SR-01…SR-05.** Use os sítios de `web/data/sites.json` (cinco: Mons Mouton/IM-2, Malapert Massif, Nobile Rim 1, Connecting Ridge, Peak Near Shackleton) com os nomes de lá; os marcadores continuam numerados.
4. **Bateria "H1" é hipotética.** Tudo de energia, autonomia e folga é `SIM`, com as entradas declaradas visíveis na camada Prova, e vem de `POST /api/onboard/evaluate` ou `site-evaluate`. Se a API não devolve o campo, a tela mostra "—".
5. **Regras (noite ≤ 60 h, perda da Terra ≤ 72 h, piso de 30%)** são limites declarados pelo usuário, com esses valores só como padrão editável e rotulados "assumed limit".
6. **Sem domínio inventado.** `moonproof.app/...` não existe: o link de compartilhar é a própria URL da página com os parâmetros na query. QR code gerado no navegador, sem serviço externo; se não couber, o botão não aparece.
7. **"Dado real" no cartão de Evidências** lista as fontes de `docs/ASSET_LICENSE_MATRIX.md` e `data/ASSET_REGISTRY.json` com o estado de cada uma. Resolução é a do nosso dado (LOLA 80 m reamostrado; ver os `.json` ao lado de cada `.bin`), não "20 m/px".
8. **Landing Lab** é "educational simulation": reaproveite a física de `web/lab/physics.js` (3 graus de liberdade, já na `main`); não escreva outra.

## De onde vem cada dado
- Sítios, métricas de longo prazo, séries horárias (Sol e Terra: azimute, elevação, margem sobre o horizonte), mosaico de relevo e camadas PGDA: `web/data/` (leia `web/data/sites.json`, os `.json` de `web/data/region/` e `web/data/sites/`, e como `web/lab/data.js` e `web/lab/terrain.js` os carregam). IMPORTE esses módulos; não copie nem altere `web/lab/`.
- API (base `window.BRASPACE_API_BASE || ""`, contrato em `api/openapi.json`): `GET /api/sites`, `GET /api/sites/{id}/sky` (horizonte, ângulos, `next_transitions`), `POST /api/compare`, `POST /api/scenarios/delay`, `POST /api/onboard/evaluate`, `POST /api/onboard/site-evaluate`, `POST /api/onboard/report`, `GET /api/layers`, `GET /readyz`, `GET /v1/capabilities`. API fora do ar: a tela continua com o dado estático e mostra "offline · precomputed".
- O que o desenho mostra e NÃO existe em lugar nenhum (pedras < 20 m, "sobreviver ao frio", declividade por sítio se não estiver no dado): `N/D`, como o próprio desenho faz.

## Estrutura de arquivos (para vários agentes trabalharem sem colidir)
Tudo em `web/moonproof/` (pasta nova). Não edite `web/index.html`, `web/app.js`, `web/onboard/`, `web/lab/`, `web/studio/` (o PR 136, rascunho de outra frota, é outro front: não mexa nele nem o copie).
```
web/moonproof/
  index.html            entrada por tarefa (V3-1)
  mission.html          A   explore.html   B   compare.html  C   recover.html  D
  cockpit.html          E   landing.html   F   debrief.html  G   evidence.html H
  present.html          Kit Aula · Apresentar      activity.html  Kit Aula · Montar atividade
  core/tokens.css       cores, tipografia, medidas (única fonte de estilo base)
  core/components.css   pílula, cartão preto, vidro, selos, círculo de estatística, chips de camada
  core/shell.js         navegação, barra de contexto, "Abrir em", kits Aula/Planejar, idioma
  core/layers.js        cartão em 3 camadas (Resposta, Por quê, Prova)
  core/terrain.js       terreno em tela cheia + marcadores + rota pontilhada (usa web/lab/terrain.js)
  core/data.js          sítios, séries e chamadas à API, com origem e estado de cada valor
  core/i18n.js          dicionários en e pt-BR (mesmas chaves; idioma do navegador, botão para trocar)
  core/state.js         cenário atual na query string (local, data, duração, regras, camada)
  screens/<tela>.js     um arquivo por tela (só o dono da tela mexe)
  designer/<ID>.designer.mds   especificação de cada tela
  fonts/                Manrope e IBM Plex Mono servidas localmente (a CSP publicada tem font-src 'self')
  tests/*.test.mjs      node --test
```
- Sem framework e sem etapa de build: módulos ES, HTML e CSS. three.js só pelo CDN que a CSP já permite, na mesma versão de `web/lab/scene.js`. Fontes: arquivos locais com licença OFL registrada em `docs/ASSET_LICENSE_MATRIX.md`; se não der para trazer, pilha de sistema, sem pedir a servidor externo.
- Quem faz o núcleo (`core/`, `index.html`, A e B) é o cartão BR70. Os outros cartões criam SÓ `screens/<tela>.js`, a página HTML da tela, o `.designer.mds` da tela e o teste da tela; se precisarem de algo no `core/`, usam o que existe e anotam o pedido no relato em vez de editar.
- Celular (referências M1 e M2): mapa em cima, folha inferior arrastável, barra de navegação inferior (Explorar, Comparar, Replanejar, Cockpit, Provas). Toda tela funciona a 390 px sem rolagem lateral.
- Acessível: teclado em tudo, foco visível, alvo de 44 px, estado nunca só pela cor, `lang` certo, contraste AA medido.

## Formato do `.designer.mds`
Um arquivo por tela, em português, com estas seções: `# <ID> · <nome>`; **Pergunta que a tela responde**; **Quem usa e em que camada abre**; **Layout** (regiões, em desktop e em celular); **Componentes** (um por linha: nome, o que mostra, estados); **Textos** (todos os rótulos do desenho, em pt-BR e a versão em inglês); **Dados** (tabela: elemento | fonte exata, arquivo ou rota e campo | selo | o que mostrar sem dado); **Interações** (clique, teclado, arrastar); **Ligações** (para quais telas leva); **Diferenças entre o desenho e a tela real** (o que é ilustrativo no desenho e como fica); **Critérios de aceite** (lista verificável).

## Prova de cada entrega
Testes de Node passando; a tela aberta no Chrome sem tela a 1440×900 e 390×844 contra o Compose local; a captura vista com a ferramenta de visão AO LADO da referência, com a lista honesta do que ficou diferente.
