// B · Explorar (design @lisanogueira). One terrain layer at a time, painted from repository data:
// altitude = LOLA 400 m grid (PRE), natural colour = NASA SVS LROC mosaic (visualization only),
// slope = derived from the DEM (EST), mean sunlight / Earth in view = PGDA maps (PRE).
// Tapping the terrain or typing a coordinate creates a point (3 decimals). Spec: designer/B-explore.designer.mds.
import { mountShell } from "../core/shell.js";
import { icon } from "../core/icons.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, sealFor, apiOnline, loadRegion, sourced } from "../core/data.js";
import { createLayerCard, sealEl } from "../core/layers.js";
import { t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { southStereoInverse, southStereoForward } from "../../lab/coords.js";
import { coordText, parseCoord, pxToStereo, stereoToPx, pgdaAt, rampColor, rampCss, horizonPoints, elRange, fmtVal } from "./mission-calc.js";
import { shortName } from "./mission-calc.js";
import "./mission-i18n.js";

const DAY = 24, $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const nd = () => t("nd");
export const LAYERS = [
  { id: "altitude", ico: "explore", key: "ex.l.altitude", unit: "ex.u.m", ramp: "altitude", legend: "ex.leg.altitude", status: null },
  { id: "natural", ico: "source", key: "ex.l.natural", unit: "ex.u.vis", ramp: null, legend: "ex.leg.natural", status: "VISUALIZATION" },
  { id: "slope", ico: "slope", key: "ex.l.slope", unit: "ex.u.deg", ramp: "slope", legend: "ex.leg.slope", status: "ESTIMATE" },
  { id: "sun", ico: "sun", key: "ex.l.sun", unit: "ex.u.pct", ramp: "sun", legend: "ex.leg.sun", status: null },
  { id: "earth", ico: "earth", key: "ex.l.earth", unit: "ex.u.pct", ramp: "earth", legend: "ex.leg.earth", status: null },
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
// Closest view the data supports without upscaling: ~160–200 m per CSS px (LOLA backgrounds are 160 m/px at 87°S, 400 m/px to 84°S).
terrain.view.span = 90000;
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
  overlay.dataset.layer = layer; const src = await layerImage(layer), v = terrain.view, mpp = v.span / Math.min(W, H);
  const [x0, y0] = stereoToPx(grid.x0, grid.y0 + (grid.ny - 1) * grid.dx, v, W, H);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(src, x0, y0, grid.nx * grid.dx / mpp, grid.ny * grid.dx / mpp);
  if (point) { const [px, py] = stereoToPx(point.x, point.y, v, W, H); pin.hidden = false; pin.style.left = px + "px"; pin.style.top = py + "px"; } else pin.hidden = true;
}

// ---- free area framing: chosen site/point between the side panels
function frame() {
  const s = site(), tx = point ? point.x : s.stereo_x_m, ty = point ? point.y : s.stereo_y_m;
  if (!point) terrain.select(s.id);
  const W = innerWidth, Hh = innerHeight, mpp = terrain.view.span / Math.min(W, Hh);
  terrain.view.cx = tx; terrain.view.cy = ty; // core/terrain.js centres view.cx/cy in the free area between the panels
  terrain.redraw(); paint();
}
const site = () => doc.sites.find(s => s.id === getState().site);

overlay.addEventListener("click", e => {
  const r = tc.getBoundingClientRect(), [x, y] = pxToStereo(e.clientX - r.left, e.clientY - r.top, terrain.view, r.width, r.height);
  if (!grid.contains(x, y)) return; const { lat, lon } = southStereoInverse(x, y); point = { x, y, lat, lon }; draw();
});

function pointAt(lat, lon) { const [x, y] = southStereoForward(lat, lon); point = grid.contains(x, y) ? { x, y, lat, lon } : { x, y, lat, lon, outside: true }; }

async function draw() {
  const st = getState(), s = site();
  const m = await windowMetrics(doc, s, st.start, hours());
  const fmtDate = d => new Intl.DateTimeFormat(lang(), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
  shell.setContext({ site: point ? t("ex.point") : `${s.n} · ${shortName(s.name)}`, date: fmtDate(new Date(m.t0)), days: fmtNum(hours() / DAY), seal: sealFor(doc.status), online,
    action: { label: t("ex.addCompare"), href: hrefTo("compare.html") } });
  drawLeft(); drawRight(s, m); dock(s); chips(); frame();
}

function drawLeft() {
  const left = $("left"); left.replaceChildren();
  const tabs = el("div", "ex-tabs");
  for (const k of ["layers", "sites"]) { const b = el("button", "mp-pill", t("ex." + k)); b.type = "button"; b.setAttribute("aria-pressed", String(tab === k)); b.onclick = () => { tab = k; drawLeft(); }; tabs.append(b); }
  const hq = el("button", "mp-pill is-round ex-q", "?"); hq.type = "button"; hq.setAttribute("aria-label", t("ex.hint")); hq.title = t("ex.hint"); tabs.append(hq);
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
    const ic = el("span", "ex-ico"); ic.innerHTML = icon(L.ico);
    b.append(el("span", "ex-dot"), ic, el("span", "ex-lname", t(L.key)), sw);
    if (L.id === "slope") b.title = t("seal.EST");
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
  const c = el("div", "mp-card ex-legend"); c.id = "legend";
  const h = el("div", "ex-legend-head"); h.append(el("b", null, t(L.key)), el("span", "mp-label", t(L.unit)));
  const status = L.status || doc.status; h.append(sealEl(sealFor(status))); c.append(h);
  if (L.ramp) { const bar = el("div", "ex-ramp"); bar.style.background = rampCss(L.ramp); c.append(bar);
    const sc = el("div", "ex-scale mp-coord"); const d = L.id === "slope" ? 1 : 0;
    const sg = v => v == null ? nd() : (L.id === "altitude" && v > 0 ? "+" : "") + fmtVal(v, fmtNum, nd(), d);
    // middle tick: 0 when the range crosses zero (altitude), else the midpoint
    const mid = min != null && max != null ? (min < 0 && max > 0 ? 0 : (min + max) / 2) : null;
    sc.append(el("span", null, sg(min)), el("span", null, mid === 0 ? "0" : sg(mid)), el("span", null, sg(max))); c.append(sc); }
  c.append(el("p", "mp-label", t(L.legend)));
  c.title = L.id === "altitude" || L.id === "slope" ? `${grid.h.source} · ${grid.h.method}` : L.id === "natural" ? "NASA SVS 4720 · lroc_color_2k.jpg" : grid.h.layers["pgda_" + L.id].product + " · " + grid.h.layers["pgda_" + L.id].resolution_m + " m";
  return c;
}

function drawRight(s, m) {
  const right = $("right"); right.replaceChildren(card(s, m), fromHere(s, m));
  $("sheet-body").replaceChildren(card(s, m, true), fromHere(s, m));
}

function rows(list) { const tb = el("table", "ex-rows"); for (const [k, v, seal, ico] of list) { const tr = tb.insertRow(); const th = el("th"); if (ico) { const i = el("span", "ex-rico is-" + ico); i.innerHTML = icon(ico); th.append(i); } th.append(k); tr.append(th);
  const td = tr.insertCell(); if (seal && seal !== "PRE") td.append(sealEl(seal), " "); td.append(v); if (seal === "PRE") td.title = "PRE · " + t("seal.PRE"); } return tb; }
function card(s, m, mobile) {
  const c = el("article", "mp-card ex-site"); c.id = mobile ? "m-card-site" : "card-site";
  const head = el("div", "ex-site-head");
  const x = point ? { n: "+", name: t("ex.point"), lat: point.lat, lon: point.lon } : s;
  head.append(el("span", "ex-n is-sel", String(x.n)));
  const nm = el("div"); const h3 = el("h3", null, point ? x.name : shortName(x.name)); h3.title = x.name; nm.append(h3, el("p", "mp-coord", coordText(x.lat, x.lon, fmtNum, nd()))); head.append(nm);
  if (!mobile) { const cl = el("button", "mp-pill is-round ex-close"); cl.innerHTML = icon("close"); cl.type = "button"; cl.setAttribute("aria-label", t("ex.close")); cl.title = t("ex.close");
    cl.onclick = () => { if (point) { point = null; draw(); } else { $("right").classList.toggle("is-closed"); } }; head.append(cl); }
  c.append(head);
  const X = point ? point.x : s.stereo_x_m, Y = point ? point.y : s.stereo_y_m;
  const ps = pgdaAt(grid, pSun, X, Y), pe = pgdaAt(grid, pEarth, X, Y);
  const height = point ? sourced(point.outside ? null : grid.height(X, Y), { unit: "m", status: doc.status }) : sourced(s.site_height_m, { unit: "m", status: doc.status });
  const sl = sourced(point?.outside ? null : grid.normal(X, Y).slopeDeg, { unit: "°", status: "ESTIMATE" });
  const v = (x, d = 0, u = "") => fmtVal(x, fmtNum, nd(), d, u);
  const lt = el("h4", "mp-label"); lt.append(el("b", null, t("ex.light")), el("span", "ex-jade", " · " + t("ctx.days", { n: fmtNum(hours() / DAY) })));
  c.append(lt);
  if (point) c.append(rows([[t("ex.pgdaSun"), v(ps, 0, "%"), ps == null ? "N/D" : sealFor(doc.status)], [t("ex.pgdaEarth"), v(pe, 0, "%"), pe == null ? "N/D" : sealFor(doc.status)], [t("ex.night"), nd(), "N/D"]]));
  else c.append(rows([[t("ex.sunVis"), v(m.sunPct.value, 0, "%"), m.sunPct.seal, "sun"], [t("ex.earthVis"), v(m.earthPct.value, 0, "%"), m.earthPct.seal, "earth"], [t("ex.night"), v(m.longestDarkH.value, 0, "\u00a0h"), m.longestDarkH.seal, "sunset"]]));
  if (mobile && !point) { c.lastChild.remove();
    const blk = el("div", "ex-glass-row");
    for (const [k, val, seal] of [[t("ex.sunVis"), v(m.sunPct.value, 0, "%"), m.sunPct.seal], [t("ex.earthVis"), v(m.earthPct.value, 0, "%"), m.earthPct.seal], [t("ex.night"), v(m.longestDarkH.value, 0, "\u00a0h"), m.longestDarkH.seal]]) {
      const b = el("div", "glass-in"); b.append(el("b", null, val), el("span", null, k), sealEl(seal)); blk.append(b); }
    c.append(blk); }
  if (!mobile) {
    const tt = el("h4", "mp-label"); tt.append(el("b", null, t("ex.terrain")), el("span", "ex-jade", " · DEM " + fmtNum(grid.h.native_resolution_m) + " m/px")); tt.title = "DEM " + fmtNum(grid.h.native_resolution_m) + " m/px → " + fmtNum(grid.dx) + " m"; c.append(tt);
    c.append(rows([[t("mc.altitude"), (height.value > 0 ? "+" : "") + v(height.value, 0, "\u00a0m"), height.seal, "elevation"], [t("mc.slope"), v(sl.value, 1, "°"), sl.seal, "slope"]]));
  }
  if (point?.outside) c.append(el("p", "mp-label", t("ex.outside")));
  return c;
}

function fromHere(s, m) {
  const g = point ? null : m.series.at(m.t0), hz = point ? null : m.series.horizon;
  const c = el("article", "mp-card ex-from"); c.id = "card-horizon"; c.dataset.status = point ? "NO_DATA" : String(doc.status || "");
  const head = el("div", "ex-from-head"); head.append(el("h3", null, t("ex.from")), sealEl(point || !hz ? "N/D" : sealFor(doc.status)), el("span", "mp-label", t("ex.now"))); c.append(head);
  let answer;
  if (!hz || !g) answer = t("ex.from.nd");
  else {
    const fmtM = x => t(x >= 0 ? "ex.above" : "ex.below", { n: fmtVal(Math.abs(x), fmtNum, nd(), 1, "°") });
    answer = t("ex.from.ans", { s: fmtM(g.sunMargin), e: fmtM(g.earthMargin) });
    c.append(horizonSvg(hz, g, m));
  }
  c.append(el("p", "ex-from-txt", answer));
  if (!point) c.title = `${t("proof.definition")}: ${t("proof.definition.sun")} · ${t("proof.source")}: ${m.series.meta.provenance?.terrain || nd()} · ${t("proof.status")}: ${doc.status}`;
  const acts = el("div", "ex-actions");
  const a1 = el("a", "mp-pill is-primary", t("ex.compare")); a1.href = hrefTo("compare.html");
  const a2 = el("a", "mp-pill is-sim"); a2.innerHTML = icon("lander"); a2.append(t("ex.land")); a2.href = hrefTo("landing.html");
  acts.append(a1, a2); c.append(acts);
  return c;
}
export function horizonSvg(hz, g, m) {
  const W = 306, Hh = 96;
  // Sun track over the next 24 h from the stored hourly series (PRE), drawn as a dotted path.
  const track = [];
  if (m && m.series && m.series.at) for (let h = 0; h <= 24; h += 1) { const q = m.series.at(m.t0 + h * 3600e3); if (q && Number.isFinite(q.sunAz) && Number.isFinite(q.sunEl)) track.push([q.sunAz, q.sunEl]); }
  // Flat, legible profile as in design B: at least 16° of elevation on the axis (the horizon stays low).
  const r0 = elRange(hz, [g.sunEl, g.earthEl, ...track.map(p => p[1])]), lo = Math.min(r0[0], -2), r = [lo, Math.max(r0[1], lo + 16)];
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${Hh + 18}`); svg.setAttribute("class", "ex-horizon"); svg.setAttribute("role", "img");
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); svg.append(e); return e; };
  const y = el => Hh - ((el - r[0]) / (r[1] - r[0])) * Hh;
  const pts = horizonPoints(hz, W, Hh, r[0], r[1]);
  mk("polygon", { points: `0,${Hh} ${pts} ${W},${Hh}`, fill: "rgba(139,150,161,.22)" });
  mk("polyline", { points: pts, fill: "none", stroke: "#8b96a1", "stroke-width": 1.2, "stroke-dasharray": "2 3" });
  if (track.length > 1) { let d = ""; let prev = null;
    for (const [az, e] of track) { const x = (az / 360) * W, yy = y(e); d += (prev == null || Math.abs(x - prev) > W / 2 ? "M" : "L") + x.toFixed(1) + "," + yy.toFixed(1); prev = x; }
    mk("path", { d, fill: "none", stroke: "#FFD166", "stroke-width": 1.6, "stroke-dasharray": "1 5", "stroke-linecap": "round", opacity: .8 }); }
  for (const [az, e, col] of [[g.sunAz, g.sunEl, "#FFD166"], [g.earthAz, g.earthEl, "#4C9BFF"]]) mk("circle", { cx: (az / 360) * W, cy: Math.max(6, Math.min(Hh - 2, y(e))), r: 6, fill: col });
  [t("mc.dir.N"), t("mc.dir.E"), t("mc.dir.S"), t("mc.dir.W")].forEach((d, i) => { const tx = mk("text", { x: (i / 4) * W + 4, y: Hh + 14, fill: "#B7C0C9", "font-size": 10.5, "font-family": "IBM Plex Mono, monospace" }); tx.textContent = d; });
  svg.setAttribute("aria-label", `horizon ${fmtNum(r[0], 1)}°…${fmtNum(r[1], 1)}°`);
  return svg;
}

function dock(s) {
  const d = $("dock"), i = doc.sites.indexOf(s), n = doc.sites.length;
  const btn = (ico, label, fn) => { const b = el("button", "mp-pill"); b.type = "button"; b.innerHTML = icon(ico); b.setAttribute("aria-label", label); b.title = label; b.onclick = fn; return b; };
  const wrap = el("label", "mc-selwrap"); const sel = el("select", "mc-sel ex-sel"); sel.setAttribute("aria-label", t("ctx.site"));
  for (const x of doc.sites) sel.append(new Option(`${t("ctx.site")} ${x.n} · ${shortName(x.name)}`, x.id, false, x.id === s.id));
  sel.onchange = () => { point = null; setState({ site: sel.value }); };
  wrap.append(sel); wrap.insertAdjacentHTML("beforeend", icon("chevron-down"));
  const go = id => { point = null; setState({ site: id }); };
  const row = el("div", "mc-dock-row ex-dock-row");
  row.append(btn("chevron-left", t("mc.prev"), () => go(doc.sites[(i + n - 1) % n].id)), btn("chevron-right", t("mc.next"), () => go(doc.sites[(i + 1) % n].id)), wrap,
    btn("minus", t("mc.zout"), () => { terrain.zoom(0.7); frame(); dock(site()); }), btn("plus", t("mc.zin"), () => { terrain.zoom(1.4); frame(); dock(site()); }));
  d.replaceChildren(el("p", "mc-hint", t("ex.tap")), row);
  // Scale bar (a round length that fits ~100 px at the current zoom), bottom left of the free map.
  const nice = m => { const p = 10 ** Math.floor(Math.log10(m)); return [1, 2, 5, 10].map(k => k * p).filter(v => v <= m).pop(); };
  const mpp = terrain.mpp, len = mpp ? nice(mpp * 100) : 0, sc = $("scale"); sc.replaceChildren();
  if (len) { const bar = el("i"); bar.style.width = Math.round(len / mpp) + "px"; const u = el("span", "ex-scale-u");
    u.append(el("b", null, len >= 1000 ? fmtNum(len / 1000) : fmtNum(len)), el("small", null, len >= 1000 ? "km" : "m")); sc.append(bar, u); }
  // Coordinate form: typed point (3 decimals); shows the cursor position while the pointer is over the map.
  const form = $("coordform"); form.replaceChildren();
  const lab = el("label", "sr-only", t("ex.coord")); const inp = el("input", "mp-coord"); inp.id = "coord"; lab.htmlFor = "coord"; inp.placeholder = t("ex.coord.ph");
  const px = point ? point : s; inp.value = coordText(px.lat, px.lon, fmtNum, nd()).replace(" · ", " · ");
  inp.dataset.base = inp.value;
  form.append(lab, inp);
  form.onsubmit = e => { e.preventDefault(); const c = parseCoord(inp.value.replace(/[°SE·]/g, " ").replace(/;/g, " ").replace(/(\d),(\d)/g, "$1.$2")); if (!c) { inp.setCustomValidity(t("ex.coord.bad")); inp.reportValidity(); return; } inp.setCustomValidity(""); pointAt(c.lat, c.lon); draw(); };
}
overlay.addEventListener("pointermove", e => {
  const inp = $("coord"); if (!inp || document.activeElement === inp) return;
  const r = tc.getBoundingClientRect(), [x, y] = pxToStereo(e.clientX - r.left, e.clientY - r.top, terrain.view, r.width, r.height);
  const { lat, lon } = southStereoInverse(x, y); inp.value = coordText(lat, lon, fmtNum, nd());
});
overlay.addEventListener("pointerleave", () => { const inp = $("coord"); if (inp && document.activeElement !== inp) inp.value = inp.dataset.base || ""; });
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
