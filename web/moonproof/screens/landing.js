// F · Landing Lab. Physics = web/lab/physics.js, scene = web/lab/scene.js (imported, not rewritten).
// Every number on screen comes from the simulation, web/data/ or the vehicle limits; nothing is typed from the design.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js";
import { Viewer } from "../../lab/scene.js";
import { TerrainGrid } from "../../lab/terrain.js";
import { createSim, advance, telemetry, thrustDirection, DEFAULT_VEHICLE, MOON_R_REF } from "../../lab/physics.js";
import { mountShell } from "../core/shell.js";
import { loadSites, loadSeries, sealFor, apiOnline, DATA_BASE } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, hrefTo } from "../core/state.js";
import { TEXTS } from "./landing-texts.js";
import { ASSUMED, GUIDE, localGravity, brakeHeight, guidedStep, alertFor, recommendedThrottle, fuelSeconds, fuelFrac, buildAttempt, saveAttempt, loadAttempts } from "./landing-model.js";

register(TEXTS);
// Initial conditions: the same scenario web/lab/app.js (startLanding) flies, so both labs agree.
const SCENARIO = Object.freeze({ x: -420, y: -300, aboveGround: 1000, vel: [7, 5, -18], margin: 200 });
const THROTTLE_RATE = 0.6;      // 1/s, same as web/lab/app.js
const TILT_CMD_RAD = 20 * Math.PI / 180; // same pilot tilt command as web/lab/app.js
const TAPE = Object.freeze({ up: 5, ticks: 5 });
const AUTO_OPEN_MS = 4000;
const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const minus = s => String(s).replace("-", "−");
const fmt = (v, d = 0) => Number.isFinite(v) ? minus(fmtNum(v, d)) : t("nd");
const niceCeil = v => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; };

const DEBUG = new URLSearchParams(location.search).has("debug");
const shell = mountShell({ screen: "landing", context: null, onLang: () => { build(); update(true); } });
const doc = await loadSites();
if (!doc.sites.some(s => s.id === getState().site)) setState({ site: doc.sites[0].id });
const site = () => doc.sites.find(s => s.id === getState().site);
const online = await apiOnline();
const vehicle = DEFAULT_VEHICLE;
const g = localGravity(MOON_R_REF + (site().site_height_m || 0));

const L = { mode: getState().task === "class" ? "guided" : "guided", cam: "chase", sim: null, tile: null, series: null, sky: null, keys: {}, assist: true, throttleCmd: 0,
  paused: true, running: false, step: 1, startAlt: null, fuel0: null, viewer: null, ready: false, error: null, saved: null, lastAlert: { level: "ok" } };
const CAMS = [["chase", "lab.cam.chase"], ["pilot", "lab.cam.descent"], ["orbit", "lab.cam.profile"]];
const ui = {};

// ---------------------------------------------------------------- build static DOM (re-run on language change)
function seg(items, cur, onPick, label) {
  const w = el("div", "lab-seg"); w.setAttribute("role", "group"); w.setAttribute("aria-label", label);
  for (const [v, k] of items) { const b = el("button", "", t(k)); b.type = "button"; b.setAttribute("aria-pressed", String(v === cur)); b.onclick = () => onPick(v); w.append(b); }
  return w;
}
function round(txt, label, fn) { const b = el("button", "lab-round", txt); b.type = "button"; b.setAttribute("aria-label", label); b.onclick = fn; return b; }
function build() {
  document.documentElement.lang = lang();
  $("simseal").textContent = t("lab.sim");
  const back = el("a", "back", "‹ " + t("lab.back")); back.href = hrefTo("compare.html");
  const s = site();
  const meta = el("span", "meta", `${s.n} · ${s.name}`); meta.title = s.name;
  const sealSim = sealEl("SIM");
  ui.pause = round(L.paused ? "▶" : "❚❚", L.paused ? t("lab.resume") : t("lab.pause"), togglePause);
  $("bar").replaceChildren(back, el("b", "ttl", t("lab.title")), meta, sealSim,
    seg([["guided", "lab.mode.guided"], ["free", "lab.mode.free"]], L.mode, v => { L.mode = v; build(); update(true); }, t("lab.mode")),
    seg(CAMS, L.cam, v => setCam(v), t("lab.cam")),
    ui.pause, round("↻", t("lab.restart"), start), round("?", t("lab.help"), openHelp));
  // strip: phase + alert
  ui.phase = el("div", "lab-chip"); ui.clock = el("span", "mp-coord");
  ui.alert = el("div", "lab-chip lab-alert"); ui.alert.hidden = true; ui.alert.setAttribute("role", "alert");
  $("strip").replaceChildren(ui.phase, ui.alert);
  // tapes
  tape("alt", t("lab.alt"), t("lab.alt.unit"));
  tape("vz", t("lab.vz"), t("lab.vz.unit"));
  ui.vh = el("div", "lab-hz"); $("vz").append(ui.vh);
  // bottom cards
  const card = (cls = "") => el("div", "mp-glass " + cls);
  const terr = card("lab-terrain"); const th = el("h3", "", t("lab.terrain")); ui.terrSeal = sealEl(L.terrSeal || "N/D"); th.append(ui.terrSeal);
  ui.prof = el("canvas"); ui.prof.width = 260; ui.prof.height = 46; ui.prof.setAttribute("role", "img"); ui.prof.setAttribute("aria-label", t("lab.terrain"));
  ui.facts = el("div", "lab-facts"); terr.append(th, ui.prof, ui.facts);
  const thr = card(); const thh = el("h3", "", t("lab.thrust")); ui.thrV = el("span", "mp-num"); thh.append(ui.thrV);
  ui.thrTrack = el("div", "lab-bar-track"); ui.thrTrack.setAttribute("role", "slider"); ui.thrTrack.tabIndex = 0; ui.thrTrack.setAttribute("aria-label", t("lab.thrust"));
  ui.thrFill = el("i"); ui.thrBand = el("em"); ui.thrBand.title = t("lab.thrust.band"); ui.thrTrack.append(ui.thrFill, ui.thrBand);
  bindThrustTrack(ui.thrTrack);
  thr.append(thh, ui.thrTrack, el("div", "mp-label", t("lab.thrust.hint")));
  const fu = card(); const fh = el("h3", "", t("lab.fuel")); ui.fuelV = el("span", "mp-num"); fh.append(ui.fuelV);
  ui.fuelTrack = el("div", "lab-bar-track fuel"); ui.fuelFill = el("i"); ui.fuelTrack.append(ui.fuelFill);
  ui.fuelNote = el("div", "mp-label"); fu.append(fh, ui.fuelTrack, ui.fuelNote);
  ui.guide = card("lab-guide"); ui.guide.hidden = L.mode !== "guided";
  $("bottom").replaceChildren(terr, thr, fu, ui.guide);
  // touch pad
  const T = $("touch"); T.replaceChildren();
  const pad = (keys) => { const d = el("div"); for (const [k, txt, aria] of keys) { const b = el("button", "", txt); b.type = "button"; b.setAttribute("aria-label", aria); holdKey(b, k); d.append(b); } return d; };
  T.append(pad([["thrUp", "▲", t("lab.thrust") + " +"], ["thrDown", "▼", t("lab.thrust") + " −"]]),
    pad([["KeyQ", "↑", "N"], ["KeyA", "←", "W"], ["KeyD", "→", "E"], ["KeyE", "↓", "S"]]));
  T.hidden = innerWidth > 700;
  shell.render?.();
}
function tape(id, title, unit) {
  const w = $(id); const h = el("h3", "", title), rail = el("div", "rail"), u = el("div", "unit", unit);
  const mk = el("div", "mark"); mk.textContent = t("nd"); rail.append(mk); w.replaceChildren(h, rail, u); ui[id + "Rail"] = rail; ui[id + "Mark"] = mk;
}
function drawTicks() {
  if (L.startAlt == null) return;
  ui.altMax = niceCeil(L.startAlt);
  const vzDown = niceCeil(Math.abs(SCENARIO.vel[2]) * 1.2); ui.vzMin = -vzDown; ui.vzMax = TAPE.up;
  for (const n of [...ui.altRail.querySelectorAll(".tick")]) n.remove();
  for (const n of [...ui.vzRail.querySelectorAll(".tick")]) n.remove();
  for (let i = 0; i <= TAPE.ticks; i++) { const v = ui.altMax * (1 - i / TAPE.ticks); const k = el("span", "tick", fmt(v)); k.style.top = (i / TAPE.ticks * 100) + "%"; ui.altRail.append(k); }
  for (let i = 0; i <= TAPE.ticks; i++) { const v = ui.vzMax + (ui.vzMin - ui.vzMax) * i / TAPE.ticks; const k = el("span", "tick", fmt(v)); k.style.top = (i / TAPE.ticks * 100) + "%"; ui.vzRail.append(k); }
  const lim = el("span", "tick lim", "▸" + fmt(-vehicle.limits.maxVerticalSpeed)); lim.style.top = ((ui.vzMax + vehicle.limits.maxVerticalSpeed) / (ui.vzMax - ui.vzMin) * 100) + "%"; lim.style.left = "-34px"; ui.vzRail.append(lim);
}
const pctPos = (v, hi, lo) => Math.min(100, Math.max(0, (hi - v) / (hi - lo) * 100)) + "%";

// ---------------------------------------------------------------- input
function holdKey(b, k) {
  const on = e => { e.preventDefault(); L.keys[k] = true; }, off = () => { L.keys[k] = false; };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
}
function bindThrustTrack(tr) {
  let down = false;
  const set = e => { const r = tr.getBoundingClientRect(); L.throttleCmd = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  tr.addEventListener("pointerdown", e => { down = true; tr.setPointerCapture?.(e.pointerId); set(e); });
  tr.addEventListener("pointermove", e => { if (down) set(e); });
  tr.addEventListener("pointerup", () => { down = false; }); tr.addEventListener("pointercancel", () => { down = false; });
  tr.addEventListener("keydown", e => { if (e.key === "ArrowRight") L.throttleCmd = Math.min(1, L.throttleCmd + 0.05); if (e.key === "ArrowLeft") L.throttleCmd = Math.max(0, L.throttleCmd - 0.05); });
}
const KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyZ", "KeyX", "KeyH", "KeyC", "KeyR", "Space"]);
function onKey(e, down) {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "") || $("help").open) return;
  if (!KEYS.has(e.code)) return;
  if (e.code === "Space" && document.activeElement?.tagName === "BUTTON") return;
  e.preventDefault();
  L.keys[e.code] = down;
  if (!down || !L.sim) return;
  if (e.code === "KeyZ") L.throttleCmd = Math.min(1, L.sim.s[6] * g / vehicle.maxThrust);
  if (e.code === "KeyX") L.throttleCmd = 0;
  if (e.code === "KeyH") L.assist = !L.assist;
  if (e.code === "Space") togglePause();
  if (e.code === "KeyR") start();
  if (e.code === "KeyC") setCam(CAMS[(CAMS.findIndex(c => c[0] === L.cam) + 1) % CAMS.length][0]);
}
addEventListener("keydown", e => onKey(e, true)); addEventListener("keyup", e => onKey(e, false));
function control() {
  const k = L.keys, sim = L.sim;
  let tiltE = ((k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)) * TILT_CMD_RAD;
  let tiltN = ((k.KeyQ ? 1 : 0) - (k.KeyE ? 1 : 0)) * TILT_CMD_RAD;
  if (L.assist && !tiltE && !tiltN) { // pilot aid, as in web/lab/app.js: remove horizontal velocity with a first-order lag
    const tau = 6, acc = Math.max(0.5, (L.throttleCmd * vehicle.maxThrust) / sim.s[6]), lim = Math.sin(TILT_CMD_RAD);
    tiltE = Math.asin(Math.max(-lim, Math.min(lim, -sim.s[3] / (tau * acc))));
    tiltN = Math.asin(Math.max(-lim, Math.min(lim, -sim.s[4] / (tau * acc))));
  }
  return { throttle: L.throttleCmd, tiltE, tiltN };
}
function setCam(c) { L.cam = c; if (L.viewer) L.viewer.camMode = c; build(); update(true); }
function togglePause() { if (!L.sim?.outcome) { L.paused = !L.paused; build(); update(true); } }

// ---------------------------------------------------------------- start / frame
async function load() {
  const s = site();
  try {
    [L.tile, L.series] = await Promise.all([TerrainGrid.load(DATA_BASE + s.local_tile), loadSeries(s)]);
  } catch (e) { L.error = String(e.message || e); return false; }
  const st = getState(); let t0 = st.start ? Date.parse(st.start) : L.series.start;
  if (!st.start) { const i = Array.from(L.series.sunMargin).findIndex(m => m >= 0); if (i >= 0) t0 = L.series.start + i * 3600 * 1000; } // first hour with the Sun above the local horizon
  L.simTime = t0; L.sky = L.series.at(t0);
  L.terrSeal = sealFor(doc.status); L.skySeal = L.sky ? sealFor(doc.status) : "N/D";
  return true;
}
async function start() {
  if (!L.tile) return;
  const s = site(), tl = L.tile, ground0 = tl.height(SCENARIO.x, SCENARIO.y);
  L.sim = createSim({ vehicle, pos: [SCENARIO.x, SCENARIO.y, ground0 + SCENARIO.aboveGround], vel: [...SCENARIO.vel], centreDistance: MOON_R_REF + (s.site_height_m || 0),
    terrain: (x, y) => { const h = tl.height(x, y); return Number.isFinite(h) ? h : -Infinity; }, target: [0, 0],
    bounds: [tl.x0 + SCENARIO.margin, -tl.x0 - SCENARIO.margin, tl.y0 + SCENARIO.margin, -tl.y0 - SCENARIO.margin] });
  L.fuel0 = L.sim.s[6] - vehicle.dryMass; L.startAlt = telemetry(L.sim).altitudeAGL;
  L.throttleCmd = 0; L.keys = {}; L.running = true; L.step = 1; L.saved = null; L.paused = L.mode === "guided"; // guided starts at step 1, paused
  clearTimeout(L.openT);
  L.viewer?.addLander(); L.viewer?.startFollow(); if (L.viewer) L.viewer.camMode = L.cam; L.viewer?.setSiteSky?.(...skyEnu());
  build(); drawTicks(); update(true);
}
function skyEnu() { return [null, null]; }
function frame(dt) {
  if (!L.running || !L.sim) return;
  const k = L.keys, rate = THROTTLE_RATE * dt;
  if (k.ArrowUp || k.KeyW || k.ShiftLeft || k.ShiftRight || k.thrUp) L.throttleCmd = Math.min(1, L.throttleCmd + rate);
  if (k.ArrowDown || k.KeyS || k.ControlLeft || k.ControlRight || k.thrDown) L.throttleCmd = Math.max(0, L.throttleCmd - rate);
  if (!L.paused) advance(L.sim, control(), dt);
  L.viewer?.updateLander(L.sim, thrustDirection(L.sim.tilt[0], L.sim.tilt[1]));
  update();
  if (L.sim.outcome && L.running) finish();
}
function ctx(tm) { return { vehicle, mass: L.sim.s[6], g }; }
function update(force) {
  if (!L.sim) { renderEmpty(); return; }
  const sim = L.sim, tm = telemetry(sim), c = ctx(tm);
  // guided step (never goes back); entering a new step pauses the simulation
  const bh = brakeHeight(-tm.vz, { ...c });
  const st = L.mode === "guided" ? guidedStep(tm.altitudeAGL, L.startAlt, Number.isFinite(bh) ? bh : null, L.step) : guidedStep(tm.altitudeAGL, L.startAlt, Number.isFinite(bh) ? bh : null, L.step);
  if (st > L.step) { L.step = st; if (L.mode === "guided" && !sim.outcome) { L.paused = true; build(); force = true; } }
  const al = alertFor(tm, c);
  // phase + clock
  const mm = Math.floor(sim.t / 60), ss = Math.floor(sim.t % 60);
  ui.phase.replaceChildren(el("span", "mp-label", t("lab.phase")), el("b", "", t("lab.phase." + (L.step - 1))), Object.assign(el("span", "mp-coord"), { textContent: t("lab.clock", { t: String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0") }) }));
  if (al.level !== "ok" && !sim.outcome) {
    ui.alert.hidden = false; ui.alert.dataset.level = al.level;
    ui.alert.replaceChildren(Object.assign(el("b"), { textContent: t("lab.alert.fast") }), el("span", "", t("lab.alert.detail", { v: fmt(-tm.vz, 1), h: fmt(tm.altitudeAGL) })));
  } else ui.alert.hidden = true;
  if (al.level !== L.lastAlert.level) { L.lastAlert = al; if (al.level !== "ok") $("live").textContent = t("lab.alert.fast"); }
  // tapes
  const a = tm.altitudeAGL;
  ui.altMark.textContent = fmt(a); ui.altMark.style.top = pctPos(a, ui.altMax, 0);
  const vz = tm.vz; ui.vzMark.textContent = fmt(vz, 1); ui.vzMark.style.top = pctPos(vz, ui.vzMax, ui.vzMin); ui.vzMark.dataset.level = al.level === "ok" ? "" : al.level;
  ui.vh.textContent = `${t("lab.vh")} ${fmt(tm.hSpeed, 1)} ${t("lab.vh.unit")}`;
  // thrust / fuel
  ui.thrV.textContent = fmt(L.throttleCmd * 100) + "%"; ui.thrFill.style.width = (L.throttleCmd * 100) + "%";
  ui.thrTrack.setAttribute("aria-valuenow", String(Math.round(L.throttleCmd * 100))); ui.thrTrack.setAttribute("aria-valuemin", "0"); ui.thrTrack.setAttribute("aria-valuemax", "100");
  const rec = recommendedThrottle(tm, c);
  ui.thrBand.hidden = rec == null; if (rec != null) { ui.thrBand.style.left = Math.max(0, (rec - ASSUMED.bandHalf) * 100) + "%"; ui.thrBand.style.width = Math.min(100, 2 * ASSUMED.bandHalf * 100) + "%"; }
  const ff = fuelFrac(tm.fuel, L.fuel0); ui.fuelV.textContent = ff == null ? t("nd") : fmt(ff * 100) + "%"; ui.fuelFill.style.width = ((ff ?? 0) * 100) + "%";
  const fs = fuelSeconds(tm, vehicle); ui.fuelNote.textContent = fs == null ? t("nd") : t("lab.fuel.time", { t: fmt(fs) });
  // terrain-at-target facts (LOLA slope, Sun, hazard)
  if (force || !ui.factsDone) { ui.factsDone = true; renderFacts(tm); }
  else ui.distEl && (ui.distEl.textContent = t("lab.fromCenter", { n: fmt(tm.targetDistance) }));
  if (force || !ui.profDone) drawProfile();
  renderGuide(tm, bh);
  document.title = `moonproof · ${t("lab.title")}`;
}
function renderEmpty() {
  const msg = L.error ? t("lab.nodata") : t("lab.loading");
  if (ui.phase) ui.phase.textContent = msg;
  if (ui.facts) ui.facts.textContent = t("nd");
}
function renderFacts(tm) {
  const n = L.tile.normal(0, 0).slopeDeg;
  const sunUp = L.sky ? L.sky.sunMargin >= 0 : null;
  const row = (txt, seal) => { const d = el("span", "", txt); if (seal) d.append(" ", sealEl(seal)); return d; };
  ui.dist = row(t("lab.fromCenter", { n: fmt(tm.targetDistance) }), "SIM"); ui.distEl = ui.dist.firstChild;
  ui.facts.replaceChildren(row(`${t("lab.slope")} ${fmt(n, 1)}°`, L.terrSeal), row(sunUp == null ? `${t("lab.lit")} ${t("nd")}` : (sunUp ? t("lab.lit") : t("lab.dark")), L.skySeal),
    row(`${t("lab.hazard")} ${t("nd")}`, "N/D"), ui.dist);
  ui.facts.lastChild.title = t("lab.hazard.nd");
  ui.terrSeal.replaceWith(ui.terrSeal = sealEl(L.terrSeal));
  ui.facts.children[2].title = t("lab.hazard.nd");
}
function drawProfile() {
  const cv = ui.prof, c = cv.getContext("2d"), W = cv.width, H = cv.height, tl = L.tile;
  c.clearRect(0, 0, W, H);
  const span = Math.abs(SCENARIO.x) * 1.2, N = 60, hs = [];
  for (let i = 0; i <= N; i++) hs.push(tl.height(-span + 2 * span * i / N, 0));
  const ok = hs.filter(Number.isFinite); if (!ok.length) { c.fillStyle = "#808C99"; c.fillText(t("nd"), 4, 24); return; }
  const lo = Math.min(...ok), hi = Math.max(...ok, lo + 1);
  c.beginPath(); hs.forEach((h, i) => { const x = i / N * W, y = H - 4 - (h - lo) / (hi - lo) * (H - 10); i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = "#9FB3C8"; c.lineWidth = 2; c.stroke();
  c.fillStyle = "rgba(46,196,160,.25)"; const zw = ASSUMED.zoneRadiusM / span * W; c.fillRect(W / 2 - zw, 0, 2 * zw + 2, H);
  c.setLineDash([4, 3]); c.strokeStyle = "#2EC4A0"; c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
}
function renderGuide(tm, bh) {
  if (L.mode !== "guided") { ui.guide.hidden = true; return; }
  ui.guide.hidden = false;
  const lim = vehicle.limits, n = L.step;
  const sub = { h: fmt(Number.isFinite(bh) ? bh : NaN), v: fmt(lim.maxVerticalSpeed), w: fmt(lim.maxHorizontalSpeed) };
  const key = "lab.s" + n;
  const tag = el("div", "tag", t("lab.guided.step", { n, m: GUIDE.steps }));
  const h = el("h4", "", t(key + ".t", sub)), p = el("p", "", t(key + ".b", sub));
  const parts = [tag, h, p];
  const why = el("button", "lnk", t("lab.why", { v: fmt(lim.maxVerticalSpeed) })); why.type = "button"; why.setAttribute("aria-expanded", String(!!L.whyOpen));
  why.onclick = () => { L.whyOpen = !L.whyOpen; renderGuide(tm, bh); };
  parts.push(why);
  if (L.whyOpen) { const b = el("div", "lab-why", t("lab.why.body", { h: fmt(lim.hardVerticalSpeed) })); const a = el("a", "", t("lab.why.lesson")); a.href = hrefTo("evidence.html") + "#lessons"; a.style.display = "block"; b.append(a); parts.push(b); }
  if (L.paused && !L.sim.outcome) { const go = el("button", "mp-pill is-primary", t("lab.guided.continue")); go.type = "button"; go.onclick = () => { L.paused = false; build(); update(true); }; parts.push(go); }
  else parts.push(el("div", "mp-label", t("lab.guided.pause")));
  // keep focus when the card is redrawn every frame: only rebuild when content changed
  const sig = [n, !!L.whyOpen, L.paused, lang()].join("|");
  if (ui.guide.dataset.sig !== sig) { ui.guide.dataset.sig = sig; ui.guide.replaceChildren(...parts); }
}
function finish() {
  L.running = false;
  const s = site(), prev = loadAttempts(sessionStorage);
  const sky = L.sky ? { sunMargin: L.sky.sunMargin, earthMargin: L.sky.earthMargin } : null;
  const a = buildAttempt(L.sim, { n: prev.length + 1, at: new Date().toISOString(), site: s.id, siteName: s.name, siteN: s.n, mode: L.mode,
    simTimeIso: new Date(L.simTime).toISOString(), terrainStatus: doc.status, sky, fuelStartKg: L.fuel0, g });
  L.saved = saveAttempt(sessionStorage, a);
  $("live").textContent = t("lab.landed");
  const go = el("a", "mp-pill is-primary", t("lab.openNow")); go.href = hrefTo("debrief.html");
  const note = el("div", "lab-chip", t("lab.opening")); note.append(go);
  ui.alert.hidden = false; ui.alert.dataset.level = "ok"; ui.alert.replaceChildren(note);
  L.openT = setTimeout(() => { location.href = hrefTo("debrief.html"); }, AUTO_OPEN_MS);
}
function openHelp() {
  const d = $("help"); const tb = el("table");
  const rows = [["lab.el.flight", "lab.src.sim", "SIM"], ["lab.el.slope", "lab.src.terrain", L.terrSeal || "N/D"], ["lab.el.sun", "lab.src.sky", L.skySeal || "N/D"], ["lab.el.zone", "lab.src.zone", "SIM"], ["lab.el.hazard", "lab.src.hazard", "N/D"]];
  for (const [a, b, s] of rows) { const r = el("tr"); const c3 = el("td"); c3.append(sealEl(s)); r.append(el("th", "", t(a)), el("td", "", t(b)), c3); tb.append(r); }
  const close = el("button", "mp-pill is-primary", "OK"); close.type = "button"; close.onclick = () => d.close();
  d.replaceChildren(el("h2", "", t("lab.help.title")), el("p", "", t("lab.help.keys")), el("h3", "", t("lab.help.src")), tb, el("p", "mp-label", t("lab.sealnote")), el("p", "mp-label", online ? "" : t("lab.offline")), close);
  d.showModal();
}

// ---------------------------------------------------------------- boot
build(); renderEmpty();
const okLoad = await load();
if (!okLoad) { renderEmpty(); build(); } else {
  try {
    L.viewer = new Viewer($("stage"), { onFrame: frame, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
    const s = site();
    L.viewer.showSite({ tile: L.tile, horizon: L.series.horizon, layer: "natural", sunEnu: null, earthEnu: null });
    const sky = L.series.at(L.simTime);
    if (sky) { const { azElToEnu } = await import("../../lab/coords.js"); L.viewer.setSiteSky(azElToEnu(sky.sunAz, sky.sunEl), azElToEnu(sky.earthAz, sky.earthEl)); }
    if (L.viewer.target) { const lbl = THREE ? L.viewer.addLabel(t("lab.zone", { d: fmt(2 * ASSUMED.zoneRadiusM) }), new THREE.Vector3(ASSUMED.zoneRadiusM + 4, (L.tile.height(0, 0) || 0) + 1, 0), { cls: "zone" }) : null; L.zoneLabel = lbl; }
  } catch (e) { $("live").textContent = t("lab.nowebgl"); L.viewer = null; L.noGl = true; L.rafStop = false; (function loop(prev) { requestAnimationFrame(now => { frame(Math.min(0.5, (now - prev) / 1000)); loop(now); }); })(performance.now()); }
  await start();
}
if (DEBUG) window.__landing = L; // inspection hook, only with ?debug
