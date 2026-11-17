# MoonProof — runtime do front (Lua 3D, Explorar, nave, densidade, deploy)

Estado em 15/11/2026, `main` 4d7565a+ (Worker `braspace-moonproof`). Entrada pública: <https://braspace-moonproof.almeida-me.workers.dev/moonproof/>.
Este documento descreve **como o painel funciona hoje** e onde mexer. Visual: design system da Heloísa (`web/moonproof/core/tokens.css`).

## 1. Uma Lua só: `web/moon-hd/backdrop.ts`

Toda tela do MoonProof usa a **mesma** cena three.js do Moon HD do Joel (`moon-hd/scene.ts`), montada por `backdrop.js`:

| Tipo de página | Tag | Comportamento |
|---|---|---|
| Fundo decorativo (`index`, `evidence`, `rules`, `debrief`) | `<script type="module" src="../moon-hd/backdrop.js" data-moon-backdrop="pole">` | Lua atrás dos painéis (véu para contraste AA), órbita lenta, arrastar o fundo vazio gira (mouse/caneta), roda/pinça zoom. |
| Cockpit principal (`cockpit`) — **candidato P0 #456** | `... data-moon-backdrop="pole"` sem `data-moon-lazy` | Carrega a Lua do Polo Sul de Joel atrás dos nove painéis e usa a Artemis ilustrativa da **mesma cena**. O modo **Só a Lua** apenas abre a visualização imersiva, sem criar outro renderizador. Sem GPU, usa o poster real de Joel, enquanto o cockpit e a API continuam disponíveis. |
| Mapa funcional (`mission`, `explore`, `compare`, `plan`, `recover`, `landing`, `present`, `activity`) | `... data-moon-backdrop="globe" data-moon-lazy` | O relevo LOLA da tela continua sendo o mapa. Só o botão **Explorar a Lua** aparece; three.js e texturas carregam no clique ("Carregando a Lua…", `aria-busy`). |

**Gate P0 de lançamento (não publicado):** esta configuração do cockpit precisa de teste EXO-X1 com WebGL de hardware real, SwiftShader/no GPU, desempenho em 320/390/768/1024/1440/1920, uma única instância Three.js, capa do poster se a GPU falhar, sincronização dos locais e Artemis, alvos touch e teste de restauração real dos nove painéis (PR #454). Não confundir revisão de fonte com evidência de imagem na produção.

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
# deploy/cloudflare/wrangler.toml é VERSIONADO (run_worker_first com /data/*, gzip dos grids): não sobrescreva com o .example.
CLOUDFLARE_ACCOUNT_ID=b6d9214ed8ad16fa0ebf37ac7785b141 deploy/cloudflare/deploy.sh "nota"
#   recusa árvore suja · roda os testes do Worker · grava o commit em web/config.js só no upload · smoke · imprime o rollback
node scripts/smoke-prod-worker.mjs                                       # 35/35: rotas OpenAPI + páginas
CHROME_PATH=/usr/bin/google-chrome node web/browser/pages-js-errors.mjs https://braspace-moonproof.almeida-me.workers.dev   # 13 telas × 1440/390
```
Antes do deploy, na main: `cd web && npm run -s build:ts && git diff --quiet && node --test tests/*.test.mjs moonproof/tests/*.test.mjs` (fail 0).
- Entry `moonproof-worker.mjs` só com `export default` (o workerd recusa named exports) e `redirect: "manual"` no proxy (o workerd não aceita `"error"`).
- Rollback: `npx wrangler rollback <version>` (o deploy.sh imprime a versão anterior).
- Tags de release: `moonproof-AAAA-MM-DD.N`.

## 5. Verificação visual com GPU real (EXO-X1)

Headless cai em SwiftShader e o backdrop se recusa (de propósito). Para ver a Lua: Playwright + `/usr/bin/google-chrome`, `headless:false`, `--ozone-platform=wayland`, `WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000`.

## 6. Histórico (PRs)

#312/#315 proxy same-origin · #319→#340 Lua interativa, pins, densidade, poster · #337 painéis recolhíveis · #348/#355/#359/#360 QA de produção · #349 nave Artemis · #362 declutter do cockpit · #368 câmera em órbita · #375 rótulos · #376 cap no celular · #377 rótulo de fonte · #379 carregando/sem rótulo da nave.

## 2026-11-16 — P0 canonical entry reconciliation (source-only)

- Base main SHA: `5ad8313f9bc25f232d75d1362227d436eed2cbf9` (GitHub compare main...SHA identical at audit).
- Isolated branch: `agent/cockpit-entry-reconcile-20261116-0253`.
- Reused existing `screens/cockpit-entry.js` adapter; index now points at Cockpit, with manual no-JS link and Heloísa token/component styles. The full chooser remains `tasks.html`; cockpit tutorial remains in `cockpit.html`. No change to Three.js scene, Artemis, science, backend or data.
- Source-only, **UNVERIFIED**: exact-SHA CI, Node/TypeScript, real Chromium pointer/keyboard/GPU/noGPU 320/390/768/1024/1440/1920, Go/Rust/PG/pgvector, Worker rollout and rollback. No merge or deploy authorized.
- Next gates: verify entry query/hash and history, no-JS fallback, tours, poster fallback, shared renderer and restore pointer per #454, #456, #457. Preserve PRELIMINARY/SYNTHETIC scientific status.


### 2026-11-16 — Isolated canonical-entry test reconciliation

- Base: PR #498 head `199fde9a586610f1236b83a0c8810819b0ebc6f3` (main observed `5ad8313f9bc25f232d75d1362227d436eed2cbf9`).
- Branch: `agent/cockpit-entry-tests-20261116-0806`; update only `web/moonproof/tests/cockpit-entry.test.mjs` plus this audit record. Do not overwrite PR #498's head.
- Changed the two stale assertions: `/moonproof/` now expects the CSP-safe cockpit redirect and accessible manual link; three chooser cards and contextual entry tour are asserted at `tasks.html`. Existing URL/history tests remain intact.
- This is a source-level correction, not proof of Node/Chromium execution. The last observed #498 CI and pgvector checks failed; Chromium was queued. EXO-X1 GPU/noGPU, six viewports, Go/Rust/Postgres/pgvector, rollout and rollback remain unverified. No merge or deploy authorized.
- Preserve Heloísa visual tokens, Joel's shared 3D Moon/Artemis, nine panels, and scientific PRELIMINARY/SYNTHETIC labels.

### 2026-11-17 — canonical cockpit CI contracts, draft #504

- Base: #500 `3edb5445034893f264e1771ccaf0368e90b25140`; isolated branch `fix/moonproof-canonical-ci-contract-20261117`, no edits to upstream branches.
- `class-tour.test.mjs`: verify the canonical CSP-safe cockpit link in `index.html` and the task chooser plus contextual tutorial in `tasks.html`; retain the other interactive-screen tour checks and #460 Back-button checks.
- `core-ready.test.mjs`: require `core/state.js` on functional screens; the non-stateful canonical navigation shell must instead provide its module and accessible fallback link.
- `moon-preview.test.mjs`: require shared preview stylesheet on viewer pages, but validate navigation semantics on the non-rendering canonical shell.
- Source inspection only: Node/TypeScript/Chromium GPU/noGPU, six viewport sizes, Go/Rust/Postgres/pgvector, accessibility, pins, Artemis, performance and Worker rollout/rollback **NOT EXECUTED**. CI state of previous #500/#501 SHAs includes failures. Release **NO-GO**. Preserve Heloísa visual design, Joel 3D renderer and PRELIMINARY/SYNTHETIC science labeling.
