// moonproof Polar Lab + Landing Lab — UI wiring in the BRASPACE design kit
// (map first, one question per screen, every number says where it comes from).
// Scientific geometry: precomputed from NASA LOLA + JPL/NAIF SPICE (Evidence view).
// Educational flight simulation: hypothetical vehicle, deterministic physics (physics.js).

import { Viewer } from "./scene.js";
import { TerrainGrid } from "./terrain.js";
import { SiteSeries, rankSites, HOUR_MS } from "./data.js";
import { azElToEnu, enuToBody } from "./coords.js";
import { createSim, advance, telemetry, thrustDirection, DEFAULT_VEHICLE, MOON_R_REF } from "./physics.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : "—";
const iso = t => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const dayLabel = t => new Date(t).toISOString().slice(0, 10);
const hrs = h => !Number.isFinite(h) ? "—" : h >= 48 ? `${fmt(h / 24, 1)} d` : `${fmt(h, 0)} h`;
const IM2_EPOCH = Date.parse("2025-03-06T17:00:00Z"); // IM-2 Athena landing day (hour approximate)
const prov = (k, text) => `<span class="prov ${k}">${esc(text ?? k.toUpperCase())}</span>`;
const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M8 7l4-4 4 4"/><path d="M4 21h16"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
  earth: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  slope: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18L3 8z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  lab: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l2 7H7z"/><path d="M7 11l-3 8M17 11l3 8M10 11l-1 8M14 11l1 8"/><path d="M2 19h5M17 19h5"/></svg>',
};

// ------------------------------------------------------------------ i18n
const I18N = {
  en: {
    explore: "Explore", compare: "Compare", recover: "Recover", landing: "Landing Lab", evidence: "Evidence",
    reduceMotion: "Reduce motion", classic: "Mission computer", globe: "Globe", pole: "South pole", site3d: "Site 3D",
    natural: "Natural (Sun-lit relief)", elevation: "Altitude", slope: "Slope", illumination: "Average sunlight (PGDA)",
    earthvis: "Earth in view (PGDA)", candidates: "Candidate regions", uncertainty: "Terrain uncertainty",
    notComputed: "NOT COMPUTED", start: "Start descent",
  },
  pt: {
    explore: "Explorar", compare: "Comparar", recover: "Replanejar", landing: "Landing Lab", evidence: "Evidências",
    reduceMotion: "Reduzir movimento", classic: "Computador de bordo", globe: "Globo", pole: "Polo sul", site3d: "Local 3D",
    natural: "Natural (relevo iluminado)", elevation: "Altitude", slope: "Declividade", illumination: "Luz do Sol média (PGDA)",
    earthvis: "Terra à vista (PGDA)", candidates: "Regiões candidatas", uncertainty: "Incerteza do relevo",
    notComputed: "NÃO CALCULADO", start: "Iniciar descida",
  },
};
const tr = k => (I18N[state.lang] && I18N[state.lang][k]) || I18N.en[k] || k;

// ------------------------------------------------------------------ state
const state = {
  view: "explore", level: "globe", siteId: "peak-near-shackleton", t: 0, layer: "natural", exag: 1,
  lang: "en", reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, exploreTab: "layers",
  index: null, region: null, pgda: null, slope: null, series: new Map(), tiles: new Map(),
  compareH: 336, recover: { delayH: 48, windowH: 336, minSun: 30, maxBlackout: 120, pick: null },
  lab: { mode: "guided", scenario: null, running: false, paused: false, sim: null, keys: {}, assist: true, timeScale: 1, throttleCmd: 0 },
};
let viewer = null;

// ------------------------------------------------------------------ data loading
async function loadIndex() {
  const r = await fetch("./data/sites.json");
  if (!r.ok) throw new Error("sites.json unavailable");
  state.index = await r.json();
  const w = state.index.series_window;
  state.windowStart = Date.parse(w.start_utc);
  state.windowEnd = state.windowStart + (w.hours - 1) * HOUR_MS;
  const now = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  state.t = now >= state.windowStart && now <= state.windowEnd ? now : state.windowStart;
}
const siteById = id => state.index.sites.find(s => s.id === id);
const siteNum = id => state.index.sites.findIndex(s => s.id === id) + 1;
function series(id) {
  if (!state.series.has(id)) state.series.set(id, SiteSeries.load("./data/" + siteById(id).series));
  return state.series.get(id);
}
function tile(id) {
  if (!state.tiles.has(id)) state.tiles.set(id, TerrainGrid.load("./data/" + siteById(id).local_tile));
  return state.tiles.get(id);
}
async function region() {
  if (state.region) return state.region;
  status("Loading LOLA south-polar terrain (400 m, 1.4 MB)…");
  const grid = await TerrainGrid.load("./data/region/south_pole_400m");
  const get = async f => { const r = await fetch("./data/region/" + f); if (!r.ok) throw new Error(f); return new Uint8Array(await r.arrayBuffer()); };
  const [sun, earth] = await Promise.all([get(grid.h.layers.pgda_sun.file), get(grid.h.layers.pgda_earth.file)]);
  state.pgda = { sun, earth }; state.slope = grid.slopeField(); state.region = grid;
  status("");
  return grid;
}
const allSeries = () => Promise.all(state.index.sites.map(async site => ({ site, series: await series(site.id) })));
function status(msg) { const el = $("#status"); if (el) el.textContent = msg; }
/** apply data-driven sizes after rendering (CSP forbids inline style attributes) */
function applySizes(root) {
  root.querySelectorAll("[data-flex]").forEach(e => { e.style.flexGrow = e.dataset.flex; });
  root.querySelectorAll("[data-h]").forEach(e => { e.style.height = e.dataset.h + "%"; });
}

// ------------------------------------------------------------------ geometry at the selected time
async function skyAt(id, t) {
  const s = await series(id);
  const g = s.at(t);
  if (!g) return null;
  return { ...g, sunEnu: azElToEnu(g.sunAz, g.sunEl), earthEnu: azElToEnu(g.earthAz, g.earthEl), series: s };
}

// ------------------------------------------------------------------ scene levels
let sceneSeq = 0; // a slower, older scene request never overwrites a newer one
async function goGlobe() {
  const seq = ++sceneSeq;
  const site = siteById(state.siteId), sky = await skyAt(state.siteId, state.t);
  if (seq !== sceneSeq) return;
  state.level = "globe"; updateCrumbs();
  viewer?.showGlobe({
    sites: state.index.sites, features: state.index.features,
    onSelectSite: id => { selectSite(id); goRegion(true); },
    sunDirBody: sky ? enuToBody(sky.sunEnu, site.lat, site.lon) : null,
  });
  viewer?.setSelectedSite(state.siteId);
  setLegend();
}
async function goRegion(focus = false) {
  if (!viewer) return;
  const seq = ++sceneSeq;
  const grid = await region();
  const site = siteById(state.siteId), sky = await skyAt(state.siteId, state.t);
  if (seq !== sceneSeq) return;
  state.level = "region"; updateCrumbs();
  viewer.showRegion({
    grid, pgda: state.pgda, slope: state.slope, layer: state.layer, exaggeration: state.exag,
    sites: state.index.sites, features: state.index.features,
    onSelectSite: id => { selectSite(id); viewer.focusRegionSite(siteById(id), grid); },
    sunEnu: sky?.sunEnu, earthEnu: sky?.earthEnu, refSite: site,
  });
  viewer.setSelectedSite(state.siteId);
  if (focus) viewer.focusRegionSite(site, grid, state.reduced ? 0 : 2.0);
  setLegend();
}
async function goSite() {
  if (!viewer) return false;
  const seq = ++sceneSeq;
  status("Loading local LOLA tile…");
  const [tl, s] = await Promise.all([tile(state.siteId), series(state.siteId)]);
  const sky = await skyAt(state.siteId, state.t);
  status("");
  if (seq !== sceneSeq) return false;
  state.level = "site"; updateCrumbs();
  viewer.showSite({ tile: tl, horizon: s.horizon, layer: ["elevation", "slope"].includes(state.layer) ? state.layer : "natural", sunEnu: sky?.sunEnu, earthEnu: sky?.earthEnu });
  setLegend();
  return true;
}
function refreshScene() {
  if (state.level === "globe") return goGlobe();
  if (state.level === "region") return goRegion(false);
  return goSite();
}
async function applyTime() {
  const sky = await skyAt(state.siteId, state.t);
  if (viewer && sky) {
    if (state.level === "region") viewer.setRegionSun(sky.sunEnu, siteById(state.siteId));
    else if (state.level === "site") viewer.setSiteSky(sky.sunEnu, sky.earthEnu);
    else goGlobe();
  }
  setLegend(); renderCtx(); renderSide(); rerenderPanel();
}
function setTime(t) {
  state.t = Math.min(state.windowEnd, Math.max(state.windowStart, t));
  return applyTime();
}
function selectSite(id) {
  state.siteId = id;
  viewer?.setSelectedSite(id);
  renderCtx(); renderSide(); rerenderPanel(); updateCrumbs();
}
function updateCrumbs() {
  document.querySelectorAll("#dock [data-level]").forEach(b => b.classList.toggle("on", b.dataset.level === state.level));
  const c = $("#crumbs"); if (!c || !state.index) return;
  c.textContent = `View: ${{ globe: tr("globe"), region: tr("pole"), site: siteById(state.siteId)?.name }[state.level]}`;
}

// ------------------------------------------------------------------ legend (inside the right column)
function setLegend() {
  const L = $("#legend"); if (!L) return;
  const g = state.region;
  const bar = (cls, a, b, unit, note) => `<div class="ramp ${cls}"></div><div class="ramp-labels"><span>${a}</span><span>${b}</span></div><small>${unit}</small>${note ? `<small class="muted">${note}</small>` : ""}`;
  let html;
  if (state.level === "globe") html = `<div class="row between"><span class="h-card">Globe</span>${prov("unk", "VISUAL")}</div><small>NASA SVS CGI Moon Kit colour map — visual reference only, not terrain science. Markers: catalogue site centres.</small>`;
  else if (state.layer === "elevation") html = `<div class="row between"><span class="h-card">Altitude</span>${prov("val")}</div>` + (state.level === "region" && g
    ? bar("vir", `${fmt(g.min / 1000, 1)} km`, `${fmt(g.max / 1000, 1)} km`, "Height above the 1,737.4 km reference sphere (LOLA datum)", "LRO/LOLA LDEM_80S_80M · 400 m block mean")
    : bar("vir", "low", "high", "Local relief of the 16 × 16 km tile (site tangent plane)", "LOLA 80 m · bilinear at 40 m"));
  else if (state.layer === "slope") html = `<div class="row between"><span class="h-card">Slope</span>${prov("est")}</div>${bar("slp", "0°", "≥25°", "Green ≤ 12° (trainer limit) · amber 12–25° · red > 25°", `From LOLA at ${state.level === "region" ? "400" : "40"} m — slope depends on scale; boulders are not resolved`)}`;
  else if (state.layer === "illumination" && state.level === "region") html = `<div class="row between"><span class="h-card">Average sunlight</span>${prov("val")}</div>${bar("inf", "0%", "100%", "Long-term fraction of the solar disc visible · black = permanent shadow", "NASA GSFC PGDA AVGVISIB_75S_120M (Mazarico et al. 2011)")}`;
  else if (state.layer === "earth" && state.level === "region") html = `<div class="row between"><span class="h-card">Earth in view</span>${prov("val")}</div>${bar("ear", "0%", "100%", "Long-term fraction of time any part of Earth is above the horizon", "NASA GSFC PGDA AVGVISIB_75S_120M_EARTH")}`;
  else html = `<div class="row between"><span class="h-card">Sun-lit relief</span>${prov("val", "VAL · SPICE")}</div><small>Light comes from the Sun at ${iso(state.t)} (JPL/NAIF). GPU shadows and a weak fill light are illustrative; the numbers use the terrain-horizon model.</small>`;
  if (state.level === "region" && state.exag !== 1) html += `<small class="warn">Vertical exaggeration ×${state.exag} — read heights from the panels</small>`;
  L.innerHTML = html;
}

// ------------------------------------------------------------------ context bar
function renderCtx() {
  const c = $("#ctx"); if (!c || !state.index) return;
  const s = siteById(state.siteId);
  if (state.lab.running) {
    c.innerHTML = `<b>Landing Lab</b><span class="dot">•</span><span class="t2">Educational simulation · ${esc(s.name)}</span><span class="dot">•</span><span class="t2">${iso(state.t)}</span>${prov("sim", "SIMULATION")}<button class="chipg" id="ctx-abort" type="button">Abort</button>`;
    $("#ctx-abort").addEventListener("click", () => { stopLanding(); renderCtx(); renderLanding(); });
    return;
  }
  const when = new Date(state.t).toISOString().slice(0, 16);
  const action = { explore: ["compare", "Compare"], compare: ["recover", "What if it slips?"], recover: ["landing", "Fly it"], landing: ["explore", "Explore site"], evidence: ["explore", "Back to map"] }[state.view];
  c.innerHTML = `<b>${siteNum(s.id)} · ${esc(s.name)}</b><span class="dot">•</span>
    <label class="sr" for="when">Date and time (UTC)</label><input id="when" type="datetime-local" step="3600" value="${when}" min="${new Date(state.windowStart).toISOString().slice(0, 16)}" max="${new Date(state.windowEnd).toISOString().slice(0, 16)}"><span class="t3">UTC</span>
    <span class="dot">•</span><span class="t2">${state.compareH / 24} days</span>${prov("unk", "PRELIMINARY")}
    <button class="chipg" data-preset="now" type="button">Now</button><button class="chipg" data-preset="im2" type="button">IM-2 day</button><button class="chipg" data-preset="m24" type="button" aria-label="24 hours earlier">−24 h</button><button class="chipg" data-preset="p24" type="button" aria-label="24 hours later">+24 h</button>
    <button class="chipa" id="ctx-action" type="button">${esc(action[1])}</button>`;
  $("#when").addEventListener("change", e => { const v = Date.parse(e.target.value + ":00Z"); if (Number.isFinite(v)) setTime(v); });
  c.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const p = b.dataset.preset;
    if (p === "im2") { state.siteId = "mons-mouton-im2"; state.t = IM2_EPOCH; viewer?.setSelectedSite(state.siteId); refreshScene(); applyTime(); return; }
    setTime(p === "now" ? Math.floor(Date.now() / HOUR_MS) * HOUR_MS : state.t + (p === "p24" ? 24 : -24) * HOUR_MS);
  }));
  $("#ctx-action").addEventListener("click", () => setView(action[0]));
}

// ------------------------------------------------------------------ right column: site at a glance
function statCircle(cls, value, label, sats) {
  const pos = ["n", "e", "s", "w"];
  return `<div class="stat ${cls}" role="img" aria-label="${esc(label)} ${esc(value)}%; ${sats.map(s => `${s[1]} ${s[0]}`).join(", ")}"><div class="ring"></div>
    <div class="core"><b>${value}<small>%</small></b><span>${esc(label)}</span></div>
    ${sats.map((s, i) => `<div class="sat ${pos[i]}" title="${esc(s[1])}"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join("")}</div>`;
}
async function renderSide() {
  const el = $("#side-body"); if (!el || !state.index) return;
  if (state.view === "evidence") { $("#side").hidden = true; return; }
  $("#side").hidden = false;
  const s = siteById(state.siteId), sky = await skyAt(state.siteId, state.t);
  if (!sky) { el.innerHTML = `<section class="glass card"><span class="h-card">${esc(s.name)}</span><p class="t2 small">${prov("unk", "N/D")} ${esc(tr("notComputed"))}: the selected time is outside the computed ephemeris window (${dayLabel(state.windowStart)} – ${dayLabel(state.windowEnd)}).</p></section>`; return; }
  const ser = sky.series, w = ser.window(state.t, state.compareH);
  const sunSet = ser.nextState(state.t, "sun", false), sunRise = ser.nextState(state.t, "sun", true);
  const eSet = ser.nextState(state.t, "earth", false), eRise = ser.nextState(state.t, "earth", true);
  const up = sky.sunMargin >= 0, eup = sky.earthMargin >= 0;
  const ok = w.status === "COMPUTED";
  const nowLine = up
    ? (Number.isFinite(sunSet.hours) ? [hrs(sunSet.hours), "until the Sun sets behind the terrain"] : ["—", "Sun stays up until the end of the data window"])
    : (Number.isFinite(sunRise.hours) ? [hrs(sunRise.hours), "until the Sun rises over the terrain"] : ["—", "no sunrise before the end of the data window"]);
  el.innerHTML = `
    <section class="glass card" aria-label="Light and contact at a glance">
      <div class="row between"><span class="h-card">${siteNum(s.id)} · ${esc(s.name)}</span>${prov("val", "VAL · LOLA + DE440")}</div>
      <div class="stats">${ok ? statCircle("sun", fmt(w.sunPct, 0), "Sun visible", [[String(w.darkRuns), "nights"], [hrs(w.longestDarkH), "longest"], [up ? hrs(sunSet.hours) : "—", "sets"], [up ? "—" : hrs(sunRise.hours), "rises"]])
        + statCircle("earth", fmt(w.earthPct, 0), "Earth", [[String(w.blackoutRuns), "losses"], [hrs(w.longestBlackoutH), "longest"], [eup ? hrs(eSet.hours) : "—", "sets"], [eup ? "—" : hrs(eRise.hours), "rises"]]) : `<p class="t2 small">${esc(tr("notComputed"))}</p>`}</div>
      <span class="lbl-s">Next ${state.compareH / 24} days from ${iso(state.t)} · disc centre vs LOLA horizon</span>
    </section>
    <section class="glass card" aria-label="Now at the site">
      <span class="lbl-s">Now at the site</span>
      <div class="row"><span class="title">${esc(nowLine[0])}</span></div>
      <span class="t2">${esc(nowLine[1])}</span>
      <div class="krow"><span class="row">${ICON.sun}<span class="t2">Sun</span></span><b>${up ? "+" : ""}${fmt(sky.sunMargin, 2)}° ${up ? "above" : "below"} the ridge</b></div>
      <div class="krow"><span class="row">${ICON.earth}<span class="t2">Earth</span></span><b>${eup ? "+" : ""}${fmt(sky.earthMargin, 2)}° ${eup ? "above" : "below"} the horizon</b></div>
    </section>
    <section class="solid card" aria-label="What you see from here">
      <div class="row between"><span class="h-card">Horizon from the site</span>${prov("val")}</div>
      <canvas id="horizon" width="660" height="200" role="img" aria-label="Horizon panorama: terrain skyline with Sun and Earth tracks for plus or minus 7 days"></canvas>
      <div class="legend-dots"><span><i class="sun"></i>Sun ±7 d</span><span><i class="earth"></i>Earth ±7 d</span><span><i class="none"></i>LOLA skyline</span></div>
    </section>`;
  drawHorizon($("#horizon"), ser, state.t);
}

function drawHorizon(cv, s, t) {
  if (!cv) return;
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, elMin = -6, elMax = 12;
  const X = az => az / 360 * W, Y = el => H - (el - elMin) / (elMax - elMin) * H;
  ctx.fillStyle = "#050607"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1; ctx.fillStyle = "#8E99A6"; ctx.font = "600 12px Manrope, sans-serif";
  for (let e = -5; e <= 10; e += 5) { ctx.beginPath(); ctx.moveTo(0, Y(e)); ctx.lineTo(W, Y(e)); ctx.stroke(); ctx.fillText(`${e}°`, 4, Y(e) - 3); }
  [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([l, a]) => ctx.fillText(l, X(a) + 4, H - 6));
  ctx.beginPath(); ctx.moveTo(0, H);
  s.horizon.forEach(h => ctx.lineTo(X(h.az), Y(h.el))); ctx.lineTo(W, Y(s.horizon[0].el)); ctx.lineTo(W, H); ctx.closePath();
  ctx.fillStyle = "#2A3038"; ctx.fill(); ctx.strokeStyle = "#F2F4F5"; ctx.lineWidth = 1.5; ctx.stroke();
  for (const [key, color] of [["sun", "#FFD166"], ["earth", "#4C9BFF"]]) {
    for (let k = -168; k <= 168; k += 3) {
      const g = s.at(t + k * HOUR_MS); if (!g) continue;
      ctx.globalAlpha = k > 0 ? 0.35 : 0.75; ctx.fillStyle = color;
      ctx.fillRect(X(key === "sun" ? g.sunAz : g.earthAz) - 1.5, Y(key === "sun" ? g.sunEl : g.earthEl) - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    const g = s.at(t); if (!g) continue;
    ctx.beginPath(); ctx.arc(X(key === "sun" ? g.sunAz : g.earthAz), Y(key === "sun" ? g.sunEl : g.earthEl), 8, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#050607"; ctx.lineWidth = 2; ctx.stroke();
  }
}

// ------------------------------------------------------------------ left column: one question per view
const panel = () => $("#panel-body");
function rerenderPanel() { if (!state.lab.running) RENDER[state.view](); }

async function renderExplore() {
  $("#panel").classList.remove("wide");
  const s = siteById(state.siteId);
  const layers = [["natural", tr("natural"), ICON.sun], ["elevation", tr("elevation"), ICON.up], ["slope", tr("slope"), ICON.slope], ["illumination", tr("illumination"), ICON.sun], ["earth", tr("earthvis"), ICON.earth], ["candidates", tr("candidates"), ICON.pin]];
  const sky = await skyAt(state.siteId, state.t);
  const ser = await series(state.siteId), w = ser.window(state.t, state.compareH);
  const tl = state.level === "site" ? await tile(state.siteId) : null;
  const slopeHere = tl ? tl.normal(0, 0).slopeDeg : NaN;
  panel().innerHTML = `
    <div class="row"><button class="${state.exploreTab === "layers" ? "chipa" : "chipg"}" data-tab="layers" type="button">Layers</button><button class="${state.exploreTab === "sites" ? "chipa" : "chipg"}" data-tab="sites" type="button">Sites</button></div>
    ${state.exploreTab === "layers" ? `
      <p class="t2 small">Choose what to paint on the terrain. One layer at a time.</p>
      <div class="col" role="radiogroup" aria-label="Map layer">
        ${layers.map(([v, l, ic]) => `<label class="wpill ${state.layer === v ? "on" : ""}"><input type="radio" name="layer" value="${v}" ${state.layer === v ? "checked" : ""}>${ic}<span>${esc(l)}</span></label>`).join("")}
        <label class="wpill disabled" title="LDEM_80S_80M has no per-pixel uncertainty; PGDA 5 m error maps are not ingested yet."><input type="radio" name="layer" disabled>${ICON.layers}<span>${esc(tr("uncertainty"))}</span><span class="v">${prov("unk", "N/D")}</span></label>
      </div>
      <div class="row wrap"><span class="lbl-s">Vertical exaggeration</span>${[1, 2, 4].map(k => `<button class="${state.exag === k ? "chipa" : "chipg"}" data-exag="${k}" type="button">×${k}</button>`).join("")}</div>` : `
      <div class="col">${state.index.sites.map((x, i) => `<button class="wpill ${x.id === state.siteId ? "on" : ""}" data-site="${x.id}" type="button"><span class="letter">${i + 1}</span><span>${esc(x.name)}<small class="mono">${fmt(Math.abs(x.lat), 3)}°S · ${fmt((x.lon + 360) % 360, 3)}°E</small></span></button>`).join("")}</div>`}
    <section class="solid card" aria-label="Selected site">
      <div class="row"><span class="letter-dark">${siteNum(s.id)}</span><div><span class="h-card">${esc(s.name)}</span><div class="mono t3 small">${fmt(Math.abs(s.lat), 3)}°S · ${fmt((s.lon + 360) % 360, 3)}°E</div></div></div>
      <div class="divider"></div>
      <div class="row between"><span class="lbl-s">Light and contact · ${state.compareH / 24} days</span>${prov("val")}</div>
      ${w.status === "COMPUTED" ? `
      <div class="krow"><span class="t2">Sun visible</span><b>${fmt(w.sunPct, 0)}%</b></div>
      <div class="krow"><span class="t2">Earth visible</span><b>${fmt(w.earthPct, 0)}%</b></div>
      <div class="krow"><span class="t2">Sun + Earth</span><b>${fmt(w.bothPct, 0)}%</b></div>
      <div class="krow"><span class="t2">Longest night</span><b>${hrs(w.longestDarkH)}</b></div>
      <div class="krow"><span class="t2">Longest Earth loss</span><b>${hrs(w.longestBlackoutH)}</b></div>` : `<p class="t2 small">${prov("unk", "N/D")} ${esc(tr("notComputed"))}</p>`}
      <div class="divider"></div>
      <div class="row between"><span class="lbl-s">Terrain · LOLA 80 m/px</span>${prov("val")}</div>
      <div class="krow"><span class="t2">Altitude</span><b>${s.site_height_m >= 0 ? "+" : ""}${Math.round(s.site_height_m).toLocaleString("en-US")} m</b></div>
      <div class="krow"><span class="t2">Slope at centre ${prov("est")}</span><b>${Number.isFinite(slopeHere) ? fmt(slopeHere, 1) + "°" : "open Site 3D"}</b></div>
      <p class="t3 small">${esc(s.source)}. Catalogue feature centre — <strong>not</strong> a certified touchdown point.</p>
    </section>
    <section class="glass card" aria-label="What you see from here">
      <span class="h-card">What you see from here</span>
      <p class="t2">${sky ? `The Sun is ${fmt(Math.abs(sky.sunMargin), 1)}° ${sky.sunMargin >= 0 ? "above" : "below"} the terrain horizon and the Earth ${fmt(Math.abs(sky.earthMargin), 1)}° ${sky.earthMargin >= 0 ? "above" : "below"} it.` : esc(tr("notComputed"))}</p>
      <div class="btns"><button class="btnA" data-go="compare" type="button">Compare</button><button class="btnL" data-go="landing" type="button">${ICON.lab}Land</button></div>
    </section>`;
  const p = panel();
  p.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { state.exploreTab = b.dataset.tab; renderExplore(); }));
  p.querySelectorAll("input[name=layer]").forEach(r => r.addEventListener("change", () => {
    state.layer = r.value;
    if (state.level === "region") viewer?.setRegionLayer(state.layer); else if (state.level === "site") viewer?.setSiteLayer(state.layer);
    setLegend(); renderExplore();
  }));
  p.querySelectorAll("[data-exag]").forEach(b => b.addEventListener("click", () => { state.exag = Number(b.dataset.exag); if (state.level === "region") goRegion(false); renderExplore(); }));
  p.querySelectorAll("[data-site]").forEach(b => b.addEventListener("click", () => {
    selectSite(b.dataset.site);
    if (state.level === "site") goSite(); else if (state.level === "region") viewer?.focusRegionSite(siteById(state.siteId), state.region); else goRegion(true);
    applyTime();
  }));
  p.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => setView(b.dataset.go)));
}

const RULES = R => [
  [`Sun ≥ ${R.minSun}% of the hours`, w => w.sunPct >= R.minSun],
  [`Earth loss ≤ ${R.maxBlackout} h`, w => w.longestBlackoutH <= R.maxBlackout],
];

async function renderCompare() {
  $("#panel").classList.add("wide");
  const R = state.recover, entries = await allSeries();
  const rows = entries.map(({ site, series: s }) => ({ site, w: s.window(state.t, state.compareH) }));
  const ok = rows.filter(r => r.w.status === "COMPUTED");
  const passes = r => r.w.status === "COMPUTED" && RULES(R).every(([, f]) => f(r.w));
  const ranked = [...ok].sort((a, b) => (passes(b) - passes(a)) || (b.w.bothPct - a.w.bothPct));
  const best = ranked[0];
  const failing = ok.filter(r => !passes(r));
  const reason = r => r.w.sunPct < R.minSun ? `only ${fmt(r.w.sunPct, 0)}% Sun` : `Earth lost for ${hrs(r.w.longestBlackoutH)}`;
  const answer = !best ? tr("notComputed") : passes(best)
    ? `${siteNum(best.site.id)} · ${best.site.name} meets every rule and has the most hours with both Sun and Earth.`
    : `No site meets every rule; ${best.site.name} comes closest.`;
  const ext = (k, hi) => { const v = ok.map(r => r.w[k]); return hi ? Math.max(...v) : Math.min(...v); };
  const cell = (r, k, d, hi, unit = "") => {
    if (r.w.status !== "COMPUTED") return `<b class="num">—</b>`;
    const v = r.w[k], cls = v === ext(k, hi) ? "good-v" : v === ext(k, !hi) ? "bad-v" : "";
    return `<b class="num ${cls}">${fmt(v, d)}${unit}</b>`;
  };
  const sel = rows.find(r => r.site.id === state.siteId);
  const ser = await series(state.siteId);
  const days = Math.min(14, state.compareH / 24), dSun = ser.daily(state.t, days, "sun"), dEarth = ser.daily(state.t, days, "earth");
  panel().innerHTML = `
    <section class="glass card" aria-label="Answer">
      <span class="lbl-s">Which site is best for these ${state.compareH / 24} days?</span>
      <p class="answer">${esc(answer)}</p>
      <p class="t2">${failing.length ? failing.map(r => `${esc(r.site.name)}: ${esc(reason(r))}`).join(" · ") : "Every site meets the rules in this window."}</p>
      <div class="btns"><button class="btnA" data-go="recover" type="button">What if it slips?</button><button class="btnL" data-go="landing" type="button">${ICON.lab}Land</button></div>
    </section>
    <div class="row wrap"><span class="lbl-s">Window</span>${[[168, "7 days"], [336, "14 days"], [672, "28 days"]].map(([h, l]) => `<button class="${state.compareH === h ? "chipa" : "chipg"}" data-win="${h}" type="button">${l}</button>`).join("")}
      <span class="lbl-s">Rules: Sun ≥ ${R.minSun}% · Earth loss ≤ ${R.maxBlackout} h</span></div>
    <section class="col" aria-label="Sites">${rows.map((r, i) => `<button class="wpill ${r.site.id === state.siteId ? "on" : ""}" data-site="${r.site.id}" type="button"><span class="letter">${i + 1}</span><span>${esc(r.site.name)}<small>${dayLabel(state.t)} · ${state.compareH / 24} days</small></span><span class="v">${r.w.status !== "COMPUTED" ? prov("unk", "N/D") : passes(r) ? prov("ok", "Meets all") : prov("bad", "Fails: " + reason(r))}</span></button>`).join("")}</section>
    <section class="solid card" aria-label="Differences">
      <div class="row between"><span class="h-card">Differences</span>${prov("val")}</div>
      <div class="krow"><span class="lbl-s">Site</span><span class="row">${rows.map((r, i) => `<b class="num">${i + 1}</b>`).join("")}</span></div>
      <span class="lbl-s">Energy · rule: Sun ≥ ${R.minSun}%</span>
      <div class="krow"><span class="t2">Sun visible %</span><span class="row">${rows.map(r => cell(r, "sunPct", 0, true)).join("")}</span></div>
      <div class="krow"><span class="t2">Longest night h</span><span class="row">${rows.map(r => cell(r, "longestDarkH", 0, false)).join("")}</span></div>
      <span class="lbl-s">Contact · rule: loss ≤ ${R.maxBlackout} h</span>
      <div class="krow"><span class="t2">Earth visible %</span><span class="row">${rows.map(r => cell(r, "earthPct", 0, true)).join("")}</span></div>
      <div class="krow"><span class="t2">Longest Earth loss h</span><span class="row">${rows.map(r => cell(r, "longestBlackoutH", 0, false)).join("")}</span></div>
      <div class="krow"><span class="t2">Sun + Earth %</span><span class="row">${rows.map(r => cell(r, "bothPct", 0, true)).join("")}</span></div>
      <span class="lbl-s">Long-term reference (NASA PGDA, independent model)</span>
      <div class="krow"><span class="t2">Sun % · Earth %</span><span class="row">${rows.map(r => `<b class="num t3">${fmt(r.site.pgda_sun_pct, 0)}·${fmt(r.site.pgda_earth_pct, 0)}</b>`).join("")}</span></div>
    </section>
    <section class="solid card" aria-label="Timeline">
      <div class="row between"><span class="h-card">Sun and Earth per day · ${siteNum(state.siteId)}</span>${prov("val")}</div>
      ${sel?.w.status === "COMPUTED" ? `<div class="days">${dSun.map((v, i) => `<div class="d" title="Day ${i}: Sun ${fmt(v * 24, 0)} h, Earth ${fmt(dEarth[i] * 24, 0)} h"><span class="s" data-h="${Math.round((v || 0) * 48)}"></span><span class="e" data-h="${Math.round((dEarth[i] || 0) * 48)}"></span></div>`).join("")}</div>
      <div class="axis"><span>D0</span><span>D${Math.floor(days / 2)}</span><span>D${days - 1}</span></div>
      <div class="legend-dots"><span><i class="sun"></i>Sun hours</span><span><i class="earth"></i>Earth hours</span></div>` : `<p class="t2 small">${esc(tr("notComputed"))}</p>`}
    </section>`;
  const p = panel(); applySizes(p);
  p.querySelectorAll("[data-win]").forEach(b => b.addEventListener("click", () => { state.compareH = Number(b.dataset.win); renderCompare(); renderCtx(); renderSide(); }));
  p.querySelectorAll("[data-site]").forEach(b => b.addEventListener("click", () => { selectSite(b.dataset.site); if (state.level === "region") viewer?.focusRegionSite(siteById(state.siteId), state.region); else if (state.level === "site") goSite(); }));
  p.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => setView(b.dataset.go)));
}

async function renderRecover() {
  $("#panel").classList.add("wide");
  const R = state.recover, entries = await allSeries();
  const cons = { minSunPct: R.minSun, maxBlackoutH: R.maxBlackout };
  const mine = entries.filter(e => e.site.id === state.siteId), s = siteById(state.siteId);
  const t2 = state.t + R.delayH * HOUR_MS;
  const base = rankSites(mine, state.t, R.windowH, cons)[0], after = rankSites(mine, t2, R.windowH, cons)[0];
  // exits: wait at the same site (first later date that meets the rules) or switch site at the new date
  let wait = null;
  for (let d = 1; d <= 28 && !wait; d++) {
    const r = rankSites(mine, t2 + d * 24 * HOUR_MS, R.windowH, cons)[0];
    if (r.w.status === "COMPUTED" && !r.violations.length) wait = { site: s, t: t2 + d * 24 * HOUR_MS, w: r.w, kind: "wait" };
  }
  const switches = rankSites(entries.filter(e => e.site.id !== state.siteId), t2, R.windowH, cons).filter(a => a.w.status === "COMPUTED").map(a => ({ site: a.site, t: t2, w: a.w, violations: a.violations, kind: "switch" }));
  const exits = [...(after.w.status === "COMPUTED" && !after.violations.length ? [{ site: s, t: t2, w: after.w, kind: "same" }] : []), ...(wait ? [wait] : []), ...switches.filter(x => !x.violations.length).slice(0, 3)];
  if (!R.pick || !exits.some(e => e.site.id === R.pick.site && e.t === R.pick.t)) R.pick = exits[0] ? { site: exits[0].site.id, t: exits[0].t } : null;
  const nViol = after.violations?.length || 0;
  const delta = (label, k, unit, hiGood) => {
    const a = base.w[k], b = after.w[k]; if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
    const worse = hiGood ? b < a : b > a;
    return `<div class="krow"><span class="t2">${label}</span><span class="row"><span class="kdim">${fmt(a, 0)}${unit}</span><b class="num ${worse ? "bad-v" : b !== a ? "good-v" : ""}">${fmt(b, 0)}${unit}</b></span></div>`;
  };
  const sentence = after.w.status !== "COMPUTED" ? tr("notComputed")
    : nViol ? `The delay breaks ${nViol} rule${nViol > 1 ? "s" : ""} at ${s.name}: ${after.violations.join("; ")}.` : `${s.name} still meets every rule after a +${R.delayH} h delay.`;
  panel().innerHTML = `
    <section class="glass card" aria-label="Report a delay">
      <span class="lbl-s">Step 1 · how much did the landing slip?</span>
      <div class="row"><span class="title">+${R.delayH}</span><span class="t2">hours</span></div>
      <div class="row wrap">${[24, 48, 72, 168, 336].map(h => `<button class="${R.delayH === h ? "chipa" : "chipg"}" data-delay="${h}" type="button">+${h < 168 ? h + " h" : h / 24 + " d"}</button>`).join("")}</div>
      <div class="wpill"><span>New landing ${iso(t2)}</span></div>
      <div class="grid2">
        <label class="fld">Surface mission<select id="rw">${[[168, "7 days"], [336, "14 days"], [672, "28 days"]].map(([h, l]) => `<option value="${h}" ${R.windowH === h ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="fld">Min. Sun %<input id="rms" type="number" min="0" max="100" step="5" value="${R.minSun}"></label>
        <label class="fld">Max. Earth loss (h)<input id="rmb" type="number" min="0" max="2000" step="12" value="${R.maxBlackout}"></label>
      </div>
    </section>
    <section class="solid card" aria-label="What changed">
      <div class="row between"><span class="h-card">Step 2 · what changed</span>${nViol ? prov("bad", `${nViol} RULE${nViol > 1 ? "S" : ""} BROKEN`) : prov("ok", "RULES MET")}</div>
      <div class="krow"><span class="lbl-s">${esc(s.name)}</span><span class="row"><span class="kdim">planned</span><span class="num lbl-s">+${R.delayH} h</span></span></div>
      ${base.w.status === "COMPUTED" && after.w.status === "COMPUTED" ? delta("Sun visible", "sunPct", "%", true) + delta("Longest night", "longestDarkH", " h", false) + delta("Earth visible", "earthPct", "%", true) + delta("Longest Earth loss", "longestBlackoutH", " h", false) : `<p class="t2 small">${esc(tr("notComputed"))}</p>`}
    </section>
    <section class="glass card" aria-label="Computed exits">
      <span class="lbl-s">Step 3 · choose an exit</span>
      <p class="answer">${esc(sentence)}</p>
      ${exits.length ? exits.map((x, i) => `<button class="wpill ${R.pick && R.pick.site === x.site.id && R.pick.t === x.t ? "on" : ""}" data-exit="${i}" type="button"><span class="letter">${siteNum(x.site.id)}</span><span>${x.kind === "wait" ? `Wait until ${dayLabel(x.t)}` : x.kind === "same" ? `Keep ${esc(x.site.name)}` : `Land at ${esc(x.site.name)}`}<small>${x.kind === "wait" ? "same site · later date" : "new date"} · both ${fmt(x.w.bothPct, 0)}% · loss ≤ ${hrs(x.w.longestBlackoutH)}</small></span><span class="v">Sun ${fmt(x.w.sunPct, 0)}%</span></button>`).join("")
        : `<p class="t2">No site or date within 28 days meets these rules. Relax a rule or pick a shorter mission.</p>`}
      <button class="btnA" id="fly" type="button" ${R.pick ? "" : "disabled"}>Step 4 · fly it in Landing Lab</button>
      <p class="t3 small">Ranking: % of hours with both Sun and Earth above the terrain horizon, after removing options that break your rules. It ignores slopes, hazards, thermal limits and payload goals — a teaching aid, not a site certification.</p>
    </section>`;
  const p = panel();
  p.querySelectorAll("[data-delay]").forEach(b => b.addEventListener("click", () => { R.delayH = Number(b.dataset.delay); R.pick = null; renderRecover(); }));
  $("#rw").addEventListener("change", e => { R.windowH = Number(e.target.value); R.pick = null; renderRecover(); });
  $("#rms").addEventListener("change", e => { R.minSun = Number(e.target.value); R.pick = null; renderRecover(); });
  $("#rmb").addEventListener("change", e => { R.maxBlackout = Number(e.target.value); R.pick = null; renderRecover(); });
  p.querySelectorAll("[data-exit]").forEach(b => b.addEventListener("click", () => { const x = exits[Number(b.dataset.exit)]; R.pick = { site: x.site.id, t: x.t }; renderRecover(); }));
  $("#fly").addEventListener("click", () => {
    if (!R.pick) return;
    state.lab.scenario = { siteId: R.pick.site, t: R.pick.t, origin: `Recovered from ${s.name} after a +${R.delayH} h delay` };
    state.lab.mode = "recovery"; state.t = R.pick.t; selectSite(R.pick.site); setView("landing");
  });
}

function renderLanding() {
  $("#panel").classList.remove("wide");
  const L = state.lab, v = L.vehicle || (L.vehicle = { fuel: 160, maxThrust: DEFAULT_VEHICLE.maxThrust, isp: DEFAULT_VEHICLE.isp });
  const sc = L.scenario, lim = DEFAULT_VEHICLE.limits, s = siteById(state.siteId);
  panel().innerHTML = `
    <section class="glass card" aria-label="Landing Lab">
      <div class="row between"><span class="lbl-s">Landing Lab · educational simulation</span>${prov("sim")}</div>
      <p class="answer">Fly the descent to ${esc(s.name)}.</p>
      <p class="t2">Deterministic 3-DOF physics (RK4, 50 Hz) over the real LOLA tile, lit by the Sun at ${iso(state.t)}. The vehicle is hypothetical.</p>
      <div class="row">${[["guided", "Guided"], ["free", "Free"], ["recovery", "Mission recovery"]].map(([k, l]) => `<button class="${L.mode === k ? "chipa" : "chipg"}" data-mode="${k}" type="button">${l}</button>`).join("")}</div>
      ${L.mode === "recovery" ? `<p class="t2 small">${sc ? esc(sc.origin) + ` → ${esc(siteById(sc.siteId).name)} at ${iso(sc.t)}` : "Run Recover first to pick a delayed scenario; using the current site and time."}</p>` : ""}
    </section>
    <section class="solid card" aria-label="Vehicle">
      <div class="row between"><span class="h-card">Hypothetical lander</span>${prov("sim")}</div>
      <div class="grid2">
        <label class="fld">Propellant (kg)<input id="vf" type="number" min="20" max="600" step="10" value="${v.fuel}"></label>
        <label class="fld">Max thrust (N)<input id="vt" type="number" min="2500" max="12000" step="250" value="${v.maxThrust}"></label>
        <label class="fld">Isp (s)<input id="vi" type="number" min="200" max="460" step="1" value="${v.isp}"></label>
        <label class="check"><input id="va" type="checkbox" ${L.assist ? "checked" : ""}> Drift-damping assist</label>
      </div>
      <p class="t3 small">Touchdown limits: vertical ≤ ${lim.maxVerticalSpeed} m/s · sideways ≤ ${lim.maxHorizontalSpeed} m/s · ground ≤ ${lim.maxGroundSlopeDeg}° · tilt ≤ ${lim.maxTiltDeg}° · target zone 50 m. Teaching parameters, not NASA requirements.</p>
      <button class="btnL" id="go" type="button">${ICON.lab}${esc(tr("start"))}</button>
    </section>
    <section class="glass card" aria-label="Controls">
      <span class="h-card">Controls</span>
      <ul class="keys"><li><kbd>↑</kbd>/<kbd>↓</kbd> or <kbd>Shift</kbd>/<kbd>Ctrl</kbd> throttle · <kbd>Z</kbd> hover · <kbd>X</kbd> cut</li>
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> tilt the thrust (release = assist levels)</li>
      <li><kbd>H</kbd> assist · <kbd>C</kbd> camera · <kbd>P</kbd> pause · <kbd>T</kbd> time ×2 · <kbd>R</kbd> restart</li></ul>
      <p class="t3 small">The 80 m DEM cannot resolve boulders or craters smaller than ~160 m: a successful game landing does not mean the place is safe.</p>
    </section>`;
  const p = panel();
  p.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { L.mode = b.dataset.mode; renderLanding(); }));
  $("#va").addEventListener("change", e => { L.assist = e.target.checked; });
  ["#vf", "#vt", "#vi"].forEach((sel, i) => $(sel).addEventListener("change", e => { v[["fuel", "maxThrust", "isp"][i]] = Number(e.target.value); }));
  $("#go").addEventListener("click", startLanding);
}

async function renderEvidence() {
  $("#panel").classList.add("wide");
  panel().innerHTML = `<section class="glass card"><p class="t2">Loading provenance…</p></section>`;
  const getJson = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  const [rh, vh, vp] = await Promise.all([getJson("./data/region/south_pole_400m.json"), getJson("./data/validation/validation_horizons.json"), getJson("./data/validation/validation_pgda.json")]);
  const meta = (await series(state.siteId)).meta;
  const maxH = vh ? Math.max(...vh.results.flatMap(r => r.comparisons.flatMap(c => [c.max_abs_az_diff_deg_cos_el, c.max_abs_el_diff_deg]))) : NaN;
  const pg = vp ? vp.results.map(r => `<tr><th scope="row">${siteNum(r.site)} · ${esc(siteById(r.site)?.name || r.site)}</th><td class="num">${fmt(r.pipeline_mean_solar_disc_pct, 1)}</td><td class="num">${fmt(r.pgda_avg_solar_disc_pct, 1)}</td><td class="num">${r.diff_sun_pp > 0 ? "+" : ""}${fmt(r.diff_sun_pp, 1)}</td><td class="num">${fmt(r.pipeline_earth_centre_pct, 1)}</td><td class="num">${fmt(r.pgda_avg_earth_any_part_pct, 1)}</td></tr>`).join("") : "";
  panel().innerHTML = `
    <article class="glass card" aria-label="Evidence">
      <span class="lbl-s">Evidence</span>
      <h1 class="title">Where does every number come from?</h1>
      <p class="t2">Light and contact with Earth come from measured terrain and official Sun and Earth positions. The lander is a model for learning. <strong>Status: preliminary</strong> — not reviewed by NASA.</p>
      <div class="grid2">
        <div class="glass-in"><div class="row between"><b>Real data</b>${prov("val", "VAL · EST")}</div><span class="t2 small">Sun, Earth, nights, terrain and slope.</span></div>
        <div class="glass-in"><div class="row between"><b>Simulation</b>${prov("sim")}</div><span class="t2 small">Lander, propellant, landing limits, score.</span></div>
      </div>
      <span class="h-card">What we assume</span>
      <ol class="steps">
        <li><span>1</span><span>The Sun counts as visible when the centre of its disc is above the terrain horizon.</span></li>
        <li><span>2</span><span>The Earth is in view when there is a straight line to it from a 2 m mast. This does not measure radio signal.</span></li>
        <li><span>3</span><span>Terrain beyond 100 km of each site is not used for its horizon; outside the computed window the app says NOT COMPUTED.</span></li>
        <li><span>4</span><span>Coordinates are shown with 3 decimals (≈ 30 m) — never finer than the 80 m data.</span></li>
      </ol>
    </article>
    <section class="solid card" aria-label="Data sources">
      <div class="row between"><span class="h-card">Data sources</span><span class="lbl-s">7 items</span></div>
      <div class="krow"><span>South-pole terrain<br><small class="t3">${rh ? esc(rh.source) : "LOLA"} · 80 m/px · SHA-256 <code>${rh ? esc(rh.source_sha256.slice(0, 10)) : ""}…</code></small></span>${prov("val")}</div>
      <div class="krow"><span>Average sunlight and Earth maps<br><small class="t3">NASA GSFC PGDA · ${rh ? rh.layers.pgda_sun.resolution_m : 120} m · Mazarico et al. 2011</small></span>${prov("val")}</div>
      <div class="krow"><span>Sun and Earth positions<br><small class="t3">${esc(meta.provenance.ephemeris.replace("NAIF ", "JPL/NAIF "))} · ${esc(meta.provenance.spice_frame)}</small></span>${prov("val")}</div>
      <div class="krow"><span>Horizon of each site<br><small class="t3">computed · rays to 100 km · mast 2 m</small></span>${prov("est")}</div>
      <div class="krow"><span>Globe colour map<br><small class="t3">NASA SVS CGI Moon Kit (Ernie Wright) · visual only</small></span>${prov("unk", "VISUAL")}</div>
      <div class="krow"><span>Lander and landing physics<br><small class="t3">hypothetical vehicle · educational model</small></span>${prov("sim")}</div>
      <div class="krow"><span>Rocks smaller than ~160 m<br><small class="t3">no source yet (PGDA 5 m DEMs not ingested)</small></span>${prov("unk", "N/D")}</div>
    </section>
    <section class="solid card" aria-label="Validation">
      <div class="row between"><span class="h-card">How much to trust</span>${prov("val")}</div>
      <div class="krow"><span class="t2">Sun/Earth angles vs JPL Horizons<br><small class="t3">5 sites × 12 epochs × 2 bodies</small></span><b>${Number.isFinite(maxH) ? `≤ ${maxH < 0.000005 ? "0.000005" : fmt(maxH, 6)}°` : "—"}</b></div>
      ${vp ? `<span class="lbl-s">Terrain horizon vs NASA PGDA maps (independent model, longer period)</span>
      <div class="tablewrap"><table><thead><tr><th>Site</th><th>Our Sun %</th><th>PGDA Sun %</th><th>Δ pp</th><th>Our Earth %</th><th>PGDA Earth %</th></tr></thead><tbody>${pg}</tbody></table></div>
      <p class="t3 small">${vp.caveats.map(esc).join(" ")}</p>` : `<p class="t2 small">${esc(tr("notComputed"))}</p>`}
    </section>
    <section class="solid card" aria-label="Equations">
      <span class="h-card">Equations</span>
      <pre class="eq">margin = elevation(body) − horizon(azimuth)   (disc centre; no refraction on the Moon)
dr/dt = v     dv/dt = −μ (r − c)/|r − c|³ + (T/m) û     dm/dt = −T/(Isp·g₀)
μ = 4902.800066 km³/s² (DE440) · g₀ = 9.80665 m/s² · RK4, fixed Δt = 0.02 s</pre>
    </section>
    <section class="glass card" aria-label="Limits">
      <span class="h-card">Known limits</span>
      <ol class="steps">
        <li><span>1</span><span>Coordinates are catalogue feature centres, not certified touchdown points.</span></li>
        <li><span>2</span><span>80 m DEM: boulders and small craters are not represented; horizons near steep rims depend on resolution.</span></li>
        <li><span>3</span><span>No power, thermal or radio-link model; Earth visibility is geometric.</span></li>
        <li><span>4</span><span>3-DOF translational dynamics with rate-limited attitude (not 6-DOF).</span></li>
        <li><span>5</span><span>AI assistance was used to write code and documentation; humans must review scientific claims.</span></li>
      </ol>
      <p class="t3 small">NASA does not endorse this educational prototype. Credits: NASA LRO/LOLA, NASA GSFC PGDA, JPL/NAIF, NASA SVS.</p>
    </section>`;
}

const RENDER = { explore: renderExplore, compare: renderCompare, recover: renderRecover, landing: renderLanding, evidence: renderEvidence };
function setView(v) {
  if (v !== "landing") stopLanding();
  state.view = v;
  document.querySelectorAll("#tabs [data-view]").forEach(b => { const on = b.dataset.view === v; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  RENDER[v](); renderCtx(); renderSide();
  if (v === "landing" && state.level !== "site") goSite();
  try { localStorage.setItem("moonproof-view", v); } catch { /* storage unavailable */ }
}

// ------------------------------------------------------------------ Landing Lab
const KEYS = new Set(["ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyH", "KeyC", "KeyP", "KeyR", "KeyT"]);
async function startLanding() {
  const L = state.lab;
  if (L.mode === "recovery" && L.scenario) { state.siteId = L.scenario.siteId; state.t = L.scenario.t; }
  if (!(await goSite())) return; // superseded by another navigation
  const tl = await tile(state.siteId), sky = await skyAt(state.siteId, state.t);
  const site = siteById(state.siteId);
  const veh = { ...DEFAULT_VEHICLE, fuelMass: L.vehicle.fuel, maxThrust: L.vehicle.maxThrust, isp: L.vehicle.isp };
  const x0 = -420, y0 = -300, ground0 = tl.height(x0, y0), margin = 200;
  L.sim = createSim({
    vehicle: veh, pos: [x0, y0, ground0 + 1000], vel: [7, 5, -18],
    centreDistance: MOON_R_REF + site.site_height_m,
    terrain: (x, y) => { const h = tl.height(x, y); return Number.isFinite(h) ? h : -Infinity; },
    target: [0, 0], bounds: [tl.x0 + margin, -tl.x0 - margin, tl.y0 + margin, -tl.y0 - margin],
  });
  L.sky = sky; L.tile = tl; L.throttleCmd = 0; L.paused = false; L.running = true; L.timeScale = 1; L.keys = {};
  viewer?.addLander(); viewer?.startFollow(); viewer?.setSiteSky(sky?.sunEnu, sky?.earthEnu);
  document.body.classList.add("flying");
  $("#hud").hidden = false; $("#touch").hidden = !matchMedia("(pointer: coarse)").matches;
  $(".coach").hidden = L.mode === "free";
  renderCtx();
  $("#stage").focus();
  status("Descent started: throttle ↑/↓, tilt W/A/S/D.");
}
function stopLanding() {
  state.lab.running = false; document.body.classList.remove("flying"); status("");
  const h = $("#hud"), t = $("#touch"); if (h) h.hidden = true; if (t) t.hidden = true;
}

function control() {
  const L = state.lab, k = L.keys, sim = L.sim;
  const maxCmd = 20 * Math.PI / 180;
  let tiltE = ((k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)) * maxCmd, tiltN = ((k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)) * maxCmd;
  if (L.assist && !tiltE && !tiltN) {
    // Pilot aid: tilt so that thrust removes horizontal velocity with a ~6 s time constant.
    const acc = Math.max(0.5, (L.throttleCmd * sim.vehicle.maxThrust) / sim.s[6]);
    const lim = Math.sin(maxCmd);
    tiltE = Math.asin(Math.max(-lim, Math.min(lim, -sim.s[3] / (6 * acc))));
    tiltN = Math.asin(Math.max(-lim, Math.min(lim, -sim.s[4] / (6 * acc))));
  }
  return { throttle: L.throttleCmd, tiltE, tiltN };
}

function onFrame(dt) {
  const L = state.lab;
  if (!L.running || !L.sim) return;
  const k = L.keys;
  const rate = 0.6 * dt;
  if (k.ArrowUp || k.ShiftLeft || k.ShiftRight || k.thrUp) L.throttleCmd = Math.min(1, L.throttleCmd + rate);
  if (k.ArrowDown || k.ControlLeft || k.ControlRight || k.thrDown) L.throttleCmd = Math.max(0, L.throttleCmd - rate);
  if (!L.paused) advance(L.sim, control(), dt * L.timeScale);
  viewer?.updateLander(L.sim, thrustDirection(L.sim.tilt[0], L.sim.tilt[1]));
  updateHud();
  if (L.sim.outcome && L.running) { L.running = false; setTimeout(showDebrief, 900); }
}

function updateHud() {
  const L = state.lab, sim = L.sim, tm = telemetry(sim);
  const n = L.tile.normal(sim.s[0], sim.s[1]);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("h-alt", fmt(tm.altitudeAGL, 0)); set("h-vz", fmt(tm.vz, 1)); set("h-vh", fmt(tm.hSpeed, 1));
  set("h-thr", fmt(tm.throttle * 100, 0)); set("h-fuel", fmt(tm.fuel, 0)); set("h-mass", fmt(tm.mass, 0));
  set("h-tilt", fmt(tm.tiltDeg, 1)); set("h-t", fmt(tm.t, 1)); set("h-dist", fmt(tm.targetDistance, 0));
  set("h-slope", fmt(n.slopeDeg, 1));
  const fb = $("#h-fuelbar"); if (fb) fb.style.transform = `scaleX(${Math.max(0, tm.fuel / sim.vehicle.fuelMass)})`;
  const sky = L.sky;
  set("h-sun", sky ? (sky.sunMargin >= 0 ? `Sun ${fmt(sky.sunMargin, 2)}° above the terrain — solar power available` : `Sun ${fmt(-sky.sunMargin, 2)}° below the terrain — batteries only`) : tr("notComputed"));
  set("h-earth", sky ? (sky.earthMargin >= 0 ? `Earth ${fmt(sky.earthMargin, 2)}° above — direct-link geometry OK` : `Earth ${fmt(-sky.earthMargin, 2)}° below — no direct-to-Earth link`) : tr("notComputed"));
  const lim = sim.vehicle.limits, warn = [];
  if (tm.fuel <= 0) warn.push("PROPELLANT DEPLETED"); else if (tm.fuel < 0.2 * sim.vehicle.fuelMass) warn.push("LOW PROPELLANT");
  if (tm.altitudeAGL < 60 && -tm.vz > lim.maxVerticalSpeed) warn.push("SINKING FAST");
  if (tm.altitudeAGL < 60 && tm.hSpeed > lim.maxHorizontalSpeed) warn.push("SIDEWAYS DRIFT");
  if (n.slopeDeg > lim.maxGroundSlopeDeg) warn.push(`SLOPE ${fmt(n.slopeDeg, 0)}° BELOW`);
  if (L.paused) warn.push("PAUSED");
  if (L.timeScale !== 1) warn.push(`TIME ×${L.timeScale}`);
  set("h-warn", warn.join(" · "));
  set("h-cam", `camera: ${viewer?.camMode || "—"} · assist ${L.assist ? "on" : "off"}`);
  if (L.mode === "guided") {
    const a = tm.altitudeAGL;
    set("h-tip", a > 600 ? "Stop the fall: raise the thrust until vertical speed is about −10 m/s (Z = hover)." :
      a > 150 ? "Steer toward the green ring with W/A/S/D; release to let the assist damp drift." :
      a > 30 ? "Brake before 100 m: aim for −3 to −5 m/s and under 1 m/s sideways." : "Last metres: −1 to −2 m/s and keep level.");
  } else set("h-tip", "");
  drawTactical(sim);
}

function drawTactical(sim) {
  const cv = $("#tactical"); if (!cv || cv.offsetParent === null) return;
  const c = cv.getContext("2d"), W = cv.width, span = 1500;
  c.clearRect(0, 0, W, W);
  c.save(); c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = "rgba(5,6,7,.9)"; c.fillRect(0, 0, W, W);
  const P = (x, y) => [W / 2 + x / span * W / 2, W / 2 - y / span * W / 2];
  c.strokeStyle = "rgba(255,255,255,.08)";
  for (let g = -1000; g <= 1000; g += 500) { const [a] = P(g, 0); c.beginPath(); c.moveTo(a, 0); c.lineTo(a, W); c.stroke(); const [, b] = P(0, g); c.beginPath(); c.moveTo(0, b); c.lineTo(W, b); c.stroke(); }
  c.strokeStyle = "#2EC4A0"; c.lineWidth = 2; c.beginPath(); c.arc(...P(0, 0), 50 / span * W / 2 + 2, 0, Math.PI * 2); c.stroke();
  const [x, y] = P(sim.s[0], sim.s[1]);
  c.setLineDash([1, 5]); c.strokeStyle = "#F2F4F5"; c.beginPath(); c.moveTo(x, y); c.lineTo(...P(0, 0)); c.stroke(); c.setLineDash([]);
  c.fillStyle = "#B48CF2"; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#B48CF2"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + sim.s[3] * 3, y - sim.s[4] * 3); c.stroke();
  c.restore();
  c.fillStyle = "#8E99A6"; c.font = "700 10px Manrope, sans-serif"; c.fillText("N", W / 2 - 3, 12);
}

async function showDebrief() {
  const L = state.lab, sim = L.sim, o = sim.outcome, c = sim.contact, s = siteById(state.siteId);
  const sr = await series(state.siteId);
  const w = sr.window(state.t, 14 * 24);
  const dist = c ? Math.hypot(c.x, c.y) : NaN, lim = sim.vehicle.limits;
  const fuelLeft = sim.s[6] - sim.vehicle.dryMass, fuelPct = 100 * fuelLeft / sim.vehicle.fuelMass;
  const rules = [
    ["Inside the 50 m target zone", c && dist <= 50],
    ["Slow vertical touchdown", c && c.vVert <= lim.maxVerticalSpeed],
    ["Little sideways motion", c && c.vHor <= lim.maxHorizontalSpeed],
    ["Gentle ground slope", c && c.slope <= lim.maxGroundSlopeDeg],
    ["Lander level", c && c.tilt <= lim.maxTiltDeg],
    ["Site in sunlight", L.sky && L.sky.sunMargin >= 0],
    ["Earth in view", L.sky && L.sky.earthMargin >= 0],
    ["Propellant reserve ≥ 10%", fuelPct >= 10],
  ];
  const passed = rules.filter(r => r[1]).length;
  const headline = { LANDED: fuelPct < 10 ? "Landed, but with little propellant." : dist > 50 ? "Landed safely, but outside the 50 m target zone." : "Landed within the limits.", HARD_LANDING: "Touched down outside a limit.", CRASH: "The lander crashed.", OUT_OF_MODELED_AREA: "The lander left the modelled terrain." }[o.result];
  const tips = [];
  if (c && c.vVert > lim.maxVerticalSpeed) tips.push("Start braking higher: hold about −3 m/s below 50 m, then ease to −1.5 m/s.");
  if (c && c.vHor > lim.maxHorizontalSpeed) tips.push("Null sideways speed before the last 50 m (release W/A/S/D and let the assist work).");
  if (c && c.slope > lim.maxGroundSlopeDeg) tips.push("Use the Slope layer to pick a flatter patch; the 80 m DEM hides smaller hazards, so keep margin.");
  if (c && dist > 50) tips.push("Steer earlier: the target zone is the green ring (50 m).");
  if (fuelPct < 10) tips.push("Avoid long hovers: descend continuously to save propellant.");
  if (o.result === "OUT_OF_MODELED_AREA") tips.push("Stay within the 16 × 16 km terrain tile.");
  if (L.sky && L.sky.sunMargin < 0) tips.push("You landed in darkness: in Compare/Recover choose a date when the Sun clears the terrain horizon.");
  if (L.sky && L.sky.earthMargin < 0) tips.push("Earth is below the terrain horizon: no direct-to-Earth link geometry at touchdown (a relay would be needed).");
  const okBad = (good, warn) => good ? prov("ok", "OK") : warn ? prov("warn", warn) : prov("bad", "FAIL");
  let score = { LANDED: 1000, HARD_LANDING: 300 }[o.result] || 0;
  if (c && score) score += -Math.min(400, 80 * c.vVert) - Math.min(300, dist / 3) + Math.round(2 * fuelLeft);
  $("#debrief-body").innerHTML = `
    <p class="result ${o.result}">${esc(headline)}</p>
    ${o.reasons.length ? `<p class="t2">${o.reasons.map(esc).join(" ")}</p>` : ""}
    <div class="dgrid">
      <div class="col">
        <div class="wpill"><span>Vertical speed ${fmt(c ? -c.vVert : NaN, 1)} m/s</span><span class="v">${okBad(c && c.vVert <= lim.maxVerticalSpeed)}</span></div>
        <div class="wpill"><span>Distance to target ${fmt(dist, 0)} m</span><span class="v">${okBad(c && dist <= 50)}</span></div>
        <div class="wpill"><span>Ground slope ${fmt(c?.slope, 1)}°</span><span class="v">${okBad(c && c.slope <= lim.maxGroundSlopeDeg)}</span></div>
        <div class="wpill"><span>Propellant left ${fmt(Math.max(0, fuelPct), 0)}%</span><span class="v">${okBad(fuelPct >= 20, fuelPct >= 10 ? "LOW" : null)}</span></div>
      </div>
      <section class="solid card"><div class="row between"><span class="h-card">Landing rules</span><span class="lbl-s">${passed} of ${rules.length}</span></div>
        ${rules.map(([l, v]) => `<div class="krow"><span class="t2">${esc(l)}</span>${v ? prov("ok", "OK") : prov("bad", "NO")}</div>`).join("")}
        <span class="t3 small">Limits defined by the educational scenario.</span></section>
    </div>
    <section class="solid card"><div class="row between"><span class="h-card">Descent profile</span>${prov("sim")}</div><canvas id="dchart" width="660" height="180" role="img" aria-label="Altitude and descent rate versus time"></canvas>
      <span class="t3 small">${esc(s.name)} · ${iso(state.t)} · next 14 days: ${w.status === "COMPUTED" ? `both Sun and Earth ${fmt(w.bothPct, 0)}%, darkness ≤ ${hrs(w.longestDarkH)}` : esc(tr("notComputed"))} ${prov("val")}</span></section>
    ${tips.length ? `<section class="glass card"><span class="h-card">Next attempt</span><ol class="steps">${tips.map((t, i) => `<li><span>${i + 1}</span><span>${esc(t)}</span></li>`).join("")}</ol></section>` : ""}
    <p class="t2 small">Flight score ${Math.max(0, Math.round(score))} · flight ${fmt(sim.t, 0)} s · propellant used ${fmt(sim.fuelUsed, 1)} kg. Educational simulation with a hypothetical vehicle and real LOLA terrain (80 m) — not a landing certification.</p>`;
  drawChart($("#dchart"), sim.trace);
  $("#debrief").showModal();
}
function drawChart(cv, trace) {
  const c = cv.getContext("2d"), W = cv.width, H = cv.height; c.fillStyle = "#050607"; c.fillRect(0, 0, W, H);
  if (trace.length < 2) return;
  const T = trace[trace.length - 1].t || 1;
  const A = Math.max(1, ...trace.map(p => p.altitudeAGL).filter(Number.isFinite)), V = Math.max(1, ...trace.map(p => -p.vz));
  const plot = (f, max, color, label, y0) => {
    c.strokeStyle = color; c.lineWidth = 2; c.beginPath();
    trace.forEach((p, i) => { const x = p.t / T * (W - 40) + 30, y = H - 20 - Math.max(0, f(p) || 0) / max * (H - 40); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke(); c.fillStyle = color; c.fillText(label, 34, y0);
  };
  c.font = "600 12px Manrope, sans-serif";
  plot(p => p.altitudeAGL, A, "#F2F4F5", `altitude above ground (max ${A.toFixed(0)} m)`, 16);
  plot(p => -p.vz, V, "#B48CF2", `descent rate (max ${V.toFixed(1)} m/s)`, 32);
  c.fillStyle = "#8E99A6"; c.fillText(`time → ${T.toFixed(0)} s`, W - 90, H - 6);
}

// ------------------------------------------------------------------ input
function onKey(e, down) {
  const L = state.lab;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  if (!L.running || !KEYS.has(e.code) || typing) {
    if (down && viewer && !typing && document.activeElement?.id === "stage" && viewer.orbit.key(e.code)) e.preventDefault();
    return;
  }
  e.preventDefault();
  L.keys[e.code] = down;
  if (!down) return;
  if (e.code === "KeyZ") L.throttleCmd = Math.min(1, (L.sim.s[6] * 1.624) / L.sim.vehicle.maxThrust);
  if (e.code === "KeyX") L.throttleCmd = 0;
  if (e.code === "KeyH") L.assist = !L.assist;
  if (e.code === "KeyP") L.paused = !L.paused;
  if (e.code === "KeyT") L.timeScale = L.timeScale === 1 ? 2 : 1;
  if (e.code === "KeyR") startLanding();
  if (e.code === "KeyC" && viewer) { const m = ["chase", "orbit", "top", "pilot"]; viewer.camMode = m[(m.indexOf(viewer.camMode) + 1) % m.length]; }
}

function bindTouch() {
  document.querySelectorAll("#touch [data-k]").forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); state.lab.keys[k] = true; if (k === "KeyZ" && state.lab.sim) state.lab.throttleCmd = Math.min(1, state.lab.sim.s[6] * 1.624 / state.lab.sim.vehicle.maxThrust); };
    const off = () => { state.lab.keys[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });
}

function bindDock() {
  document.querySelectorAll("#dock [data-level]").forEach(b => b.addEventListener("click", () => {
    const l = b.dataset.level;
    if (l === "globe") goGlobe();
    else if (l === "region") { if (state.level === "globe" && viewer && !state.reduced) { viewer.flyToSouthPole(1.6); setTimeout(() => goRegion(true), 1500); } else goRegion(true); }
    else goSite().then(() => rerenderPanel());
  }));
  $("#zoom-in").addEventListener("click", () => viewer?.orbit.zoom(0.75));
  $("#zoom-out").addEventListener("click", () => viewer?.orbit.zoom(1.33));
}

function applyLang() {
  document.documentElement.lang = state.lang === "pt" ? "pt-BR" : "en";
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = tr(el.dataset.i18n); });
  $("#lang").textContent = state.lang === "en" ? "PT" : "EN";
  rerenderPanel(); updateCrumbs();
}

// ------------------------------------------------------------------ boot
async function boot() {
  try { await loadIndex(); } catch (e) {
    $("#panel-body").innerHTML = `<section class="glass card"><span class="h-card">${esc(tr("notComputed"))}</span><p class="t2">Precomputed NASA products could not be loaded (${esc(e.message)}). Nothing is shown rather than inventing values.</p></section>`; return;
  }
  try {
    viewer = new Viewer($("#stage"), { onFrame, reducedMotion: state.reduced });
    viewer.onTextureError = () => status("NASA SVS globe texture failed to load; showing a plain grey sphere.");
  } catch (e) {
    $("#fallback").hidden = false; $("#fallback").textContent = `3D view unavailable: ${e.message} The panels (Compare, Recover, Evidence) still work.`;
  }
  if (new URLSearchParams(location.search).has("debug")) window.__moonproof = { viewer, state }; // inspection only
  $("#motion").checked = state.reduced; document.body.classList.toggle("reduced", state.reduced);
  $("#motion").addEventListener("change", e => { state.reduced = e.target.checked; viewer?.setReducedMotion(state.reduced); document.body.classList.toggle("reduced", state.reduced); });
  $("#lang").addEventListener("click", () => { state.lang = state.lang === "en" ? "pt" : "en"; applyLang(); });
  document.querySelectorAll("#tabs [data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  addEventListener("keydown", e => onKey(e, true)); addEventListener("keyup", e => onKey(e, false));
  $("#debrief-retry").addEventListener("click", () => { $("#debrief").close(); startLanding(); });
  $("#debrief-recover").addEventListener("click", () => { $("#debrief").close(); setView("recover"); });
  $("#debrief").addEventListener("close", () => { if (!state.lab.running) { stopLanding(); renderCtx(); rerenderPanel(); renderSide(); } });
  bindTouch(); bindDock();
  let saved = null; try { saved = localStorage.getItem("moonproof-view"); } catch { /* ignore */ }
  setView(RENDER[saved] && saved !== "landing" ? saved : "explore");
  await goGlobe();
  // Cinematic intro (skipped with reduced motion, and abandoned if the user navigates first)
  const introSeq = sceneSeq;
  const stillIntro = () => sceneSeq === introSeq && state.level === "globe" && !state.lab.running;
  if (viewer && !state.reduced) setTimeout(() => { if (!stillIntro()) return; viewer.flyToSouthPole(2.4); setTimeout(() => { if (stillIntro()) goRegion(true); }, 2500); }, 900);
  else if (stillIntro()) goRegion(true);
}
boot();
