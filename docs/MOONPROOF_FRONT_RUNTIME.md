# MoonProof — runtime do front (Lua 3D, Explorar, nave, densidade, deploy)

Estado em 15/11/2026, `main` 4d7565a+ (Worker `braspace-moonproof`). Entrada pública: <https://braspace-moonproof.almeida-me.workers.dev/moonproof/>.
Este documento descreve **como o painel funciona hoje** e onde mexer. Visual: design system da Heloísa (`web/moonproof/core/tokens.css`).

## 1. Uma Lua só: `web/moon-hd/backdrop.ts`

Toda tela do MoonProof usa a **mesma** cena three.js do Moon HD do Joel (`moon-hd/scene.ts`), montada por `backdrop.js`:

| Tipo de página | Tag | Comportamento |
|---|---|---|
| Fundo decorativo (`index`, `evidence`, `rules`, `debrief`) | `<script type="module" src="../moon-hd/backdrop.js" data-moon-backdrop="pole">` | Lua atrás dos painéis (véu para contraste AA), órbita lenta, arrastar o fundo vazio gira (mouse/caneta), roda/pinça zoom. |
| Mapa funcional (`mission`, `explore`, `compare`, `plan`, `recover`, `cockpit`, `landing`, `present`, `activity`) | `... data-moon-backdrop="globe" data-moon-lazy` | O relevo LOLA da tela continua sendo o mapa. Só o botão **Explorar a Lua** aparece; three.js e texturas carregam no clique ("Carregando a Lua…", `aria-busy`). |

- **Explorar a Lua ↔ Mostrar painéis** (`.moon-ui .moon-open`, Esc volta): Lua em tela cheia por cima dos painéis, `html.moon-explore-on`.
- **Câmera** (#368): fora do Explorar, vista global afastada (`VIEW_DEFAULTS`: globe 7.5 R, pole 4.4 R). No Explorar, `focusLatLon` orbita o **local** (alvo na superfície, 42° de elevação, do lado do Sol, 0.45 R; mais longe em retrato). Funções puras testadas: `orbitCamera`, `tweenPose`, `nearPlane`, `facesCamera`, `clampRange`, `clampPitch`.
- **Locais**: `GET /api/sites` → pins (`.moon-pin`; verde = tem série). Clique voa até o local e emite `moon:site-selected`. `?site=<id>` pré-seleciona. Rótulos sobrepostos: `declutterLabels()` mantém selecionado > com série; os demais mostram o nome no hover/foco (#375).
- **Relevo LOLA (cap)**: desktop carrega após o 1º frame; celular só ao abrir o Explorar, versão leve `PHONE_CAP` (#376).
- **Sem WebGL de hardware** (SwiftShader, VM): páginas decorativas mostram o poster real do Joel (`moon-hd/poster-fallback.ts`); páginas de mapa mostram "Lua 3D indisponível neste dispositivo".
- **Reduced motion**: sem órbita automática, tweens viram salto; continua interativo.

### API pública (`window.moonBackdrop`, evento `moon-backdrop:ready`)

```ts
{ THREE, scene, camera, moon, renderer,
  requestDraw(), toScene(latDeg, lonDeg, r = 1): Vector3,   // raio da Lua = 1
  focusLatLon(lat, lon, dist), selectSite(id), explore(on),
  onFrame(cb(dt, now)) => unsubscribe, pins: {id,name,lat,lon}[], selectedId }
```
Eventos: `moon:site-selected` (saída), `moon:focus-site` `{id}` (entrada). **Nunca** criar um segundo canvas/Lua: adicione objetos a `scene`.

## 2. Nave estilo Artemis (`web/moon-hd/artemis.ts`)

`buildArtemisLander(THREE, opts)` — lander **hipotético**, primitivas three.js, sem insígnias. É a mesma nave:
- no **Landing Lab** gamificado (`web/lab/scene.ts addLander/updateLander`, 4 m entre pés, chama pela lei de empuxo original);
- no **Cockpit** (`web/moon-hd/artemis-cockpit.ts`): entra na cena do backdrop sobre o local do cockpit (ou o polo sul), r ≈ 1.03–1.06, paira com chama pulsando, estática com reduced-motion; aviso "Ilustrativo — lander hipotético, não é telemetria". Botão "Ver nave na Lua 3D".

## 3. Densidade e painéis

- **Densidade "75%"** (`web/moonproof/core/density.css`, importado no topo de `tokens.css`): `zoom` 0.8 (≥1024 px) / 0.9 (701–1023 px) **só nos contêineres de UI mais externos**. Tokens e medidas da Heloísa intactos; terreno, mapas, marcadores e Lua sem zoom (o JS deles usa `innerWidth`).
- **Recolher painéis**: `core/collapse.ts` (botões `.mp-fold` nas bordas, desktop >900 px). Cockpit: cartões secundários em `<details>` fechados por padrão, "+N regras" (`screens/cockpit-fold.ts`, estado em `sessionStorage`).
- **Toque**: `@media (pointer:coarse)` garante ≥44 px nos controles do chrome.
- **Fontes de dados na UI**: rótulos legíveis ("API ao vivo (comparação)"), nunca a rota crua; selos SIM/PRE/EST/N/D sempre visíveis.

## 4. Deploy do Worker (front)

```bash
cd deploy/cloudflare && cp wrangler.toml.example wrangler.toml        # wrangler.toml é gitignored
export CLOUDFLARE_ACCOUNT_ID=b6d9214ed8ad16fa0ebf37ac7785b141          # conta "Almeida.me"
# só publique se TODOS os testes passarem:
(cd ../../web && npm run -s build:ts && git diff --quiet && node --test tests/*.test.mjs moonproof/tests/*.test.mjs) \
  && node --test ./*.test.mjs && npx -y wrangler@4 deploy --message "main $(git rev-parse --short HEAD)"
node ../../scripts/smoke-prod-worker.mjs        # 35/35: todas as rotas OpenAPI + páginas
```
- Entry `moonproof-worker.mjs` só com `export default` (workerd recusa named exports) e `redirect: "manual"` no proxy (workerd não aceita `"error"`).
- Rollback: `npx wrangler deployments list --name braspace-moonproof` → `npx wrangler rollback <version>`.
- Tags de release: `moonproof-AAAA-MM-DD.N` (fora de `v*`, que aciona o job GHCR do `ci.yml`).

## 5. Verificação visual com GPU real (EXO-X1)

Headless cai em SwiftShader e o backdrop se recusa (de propósito). Para ver a Lua: Playwright + `/usr/bin/google-chrome`, `headless:false`, `--ozone-platform=wayland`, `WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000`.

## 6. Histórico (PRs)

#312/#315 proxy same-origin · #319→#340 Lua interativa, pins, densidade, poster · #337 painéis recolhíveis · #348/#355/#359/#360 QA de produção · #349 nave Artemis · #362 declutter do cockpit · #368 câmera em órbita · #375 rótulos · #376 cap no celular · #377 rótulo de fonte · #379 carregando/sem rótulo da nave.
