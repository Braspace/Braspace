// B · Explorar (design @lisanogueira). One terrain layer at a time, painted from repository data:
// altitude = LOLA 400 m grid (PRE), natural colour = NASA SVS LROC mosaic (visualization only),
// slope = derived from the DEM (EST), mean sunlight / Earth in view = PGDA maps (PRE).
// Tapping the terrain or typing a coordinate creates a point (3 decimals). Spec: designer/B-explore.designer.mds.
import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, sealFor, apiOnline, loadRegion, sourced, api } from "../core/data.js";
import { createLayerCard, sealEl } from "../core/layers.js";
import { t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { southStereoInverse, southStereoForward } from "../../lab/coords.js";
import { coordText, parseCoord, pgdaAt, rampColor, rampCss, horizonPoints, elRange, fmtVal } from "./mission-calc.js";
import "./mission-i18n.js";

const DAY = 24, $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const nd = () => t("nd");
export const LAYERS = [
  { id: "altitude", key: "ex.l.altitude", unit: "ex.u.m", ramp: "altitude", legend: "ex.leg.altitude", status: null },
  { id: "natural", key: "ex.l.natural", unit: "ex.u.vis", ramp: null, legend: "ex.leg.natural", status: "VISUALIZATION" },
  { id: "slope", key: "ex.l.slope", unit: "ex.u.deg", ramp: "slope", legend: "ex.leg.slope", status: "ESTIMATE" },
  { id: "sun", key: "ex.l.sun", unit: "ex.u.pct", ramp: "sun", legend: "ex.leg.sun", status: null },
  { id: "earth", key: "ex.l.earth", unit: "ex.u.pct", ramp: "earth", legend: "ex.leg.earth", status: null },
];

const shell = mountShell({ screen: "explore", context: null, onLang: () => draw() });
const doc = await loadSites();
if (!doc.sites.some(s => s.id === getState().site)) setState({ site: doc.sites[0].id });
const hours = () => getState().hours || 14 * DAY;
const online = await apiOnline();
const grid = await loadRegion();
const terrain = await mountTerrain($("terrain"), { sites: doc.sites, selected: getState().site, onSelect: id => { point = null; setState({ site: id }); } });
const fetchU8 = f => fetch(new URL("../../data/region/" + f, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Uint8Array(b)).catch(() => null);
const [pSun, pEarth] = await Promise.all([fetchU8(grid.h.layers.pgda_sun.file), fetchU8(grid.h.layers.pgda_earth.file)]);
const slope = grid.slopeField();
let layer = new URLSearchParams(location.search).get("paint") || "altitude", tab = "layers", point = null, natural = null;

// ---- layer painting: one image per layer at grid resolution, drawn with the same transform as core/terrain.js
const overlay = el("canvas", "ex-overlay"); overlay.setAttribute("aria-hidden", "true");
const tc = $("terrain"); tc.insertBefore(overlay, tc.children[1]);
const pin = el("div", "ex-pin"); pin.hidden = true; tc.append(pin);
const cache = new Map();
function finiteRange(arr) { let lo = Infinity, hi = -Infinity; for (const v of arr) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; }
const RANGES = { altitude: [grid.min, grid.max], slope: [0, finiteRange(slope)[1]], sun: [0, 100], earth: [0, 100] };
async function loadNatural() {
  if (natural !== null) return natural;
  try { const img = new Image(); img.src = new URL("../../data/moon/lroc_color_2k.jpg", import.meta.url).href; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    natural = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data }; } catch { natural = false; }
  return natural;
}
async function layerImage(id) {
  if (cache.has(id)) return cache.get(id);
  const { nx, ny } = grid, img = new ImageData(nx, ny), d = img.data;
  const nat = id === "natural" ? await loadNatural() : null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, p = ((ny - 1 - j) * nx + i) * 4; let c = null;
    if (id === "altitude") { const v = grid.data[k]; if (Number.isFinite(v)) c = rampColor("altitude", (v - RANGES.altitude[0]) / (RANGES.altitude[1] - RANGES.altitude[0])); }
    else if (id === "slope") { const v = slope[k]; if (Number.isFinite(v)) c = rampColor("slope", v / RANGES.slope[1]); }
    else if (id === "sun" || id === "earth") { const a = id === "sun" ? pSun : pEarth; const v = a?.[k]; if (v != null && v <= 100) c = rampColor(id, v / 100); }
    else if (nat) { const { lat, lon } = southStereoInverse(grid.x0 + i * grid.dx, grid.y0 + j * grid.dx);
      const u = Math.floor(((lon + 180) / 360) * nat.w) % nat.w, v = Math.min(nat.h - 1, Math.floor(((90 - lat) / 180) * nat.h)), q = (v * nat.w + u) * 4; c = [nat.d[q], nat.d[q + 1], nat.d[q + 2]]; }
    if (c) { d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; }
  }
  const cv = document.createElement("canvas"); cv.width = nx; cv.height = ny; cv.getContext("2d").putImageData(img, 0, 0);
  cache.set(id, cv); return cv;
}
async function paint() {
  const W = tc.clientWidth, H = tc.clientHeight, dpr = devicePixelRatio || 1;
  overlay.width = W * dpr; overlay.height = H * dpr;
  const g = overlay.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  // Same projection as the relief under it (core/terrain.js), so the layer lines up with the craters.
  const src = await layerImage(layer), mpp = terrain.mpp || terrain.view.span / Math.min(W, H);
  const [x0, y0] = terrain.toPx(grid.x0, grid.y0 + (grid.ny - 1) * grid.dx), w = grid.nx * grid.dx / mpp, h = grid.ny * grid.dx / mpp;
  g.imageSmoothingEnabled = false; g.drawImage(src, x0, y0, w, h);
  // Soft edge where the data ends (the layer only covers its grid; no data is invented past it).
  g.globalCompositeOperation = "destination-out"; const f = Math.min(48, w / 6, h / 6);
  for (const [ax, ay, bx, by, rx, ry, rw, rh] of [[x0, 0, x0 + f, 0, x0, y0, f, h], [x0 + w, 0, x0 + w - f, 0, x0 + w - f, y0, f, h], [0, y0, 0, y0 + f, x0, y0, w, f], [0, y0 + h, 0, y0 + h - f, x0, y0 + h - f, w, f]]) {
    const gr = g.createLinearGradient(ax, ay, bx, by); gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); }
  g.globalCompositeOperation = "source-over";
  if (point) { const [px, py] = terrain.toPx(point.x, point.y); pin.hidden = false; pin.style.left = px + "px"; pin.style.top = py + "px"; } else pin.hidden = true;
}

// ---- free area framing: chosen site/point between the side panels
function frame() {
  const s = site(), tx = point ? point.x : s.stereo_x_m, ty = point ? point.y : s.stereo_y_m;
  if (!point) terrain.select(s.id);
  terrain.view.cx = tx; terrain.view.cy = ty; // core/terrain.js centres it in the free area between the panels
  terrain.redraw(); paint();
}
const site = () => doc.sites.find(s => s.id === getState().site);

overlay.addEventListener("click", e => {
  const r = tc.getBoundingClientRect(), [x, y] = terrain.fromPx(e.clientX - r.left, e.clientY - r.top);
  if (!grid.contains(x, y)) return; const { lat, lon } = southStereoInverse(x, y); point = { x, y, lat, lon }; draw();
});

function pointAt(lat, lon) { const [x, y] = southStereoForward(lat, lon); point = grid.contains(x, y) ? { x, y, lat, lon } : { x, y, lat, lon, outside: true }; }

async function draw() {
  const st = getState(), s = site();
  const m = await windowMetrics(doc, s, st.start, hours());
  const fmtDate = d => new Intl.DateTimeFormat(lang(), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
  shell.setContext({ site: point ? t("ex.point") : `${s.n} · ${s.name}`, date: fmtDate(new Date(m.t0)), days: fmtNum(hours() / DAY), seal: sealFor(doc.status), online,
    action: { label: t("ex.addCompare"), href: hrefTo("compare.html") } });
  drawLeft(); drawRight(s, m); dock(s); chips(); frame();
}

function drawLeft() {
  const left = $("left"); left.replaceChildren();
  const tabs = el("div", "ex-tabs");
  for (const k of ["layers", "sites"]) { const b = el("button", "mp-pill", t("ex." + k)); b.type = "button"; b.setAttribute("aria-pressed", String(tab === k)); b.onclick = () => { tab = k; drawLeft(); }; tabs.append(b); }
  left.append(tabs);
  if (tab === "sites") {
    const ul = el("div", "ex-list");
    for (const x of doc.sites) { const b = el("button", "ex-radio"); b.type = "button"; b.setAttribute("aria-pressed", String(!point && x.id === getState().site));
      b.append(el("span", "ex-n", String(x.n)), el("span", null, x.name)); b.onclick = () => { point = null; setState({ site: x.id }); }; ul.append(b); }
    left.append(ul); return;
  }
  left.append(el("p", "mp-label", t("ex.hint")));
  const list = el("div", "ex-list"); list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", t("ex.layers"));
  for (const L of LAYERS) {
    const b = el("button", "ex-radio"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(L.id === layer)); b.dataset.layer = L.id;
    const sw = el("i", "ex-swatch"); sw.style.background = L.ramp ? rampCss(L.ramp) : "#8a8d90";
    b.append(el("span", "ex-dot"), el("span", null, t(L.key)), sw);
    if (L.id === "slope") b.append(sealEl(sealFor("ESTIMATE")));
    b.onclick = () => { layer = L.id; draw(); };
    b.onkeydown = e => { const i = LAYERS.indexOf(L); if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); layer = LAYERS[(i + (e.key === "ArrowDown" ? 1 : LAYERS.length - 1)) % LAYERS.length].id; draw().then(() => left.querySelector(`[data-layer="${layer}"]`)?.focus()); } };
    list.append(b);
  }
  left.append(list, legend());
}
export function legendModel(id, ranges) {
  const L = LAYERS.find(x => x.id === id);
  const r = ranges[id] || null;
  return { L, min: r ? r[0] : null, max: r ? r[1] : null };
}
function legend() {
  const { L, min, max } = legendModel(layer, RANGES);
  const c = el("div", "mp-card ex-legend");
  const h = el("div", "ex-legend-head"); h.append(el("b", null, t(L.key)), el("span", "mp-label", t(L.unit)));
  const status = L.status || doc.status; h.append(sealEl(sealFor(status))); c.append(h);
  if (L.ramp) { const bar = el("div", "ex-ramp"); bar.style.background = rampCss(L.ramp); c.append(bar);
    const sc = el("div", "ex-scale mp-coord"); const d = L.id === "slope" ? 1 : 0;
    sc.append(el("span", null, fmtVal(min, fmtNum, nd(), d)), el("span", null, fmtVal(max, fmtNum, nd(), d))); c.append(sc); }
  c.append(el("p", "mp-label", t(L.legend)));
  const src = L.id === "altitude" || L.id === "slope" ? `${grid.h.source} · ${grid.h.method}` : L.id === "natural" ? "NASA SVS 4720 · lroc_color_2k.jpg" : grid.h.layers["pgda_" + L.id].product + " · " + grid.h.layers["pgda_" + L.id].resolution_m + " m";
  // The provenance stays one tap away (the design legend is a compact card).
  const dt = el("details", "ex-srcbox"); dt.append(el("summary", "mp-label", t("proof.source")), el("p", "mp-label ex-src", src)); c.append(dt);
  return c;
}

function drawRight(s, m) {
  const right = $("right"); right.replaceChildren(card(s, m), fromHere(s, m, DESK_HORIZON));
  if (online && !point) mediaCard(s).then(c => { if (c && site()?.id === s.id) right.append(c); });
  $("sheet-body").replaceChildren(card(s, m, true), fromHere(s, m));
}

function rows(list) { const tb = el("table", "ex-rows"); for (const [k, v, seal] of list) { const tr = tb.insertRow(); tr.append(el("th", null, k)); const td = tr.insertCell(); td.append(v); if (seal) td.append(" ", sealEl(seal)); } return tb; }
function card(s, m, mobile) {
  const c = el("article", "mp-card ex-site"); c.id = mobile ? "m-card-site" : "card-site";
  const head = el("div", "ex-site-head");
  const x = point ? { n: "+", name: t("ex.point"), lat: point.lat, lon: point.lon } : s;
  head.append(el("span", "ex-n is-sel", String(x.n)));
  const nm = el("div"); nm.append(el("h3", null, x.name), el("p", "mp-coord", coordText(x.lat, x.lon, fmtNum, nd()))); head.append(nm);
  if (point) { const cl = el("button", "mp-pill ex-close", "×"); cl.type = "button"; cl.setAttribute("aria-label", t("ex.close")); cl.onclick = () => { point = null; draw(); }; head.append(cl); }
  c.append(head);
  const X = point ? point.x : s.stereo_x_m, Y = point ? point.y : s.stereo_y_m;
  const ps = pgdaAt(grid, pSun, X, Y), pe = pgdaAt(grid, pEarth, X, Y);
  const height = point ? sourced(point.outside ? null : grid.height(X, Y), { unit: "m", status: doc.status }) : sourced(s.site_height_m, { unit: "m", status: doc.status });
  const sl = sourced(point?.outside ? null : grid.normal(X, Y).slopeDeg, { unit: "°", status: "ESTIMATE" });
  const v = (x, d = 0, u = "") => fmtVal(x, fmtNum, nd(), d, u);
  const lt = el("h4", "mp-label"); // AUD-03: a free point only has the PGDA long-term mean, not the selected mission window.
  lt.append(t("ex.light") + " · ", el("span", "ex-jade", point ? t("ex.pgdaLong") : t("ctx.days", { n: fmtNum(hours() / DAY) })));
  c.append(lt);
  if (point) c.append(rows([[t("ex.pgdaSun"), v(ps, 0, "%"), ps == null ? "N/D" : sealFor(doc.status)], [t("ex.pgdaEarth"), v(pe, 0, "%"), pe == null ? "N/D" : sealFor(doc.status)], [t("ex.night"), nd(), "N/D"]]));
  else c.append(rows([[t("ex.sunVis"), v(m.sunPct.value, 0, "%"), m.sunPct.seal], [t("ex.earthVis"), v(m.earthPct.value, 0, "%"), m.earthPct.seal], [t("ex.night"), v(m.longestDarkH.value, 0, "\u00a0h"), m.longestDarkH.seal]]));
  if (mobile && !point) { c.lastChild.remove();
    const blk = el("div", "ex-glass-row");
    for (const [k, val, seal] of [[t("ex.sunVis"), v(m.sunPct.value, 0, "%"), m.sunPct.seal], [t("ex.earthVis"), v(m.earthPct.value, 0, "%"), m.earthPct.seal], [t("ex.night"), v(m.longestDarkH.value, 0, "\u00a0h"), m.longestDarkH.seal]]) {
      const b = el("div", "glass-in"); b.append(el("b", null, val), el("span", null, k), sealEl(seal)); blk.append(b); }
    c.append(blk); }
  if (!mobile) {
    const tt = el("h4", "mp-label"); tt.append(t("ex.terrain") + " · ", el("span", "ex-jade", "DEM " + fmtNum(grid.h.native_resolution_m) + " m/px → " + fmtNum(grid.dx) + " m")); c.append(tt);
    c.append(rows([[t("mc.altitude"), v(height.value, 0, "\u00a0m"), height.seal], [t("mc.slope"), v(sl.value, 1, "°"), sl.seal]]));
  }
  if (point?.outside) c.append(el("p", "mp-label", t("ex.outside")));
  return c;
}

const DESK_HORIZON = [310, 70]; // desktop card: the chart is a 310 x 88 strip (70 + 18 for the N/E/S/W labels)
function fromHere(s, m, size = []) {
  const g = point ? null : m.series.at(m.t0), hz = point ? null : m.series.horizon;
  const status = point ? null : doc.status;
  let answer, why;
  if (!hz || !g) { answer = t("ex.from.nd"); why = null; }
  else {
    const fmtM = x => t(x >= 0 ? "ex.above" : "ex.below", { n: fmtVal(Math.abs(x), fmtNum, nd(), 1, "°") });
    answer = t("ex.from.ans", { s: fmtM(g.sunMargin), e: fmtM(g.earthMargin) });
    why = horizonSvg(hz, g, ...size);
  }
  const c = createLayerCard({ id: "card-horizon", title: t("ex.from"), status: status || "NO_DATA", answer, why: why || undefined,
    layer: getState().layer === "answer" ? "why" : getState().layer, onLayer: l => setState({ layer: l }),
    proof: point ? [[t("proof.source"), nd()]] : [[t("proof.definition"), t("proof.definition.sun")], [t("proof.source"), m.series.meta.provenance?.terrain || nd()],
      ["ray", JSON.stringify(m.series.meta.provenance?.ray_parameters || {})], [t("proof.status"), `${doc.status} · ${t("seal." + sealFor(doc.status))}`]] }).el;
  const acts = el("div", "ex-actions");
  const a1 = el("a", "mp-pill is-primary", t("ex.compare")); a1.href = hrefTo("compare.html");
  const a2 = el("a", "mp-pill is-sim", t("ex.land")); a2.href = hrefTo("landing.html");
  // AUD-02: a free point has no hourly series; Compare/Land would silently use the previous site's. Disable them.
  if (point) for (const a of [a1, a2]) { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); a.classList.add("is-disabled"); a.title = t("ex.point.noseries"); }
  acts.append(a1, a2); c.append(acts);
  if (point) c.append(el("p", "mp-label", t("ex.point.noseries")));
  return c;
}
export function horizonSvg(hz, g, W = 320, Hh = 110) {
  const r = elRange(hz, [g.sunEl, g.earthEl]);
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${Hh + 18}`); svg.setAttribute("class", "ex-horizon"); svg.setAttribute("role", "img");
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); svg.append(e); return e; };
  const pts = horizonPoints(hz, W, Hh, r[0], r[1]);
  mk("polygon", { points: `0,${Hh} ${pts} ${W},${Hh}`, fill: "#3a4048" });
  const y = el => Hh - ((el - r[0]) / (r[1] - r[0])) * Hh;
  for (const [az, e, col] of [[g.sunAz, g.sunEl, "#FFD166"], [g.earthAz, g.earthEl, "#4C9BFF"]]) mk("circle", { cx: (az / 360) * W, cy: Math.max(6, Math.min(Hh, y(e))), r: 7, fill: col });
  ["N", "E", "S", "W"].forEach((d, i) => { const tx = mk("text", { x: (i / 4) * W + 4, y: Hh + 14, fill: "#B7C0C9", "font-size": 11 }); tx.textContent = d; });
  svg.setAttribute("aria-label", `horizon ${fmtNum(r[0], 1)}°…${fmtNum(r[1], 1)}°`);
  return svg;
}

function dock(s) {
  const d = $("dock"), i = doc.sites.indexOf(s), n = doc.sites.length;
  const btn = (txt, label, fn) => { const b = el("button", "mp-pill ex-round", txt); b.type = "button"; b.setAttribute("aria-label", label); b.onclick = fn; return b; };
  const sel = el("select", "mp-pill is-primary ex-sel"); sel.setAttribute("aria-label", t("ctx.site"));
  for (const x of doc.sites) sel.append(new Option(`${t("ctx.site")} ${x.n} · ${x.name}`, x.id, false, x.id === s.id));
  sel.onchange = () => { point = null; setState({ site: sel.value }); };
  const go = id => { point = null; setState({ site: id }); };
  // Coordinates pill: shows the selected site/point and is also the "type a coordinate" field (Enter creates the point).
  const px = point ? point : s;
  const form = el("form", "ex-coord"); const lab = el("label", "sr-only", t("ex.coord")); const inp = el("input", "mp-coord"); inp.id = "coord"; lab.htmlFor = "coord";
  inp.placeholder = t("ex.coord.ph"); inp.title = t("ex.coord.ph"); inp.value = coordText(px.lat, px.lon, fmtNum, nd()); inp.setAttribute("enterkeyhint", "go"); inp.autocomplete = "off";
  inp.onfocus = () => inp.select();
  form.append(lab, inp);
  form.onsubmit = e => { e.preventDefault(); const c = parseCoord(inp.value.replace(/;/g, " ").replace(/(\d),(\d)/g, "$1.$2")); if (!c) { inp.setCustomValidity(t("ex.coord.bad")); inp.reportValidity(); return; } inp.setCustomValidity(""); pointAt(c.lat, c.lon); draw(); };
  const row = el("div", "ex-dock-row");
  // Scale bar: a round length that fits ~70 px at the current zoom.
  const nice = m => { const p = 10 ** Math.floor(Math.log10(m)); return [1, 2, 5, 10].map(k => k * p).filter(v => v <= m).pop(); };
  const mpp = terrain.mpp, len = mpp ? nice(mpp * 70) : 0;
  if (len) { const sc = el("span", "mp-pill ex-scalebar"); const bar = el("i"); bar.style.width = Math.round(len / mpp) + "px";
    sc.append(bar, len >= 1000 ? `${fmtNum(len / 1000)} km` : `${fmtNum(len)} m`); row.append(sc); }
  row.append(btn("‹", t("mc.prev"), () => go(doc.sites[(i + n - 1) % n].id)), btn("›", t("mc.next"), () => go(doc.sites[(i + 1) % n].id)), sel,
    btn("−", t("mc.zout"), () => { terrain.zoom(0.7); frame(); }), btn("+", t("mc.zin"), () => { terrain.zoom(1.4); frame(); }), form);
  d.replaceChildren(el("p", "mc-hint", t("ex.tap")), row);
}
function chips() {
  const c = $("chips"); c.replaceChildren();
  for (const L of LAYERS.filter(x => x.id !== "slope")) { const b = el("button", "mp-pill", t(L.key)); b.type = "button"; b.setAttribute("aria-pressed", String(L.id === layer)); b.onclick = () => { layer = L.id; draw(); }; c.append(b); }
}
const handle = $("handle"), sheet = $("sheet");
handle.onpointerdown = e => { handle.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = sheet.offsetHeight;
  handle.onpointermove = ev => { sheet.style.height = Math.max(110, Math.min(innerHeight - 180, h0 + (y0 - ev.clientY))) + "px"; };
  handle.onpointerup = () => { handle.onpointermove = null; frame(); }; };
handle.onkeydown = e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); sheet.style.height = Math.max(110, Math.min(innerHeight - 180, sheet.offsetHeight + (e.key === "ArrowUp" ? 60 : -60))) + "px"; frame(); } };
addEventListener("resize", () => frame());
onState(() => draw());
draw();

// Official LROC images related to the site (GET /api/sites/{id}/media, from the legacy onboard "Visual" tab).
// Links only: the API returns page links and credits, never image bytes (LROC website terms).
const mediaCache = new Map();
async function mediaCard(s) {
  if (!mediaCache.has(s.id)) mediaCache.set(s.id, api(`/api/sites/${encodeURIComponent(s.id)}/media`));
  const r = await mediaCache.get(s.id); const items = r.ok ? r.data?.media || [] : [];
  if (!items.length) return null;
  const c = el("article", "mp-card ex-media"); c.append(el("h3", null, t("ex.media")));
  for (const it of items.slice(0, 4)) { const a = el("a", "ex-media-link", it.title); a.href = it.page_url; a.target = "_blank"; a.rel = "noopener noreferrer";
    const p = el("p", "mp-label"); p.append(a, el("br"), `${it.credit}${it.illustrative_only ? " · " + t("ex.media.ill") : ""}`); c.append(p); }
  return c;
}
