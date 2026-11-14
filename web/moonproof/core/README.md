# MoonProof core API (`web/moonproof/core/`)

Contract: `docs/design/FRONT-NOVO-CONTRATO.md`. Plain ES modules, no build. Screens own only `screens/<screen>.js`, `<screen>.html`, `designer/<ID>.designer.mds`, `tests/<screen>-*.test.mjs`. Need something in `core/`? Write the request in your report; do not edit core.

## Page skeleton
```html
<link rel="stylesheet" href="core/tokens.css"><link rel="stylesheet" href="core/components.css">
<script type="module" src="screens/compare.js"></script>
<body><div id="terrain"></div><aside id="panel"></aside></body>
```

## Modules
| Module | Exports |
|---|---|
| `shell.js` | `mountShell({screen, context, onLang}) → {setContext(ctx), render()}`. `screen` ∈ `explore compare recover cockpit evidence landing` (sets `aria-current`). `ctx = {site, date, days, seal, online, action:{label, href}}`; `null` hides the bar. Adds top nav, Class/Plan kits, language toggle, mobile bottom nav (≤700 px). `onLang(lang)` → redraw your texts. `SCREENS` lists pages. |
| `data.js` | `loadSites() → {status, window, sites:[{id,n,name,lat,lon,stereo_x_m,stereo_y_m,metrics,series,…}]}` (5 real sites of `web/data/sites.json`, `n` = marker number). `siteMetric(doc, site, key, unit)` → sourced value. `windowMetrics(doc, site, startIso, hours)` → `{sunPct, earthPct, longestDarkH, longestBlackoutH, maxSunElDeg, series, t0, raw}` (each sourced, from the stored hourly series via `web/lab/data.js`). `dailySun(series, t0, hours)` → per-day fractions. `loadRegion()` → `TerrainGrid` (LOLA 400 m). `api(path, {method, body}) → {ok, data, status} \| {ok:false, offline, error}` (never throws; base `window.BRASPACE_API_BASE \|\| ""`). `apiOnline()`. `sealFor(status)`. `sourced(value, {unit, status, source, detail})`. |
| `layers.js` | `createLayerCard({id, title, status, answer, why, proof, layer, onLayer}) → {el, setLayer}`; `proof` = `[[label, value], …]` or a Node. `sealEl(seal)`, `statCircle({value, label, seal, satellites:[{value,label}×≤4]})`, `barEl(fractions, color)`. |
| `terrain.js` | `await mountTerrain(el, {sites, selected, route:[ids], onSelect}) → {select(id), zoom(f), redraw(), grid}`. Full-screen hillshade + numbered markers (44 px buttons) + dotted route. |
| `i18n.js` | `register({en:{…}, "pt-BR":{…}})` (throws if keys differ), `t(key, vars)` with `{name}` placeholders, `lang()`, `setLang()`, `apply(root)` fills `[data-i18n]`, `fmtNum(v, digits)` (→ "—" when missing). Prefix your keys with your screen id. |
| `state.js` | `getState()` → `{site, start, hours, layer, task, lang, night, blackout, battery}`; `setState(patch)` writes the query string (`replaceState`) and notifies; `onState(fn)`; `hrefTo(page)` keeps the scenario; `parseState/toQuery`; `DEFAULT_RULES` = assumed limits (editable defaults, label them "assumed limit"); `TASKS` task → opening layer. |

## Integrity rules (tests will fail otherwise)
1. Seal only via `sealFor(status)` / `createLayerCard({status})`. `VAL` appears only when the origin says exactly `VALIDATED`. Today `web/data` is `PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED` → `PRE`; synthetic API series → `SIM`.
2. No number in HTML/JS: values come from `data.js`/`api()`. Missing → `t("nd")` ("—") + `N/D`, never 0.
3. No design-sheet numbers (`SR-0x`, `a41c9e2`, `1.832`, `71%`, …) — `tests/core-no-design-numbers.test.mjs` greps every file.
4. API offline → keep static data and show `ctx.online:false` ("offline · precomputed").

## Example `screens/compare.js`
```js
import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, api, sealFor } from "../core/data.js";
import { createLayerCard } from "../core/layers.js";
import { register, t, fmtNum } from "../core/i18n.js";
import { getState, setState, onState } from "../core/state.js";

register({ en: { "compare.title": "Darkest stretch", "compare.answer": "Longest night: {h}." },
  "pt-BR": { "compare.title": "Trecho mais escuro", "compare.answer": "Maior noite: {h}." } });
const shell = mountShell({ screen: "compare", onLang: draw });
const doc = await loadSites();
const terrain = await mountTerrain(document.getElementById("terrain"), {
  sites: doc.sites, selected: getState().site, onSelect: id => setState({ site: id }) });
const live = await api("/api/compare", { method: "POST", body: { sites: doc.sites.map(s => s.id) } });

async function draw() {
  const st = getState(), site = doc.sites.find(s => s.id === st.site) || doc.sites[0];
  const m = await windowMetrics(doc, site, st.start, st.hours || 336);
  const h = m.longestDarkH.value == null ? t("nd") : fmtNum(m.longestDarkH.value) + " h";
  shell.setContext({ site: `${site.n} · ${site.name}`, date: m.longestDarkH.detail.start,
    days: fmtNum((st.hours || 336) / 24), seal: sealFor(doc.status), online: live.ok });
  const card = createLayerCard({ title: t("compare.title"), status: m.longestDarkH.status,
    answer: t("compare.answer", { h }), layer: st.layer, onLayer: layer => setState({ layer }),
    proof: [["Source", m.longestDarkH.source], ["SHA-256", m.longestDarkH.detail.sha256]] });
  document.getElementById("panel").replaceChildren(card.el);
}
onState(s => { terrain.select(s.site); draw(); });
draw();
```
Serve with `npm --prefix web run dev` style: `node web/dev-server.mjs` → `http://127.0.0.1:5173/moonproof/`. Tests: `npm --prefix web test`.
