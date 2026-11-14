// A · Mission Control (design @lisanogueira). Every number comes from web/data/ (LOLA + SPICE series,
// PGDA maps; PRELIMINARY → seal PRE), from GET /api/sites/{id}/sky (next_transitions; seal from its
// science_status) or from POST /api/onboard/site-evaluate with inputs the user declares (H1 is hypothetical → SIM).
// Missing value → "—" + N/D. Spec: designer/A-mission-control.designer.mds.
import { mountShell } from "../core/shell.js";
import { icon } from "../core/icons.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, dailySun, sealFor, apiOnline, api, loadRegion, sourced } from "../core/data.js";
import { createLayerCard, statCircle, barEl, sealEl } from "../core/layers.js";
import { shortName, energySegments } from "./mission-calc.js";
import { t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { runs, dayOf, fmtVal, mapDir, stereoToPx, skyNext, batteryMargin } from "./mission-calc.js";
import "./mission-i18n.js";

const H = 3600e3, DAY = 24;
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const nd = () => t("nd");
const unitTxt = (x, d = 0) => x.value == null ? nd() : fmtNum(x.value, d) + (x.unit === "%" || x.unit === "°" ? x.unit : "\u00a0" + x.unit);
const hrs = v => fmtVal(v, fmtNum, nd(), 0, "\u00a0h");
const deg = v => fmtVal(v, fmtNum, nd(), 1, "°");

const shell = mountShell({ screen: "explore", context: null, onLang: () => draw() });
const doc = await loadSites();
if (!doc.sites.some(s => s.id === getState().site)) setState({ site: doc.sites[0].id });
const hours = () => getState().hours || 14 * DAY;
const online = await apiOnline();
const grid = await loadRegion();
const terrain = await mountTerrain($("terrain"), { sites: doc.sites, selected: getState().site, onSelect: id => setState({ site: id }) });
const site = () => doc.sites.find(s => s.id === getState().site);
let tab = "overview", energyOut = null, cur = null;

// Design A shows every site at once (labels only on the chosen one): fit all markers in the free map area
// between the side panels once; zoom buttons change the span afterwards. core/terrain.js places view.cx/cy
// at the centre of the free area, so no extra offset here.
// The chosen site sits in the centre of the free map area (between the panels), as in design A; the span
// (metres across the free area's short side) shows the neighbouring sites. Zoom buttons scale it.
let zoomK = 1;
const SPAN_M = 70000;
function frame() {
  const s = site(); terrain.view.span = SPAN_M / zoomK; terrain.select(s.id);
  requestAnimationFrame(rays);
}

// Dotted Sun and Earth lines from the chosen marker along their local azimuth, ending at a 34 px icon,
// labelled at mid-line with the margin over the terrain horizon (series at the window start, PRE).
function rays() {
  const svg = $("rays"); svg.replaceChildren(); for (const b of ["sun", "earth"]) { $("ray-" + b).hidden = true; $("ico-" + b).hidden = true; }
  if (!cur) return;
  const s = site(), W = innerWidth, Hh = innerHeight, mk = document.querySelector(`.mp-marker[data-site="${CSS.escape(s.id)}"]`);
  let px, py; if (mk) { const r = mk.getBoundingClientRect(); px = r.left + r.width / 2; py = r.top + r.height / 2; } else [px, py] = stereoToPx(s.stereo_x_m, s.stereo_y_m, terrain.view, W, Hh);
  svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
  const g = cur.geo; if (!g) return;
  const f = terrain.free || { l: 0, t: 0, r: W, b: Hh };
  for (const [body, az, margin, color] of [["sun", g.sunAz, g.sunMargin, "#FFD166"], ["earth", g.earthAz, g.earthMargin, "#4C9BFF"]]) {
    if (!Number.isFinite(az)) continue;
    const [dx, dy] = mapDir(s.lon, az);
    let L = W > 700 ? 250 : 120;
    // keep the icon inside the free map area (between panels, under the context bar, above the dock)
    if (dx > 0) L = Math.min(L, (f.r + 20 - px) / dx); if (dx < 0) L = Math.min(L, (f.l - 20 - px) / dx);
    if (dy > 0) L = Math.min(L, (f.b + 20 - py) / dy); if (dy < 0) L = Math.min(L, (f.t + 6 - py) / dy);
    L = Math.max(90, L);
    // never park the icon on another marker: walk it back along the line until it is 34 px clear
    const others = [...document.querySelectorAll(".mp-marker")].filter(b => b !== mk).map(b => { const q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
    for (let k = 0; k < 8 && others.some(([ox, oy]) => Math.hypot(px + dx * L - ox, py + dy * L - oy) < 46); k++) L -= 18;
    const x2 = px + dx * L, y2 = py + dy * L, x1 = px + dx * 28, y1 = py + dy * 28;
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    Object.entries({ x1, y1, x2: x2 - dx * 19, y2: y2 - dy * 19, stroke: color, "stroke-width": 2.2, "stroke-dasharray": "1 7", "stroke-linecap": "round", opacity: margin >= 0 ? .95 : .5 }).forEach(([k, v]) => ln.setAttribute(k, v));
    svg.append(ln);
    const ico = $("ico-" + body); ico.hidden = false; ico.innerHTML = icon(body); ico.style.left = x2 + "px"; ico.style.top = y2 + "px";
    ico.dataset.below = String(!(margin >= 0));
    const lab = $("ray-" + body); lab.hidden = false;
    lab.textContent = t((body === "sun" ? "mc.sun" : "mc.earth") + (margin >= 0 ? "Above" : "Below"), { n: deg(Math.abs(margin)) });
    lab.style.left = (px + dx * L * .52) + "px"; lab.style.top = (py + dy * L * .52) + "px";
  }
}

function satellites(r, labels) {
  const [a, b, c, d] = labels;
  return [{ value: r ? fmtNum(r.losses) : nd(), label: a }, { value: r ? hrs(r.longest) : nd(), label: b },
    { value: r && r.firstLoss != null ? t("mc.day", { n: dayOf(r.firstLoss) }) : nd(), label: c },
    { value: r && r.firstReturn != null ? t("mc.day", { n: dayOf(r.firstReturn) }) : nd(), label: d }];
}

async function compute(s) {
  const m = await windowMetrics(doc, s, getState().start, hours());
  const i0 = Math.ceil((m.t0 - m.series.start) / H);
  return { m, sunR: runs(m.series.sunMargin, i0, hours()), earthR: runs(m.series.earthMargin, i0, hours()), geo: m.series.at(m.t0) };
}

async function draw() {
  const st = getState(), s = site();
  cur = await compute(s);
  const { m, sunR, earthR } = cur;
  const fmtDate = d => new Intl.DateTimeFormat(lang(), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d) + " UTC";
  shell.setContext({ site: `${s.n} · ${shortName(s.name)}`, date: fmtDate(new Date(m.t0)), days: fmtNum(hours() / DAY), seal: sealFor(doc.status), online,
    action: { label: t("ctx.compare"), href: hrefTo("compare.html") } });

  // ---- left column
  const left = $("left"); left.replaceChildren();
  const tabs = el("div", "mc-tabs"); tabs.setAttribute("role", "tablist");
  for (const k of ["overview", "notes"]) { const b = el("button", "mp-pill", t("mc." + k)); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(tab === k)); b.setAttribute("aria-pressed", String(tab === k)); b.onclick = () => { tab = k; draw(); }; tabs.append(b); }
  left.append(tabs);
  if (tab === "notes") {
    const c = el("div", "mp-card mc-notes");
    for (const [k, v] of [["mc.note.src", s.source], ["mc.note.cat", doc.note]]) c.append(el("h4", "mp-label", t(k)), el("p", null, v || nd()));
    if (s.source_url) { const a = el("a", null, s.source_url); a.href = s.source_url; a.rel = "noreferrer"; c.append(a); }
    left.append(c);
  } else {
    const bat = el("div", "mp-pill is-white mc-battery"); bat.append(t("mc.battery")); bat.insertAdjacentHTML("beforeend", icon("chevron-down")); bat.title = t("mc.battery.long"); left.append(bat);
    const circles = el("div", "mc-circles");
    circles.append(statCircle({ value: unitTxt(m.sunPct), label: t("mc.sunVisible"), seal: m.sunPct.seal, satellites: satellites(sunR, [t("mc.nights"), t("mc.longest"), t("mc.set"), t("mc.rise")]) }));
    const ec = statCircle({ value: unitTxt(m.earthPct), label: t("mc.earth"), seal: m.earthPct.seal, satellites: satellites(earthR, [t("mc.losses"), t("mc.longest"), t("mc.loss"), t("mc.back")]) });
    ec.classList.add("mc-earth"); circles.append(ec); left.append(circles);
    const height = sourced(s.site_height_m, { unit: "m", status: doc.status, source: "web/data/sites.json · site_height_m" });
    const n = grid.normal(s.stereo_x_m, s.stereo_y_m);
    const slope = sourced(n.slopeDeg, { unit: "°", status: "ESTIMATE", source: "LOLA 400 m grid · central difference" });
    for (const [k, v] of [["mc.altitude", height], ["mc.slope", slope]]) {
      const p = el("div", "mp-pill is-white mc-metric"); p.innerHTML = icon(k === "mc.altitude" ? "elevation" : "slope"); p.append(el("span", null, t(k)), sealEl(v.seal), el("b", "mp-num", unitTxt(v, v.unit === "°" ? 1 : 0))); p.id = k === "mc.altitude" ? "pill-alt" : "pill-slope"; p.title = v.source || ""; left.append(p);
    }
    left.append(energyCard(st, s, m));
  }

  // ---- right column
  const right = $("right"); right.replaceChildren(await numbersCard(s, m), await nowCard(s, m));
  const comp = el("div", "mc-compass"); comp.setAttribute("role", "img");
  const az = cur.geo?.earthAz; comp.setAttribute("aria-label", t("mc.compass") + " " + deg(az));
  comp.append(el("small", null, t("mc.compass")), el("b", null, az == null ? nd() : t("mc.dir." + ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8])), el("span", "mp-coord", az == null ? nd() : fmtNum(az, 0) + "°"));
  right.append(comp);
  dock(s); frame();
}

function energyCard(st, s, m) {
  // Battery H1 is hypothetical: no default numbers. The user declares the inputs (kept in this page),
  // POST /api/onboard/site-evaluate runs the simulator; the screen shows only what the API returns.
  const night = m.longestDarkH.value;
  const out = energyOut && energyOut.site === s.id ? energyOut : null;
    const p = out?.power;
  const auton = p && p.load_w > 0 ? (p.initial_charge_wh - p.reserve_wh) / p.load_w : null;
  const margin = out?.res?.ok ? batteryMargin(auton, night) : null;
  // Bar scale = the window (hours): white = longest night (data, PRE), jade = battery margin, grey = rest.
  // Margin and autonomy exist only after the user declares H1 inputs (Proof) and the API answers; else "—".
  const answer = el("div", "mc-energy");
  const seg = energySegments(night, margin, hours()), bar = el("div", "mc-seg"); bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", margin == null ? t("mc.energy.ansNd", { n: hrs(night) }) : t("mc.energy.ans", { n: hrs(night), m: hrs(auton), k: hrs(margin) }));
  for (const [k, w] of Object.entries(seg)) if (w > 0) { const i = el("i", "is-" + k); i.style.flexGrow = String(w); bar.append(i); }
  answer.append(bar);
  const sign = v => v == null ? nd() : (v > 0 ? "+" : "") + hrs(v);
  for (const [k, v, cls] of [["mc.energy.night", hrs(night), "night"], ["mc.energy.margin", sign(margin), "margin"], ["mc.energy.total", hrs(margin == null ? null : auton), "rest"]]) {
    const r = el("div", "mc-erow is-" + cls); r.append(el("span", null, t(k)), el("b", "mp-num", v)); answer.append(r); }
  const why = el("div"); why.append(barEl(dailySun(m.series, m.t0, hours())), el("p", "mp-label", t("mc.energy.why")));
  const form = el("form", "mc-energy-form"); form.append(el("p", "mp-label", t("mc.energy.inputs")));
  const fields = [["battery_capacity_wh", "mc.energy.cap"], ["initial_charge_wh", "mc.energy.init"], ["reserve_wh", "mc.energy.res"], ["solar_generation_w", "mc.energy.gen"], ["load_w", "mc.energy.load"]];
  for (const [k, lab] of fields) { const l = el("label", null, t(lab)); const i = el("input"); i.type = "number"; i.min = "0"; i.step = "any"; i.name = k; i.required = true; i.value = p?.[k] ?? ""; l.append(i); form.append(l); }
  const go = el("button", "mp-pill is-primary", t("mc.energy.run")); go.type = "submit"; form.append(go);
  form.onsubmit = async e => {
    e.preventDefault(); const power = Object.fromEntries(fields.map(([k]) => [k, Number(form.elements[k].value)]));
    const body = { mission_id: "moonproof-mission", start_utc: new Date(m.t0).toISOString().replace(".000Z", "Z"), duration_hours: Math.min(hours(), 720),
      candidates: [{ id: s.id, site_id: s.id, delay_hours: 0 }], power, max_comm_blackout_hours: getState().blackout };
    energyOut = { site: s.id, power, res: await api("/api/onboard/site-evaluate", { method: "POST", body }) }; draw();
  };
  const proof = el("div"); proof.append(form);
  const tb = el("table", "mp-proof");
  const rows = [[t("mc.energy.auton"), hrs(margin == null ? null : auton)], [t("proof.source"), "POST /api/onboard/site-evaluate"],
    [t("proof.status"), out ? (out.res.ok ? (out.res.data?.combined_decision?.status || nd()) : out.res.error) : nd()]];
  for (const [k, v] of rows) { const tr = tb.insertRow(); tr.append(el("th", null, k)); tr.insertCell().textContent = v; }
  proof.append(tb);
  return createLayerCard({ id: "card-energy", title: t("mc.energy"), status: "SIMULATION", answer, why, proof, layer: st.layer, onLayer: layer => setState({ layer }) }).el;
}

let otherId = null;
async function numbersCard(s, m) {
  const others = doc.sites.filter(x => x.id !== s.id);
  if (!others.some(x => x.id === otherId)) otherId = others[0].id;
  const o = others.find(x => x.id === otherId), om = (await compute(o)).m;
  const c = el("article", "mp-card mc-numbers"); c.id = "card-numbers";
  const head = el("div", "mc-num-head"); const h3 = el("h3", null, t("mc.numbers", { site: shortName(s.name) })); h3.title = s.name;
  const dw = el("label", "mc-selwrap mc-chipwrap"); const days = el("select", "mc-chipsel"); days.setAttribute("aria-label", t("mc.window"));
  for (const d of [7, 14, 28]) days.append(new Option(t("ctx.days", { n: fmtNum(d) }), String(d * DAY), false, d * DAY === hours()));
  days.onchange = () => setState({ hours: Number(days.value) });
  dw.append(days); dw.insertAdjacentHTML("beforeend", icon("chevron-down")); head.append(h3, dw); c.append(head);
  const h = (x) => x.value == null ? null : x.value * hours() / 100;
  const both = w => w.raw.status === "COMPUTED" ? w.raw.bothPct * hours() / 100 : null;
  const tb = el("table", "mc-table");
  const section = (title, sub, rows, lowerBetter, vs) => {
    const hr = tb.insertRow(); hr.className = "mc-sec"; const th = el("th"); th.append(el("b", null, title), el("span", null, " • " + sub)); hr.append(th);
    const vc = el("th"); vc.colSpan = 2;
    if (vs) { const sel = el("select", "mc-vs"); sel.setAttribute("aria-label", t("mc.vs"));
      for (const x of others) sel.append(new Option(`${t("mc.vs")} ${x.n} · ${shortName(x.name)}`, x.id, false, x.id === otherId));
      sel.onchange = () => { otherId = sel.value; draw(); }; vc.append(sel); }
    hr.append(vc);
    for (const [lab, a, b] of rows) { const tr = tb.insertRow(); tr.append(el("th", null, lab)); const ta = tr.insertCell(), tb2 = tr.insertCell();
      ta.textContent = fmtVal(a, fmtNum, nd()); tb2.textContent = fmtVal(b, fmtNum, nd());
      // Only risks are flagged: the worse of the two in red with a ✕ (never colour alone).
      if (lowerBetter && a != null && b != null && a !== b) { const worse = a > b ? ta : tb2; worse.classList.add("is-worse"); worse.title = t("mc.worse"); } }
  };
  section(t("mc.windows.t"), t("mc.windows.u"), [[t("mc.sunVisible"), h(m.sunPct), h(om.sunPct)], [t("mc.earthVisible"), h(m.earthPct), h(om.earthPct)], [t("mc.sunAndEarth"), both(m), both(om)]], false, true);
  section(t("mc.risks.t"), t("mc.risks.u"), [[t("mc.shadow"), m.longestDarkH.value, om.longestDarkH.value], [t("mc.loss.long"), m.longestBlackoutH.value, om.longestBlackoutH.value]], true, false);
  c.append(tb);
  const pv = m.series.meta.provenance || {}, f = el("p", "mc-src");
  const short = [/(LOLA)/i.exec(pv.terrain || "")?.[1], /(de4\d\d\w?)/i.exec(pv.ephemeris || "")?.[1]?.toUpperCase()].filter(Boolean).join(" + ");
  const sl = sealEl(m.sunPct.seal); sl.textContent = m.sunPct.seal + (short ? " · " + short : ""); sl.title = `${pv.terrain || ""} · ${pv.ephemeris || ""}`; f.append(sl); c.append(f);
  return c;
}

async function nowCard(s, m) {
  const c = el("article", "mp-card mc-now"); c.id = "card-now";
  const start = new Date(m.t0).toISOString().replace(".000Z", "Z");
  let r = skyNext(await api(`/api/sites/${encodeURIComponent(s.id)}/sky?start=${start}&hours=${Math.min(hours(), 720)}&step=3600`, { timeoutMs: 6000 }), "sun");
  let src = t("mc.now.src");
  if (r.hours == null && r.seal === "N/D" && !r.reason?.match(/no (change|transition)/i)) {
    // API off or site without API series: fall back to the stored hourly series (PRE), and say so.
    const nc = m.series.nextChange(m.t0, "sun");
    if (nc.status === "COMPUTED" && Number.isFinite(nc.hours)) r = { seal: sealFor(doc.status), hours: nc.hours, kind: nc.visible ? "sunset" : "sunrise", reason: null };
    src = t("mc.now.local") + (r.reason ? "" : "");
  }
  const txt = el("div", "mc-now-txt"); const lab = el("p", "mp-label"); lab.append(t("mc.now") + " ", sealEl(r.seal));
  const big = el("p", "mp-num mc-now-big"); big.textContent = r.hours == null ? nd() : `${fmtNum(Math.floor(r.hours))} h ${String(Math.round((r.hours % 1) * 60)).padStart(2, "0")}`;
  txt.append(lab, big, el("p", "mc-now-what", r.hours == null ? (r.reason || t("mc.now.none")) : t("mc.now." + r.kind)));
  const ico = el("span", "mc-now-ico"); ico.innerHTML = icon(String(r.kind || "").startsWith("earth") ? "earth" : "sun"); if (String(r.kind || "").startsWith("earth")) ico.classList.add("is-earth");
  c.title = src; c.append(txt, ico);
  return c;
}

function dock(s) {
  const d = $("dock"), i = doc.sites.indexOf(s), n = doc.sites.length;
  const btn = (ico, label, fn) => { const b = el("button", "mp-pill"); b.type = "button"; b.innerHTML = icon(ico); b.setAttribute("aria-label", label); b.title = label; b.onclick = fn; return b; };
  const hint = el("p", "mc-hint", t("mc.hint"));
  const wrap = el("label", "mc-selwrap"); const sel = el("select", "mc-sel"); sel.setAttribute("aria-label", t("ctx.site"));
  for (const x of doc.sites) sel.append(new Option(`${t("ctx.site")} ${x.n} · ${shortName(x.name)}`, x.id, false, x.id === s.id));
  sel.onchange = () => setState({ site: sel.value });
  sel.onkeydown = e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setState({ site: doc.sites[(i + (e.key === "ArrowLeft" ? n - 1 : 1)) % n].id }); } };
  wrap.append(sel); wrap.insertAdjacentHTML("beforeend", icon("chevron-down"));
  const row = el("div", "mc-dock-row");
  row.append(btn("chevron-left", t("mc.prev"), () => setState({ site: doc.sites[(i + n - 1) % n].id })), btn("chevron-right", t("mc.next"), () => setState({ site: doc.sites[(i + 1) % n].id })), wrap,
    btn("minus", t("mc.zout"), () => { zoomK = Math.max(.35, zoomK / 1.4); frame(); }), btn("plus", t("mc.zin"), () => { zoomK = Math.min(8, zoomK * 1.4); frame(); }));
  d.replaceChildren(hint, row);
}

// Mobile sheet: drag the handle to resize.
const handle = $("handle"), panels = $("panels");
handle.onpointerdown = e => { handle.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = panels.offsetHeight;
  handle.onpointermove = ev => { panels.style.height = Math.max(120, Math.min(innerHeight - 140, h0 + (y0 - ev.clientY))) + "px"; };
  handle.onpointerup = () => { handle.onpointermove = null; frame(); }; };
handle.onkeydown = e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); panels.style.height = Math.max(120, Math.min(innerHeight - 140, panels.offsetHeight + (e.key === "ArrowUp" ? 60 : -60))) + "px"; frame(); } };

addEventListener("resize", () => frame());
let last = getState().site;
onState(s => { if (s.site !== last) { last = s.site; } draw(); });
draw();
