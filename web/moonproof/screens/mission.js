// A · Mission Control (design @lisanogueira). Every number comes from web/data/ (LOLA + SPICE series,
// PGDA maps; PRELIMINARY → seal PRE), from GET /api/sites/{id}/sky (next_transitions; seal from its
// science_status) or from POST /api/onboard/site-evaluate with inputs the user declares (H1 is hypothetical → SIM).
// Missing value → "—" + N/D. Spec: designer/A-mission-control.designer.mds.
import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, dailySun, sealFor, apiOnline, api, loadRegion, sourced } from "../core/data.js";
import { createLayerCard, statCircle, barEl, sealEl } from "../core/layers.js";
import { t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { runs, dayOf, fmtVal, mapDir, skyNext, batteryMargin, pgdaAt } from "./mission-calc.js";
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
let pgda = null;
const pgdaP = Promise.all(["pgda_sun", "pgda_earth"].map(k => fetch(new URL("../../data/region/" + grid.h.layers[k].file, import.meta.url))
  .then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Uint8Array(b)))).then(([sun, earth]) => (pgda = { sun, earth })).catch(() => null);
const terrain = await mountTerrain($("terrain"), { sites: doc.sites, selected: getState().site, onSelect: id => setState({ site: id }) });
const site = () => doc.sites.find(s => s.id === getState().site);
let tab = "overview", energyOut = null, cur = null;

// Keep the chosen site in the free part of the map (between the side panels), not under them.
function frame() {
  const s = site(); terrain.select(s.id);
  const W = innerWidth, Hh = innerHeight, mpp = terrain.view.span / Math.min(W, Hh);
  if (W > 700) { const L = $("left").getBoundingClientRect().right, R = $("right").getBoundingClientRect().left; terrain.view.cx = s.stereo_x_m - ((L + R) / 2 - W / 2) * mpp; }
  else { const top = 190, bot = $("panels").getBoundingClientRect().top; terrain.view.cy = s.stereo_y_m + ((top + bot) / 2 - Hh / 2) * mpp; }
  terrain.redraw(); rays();
}

// Dotted Sun and Earth lines from the site along their local azimuth, labelled with the margin over the terrain horizon.
function rays() {
  const svg = $("rays"); svg.replaceChildren(); if (!cur) return;
  const s = site(), W = innerWidth, Hh = innerHeight, [px, py] = terrain.toPx(s.stereo_x_m, s.stereo_y_m);
  svg.setAttribute("viewBox", `0 0 ${W} ${Hh}`);
  const g = cur.geo; if (!g) return;
  const len = Math.min(W, Hh) * (W > 700 ? .26 : .18);
  for (const [body, az, margin, color] of [["sun", g.sunAz, g.sunMargin, "#FFD166"], ["earth", g.earthAz, g.earthMargin, "#4C9BFF"]]) {
    const [dx, dy] = mapDir(s.lon, az);
    // keep the Sun/Earth icon inside the free map area (below the context bar, above the dock)
    let L2 = len; const top = 150, bot = Hh - 130;
    if (dy < 0) L2 = Math.min(L2, (py - top) / -dy); if (dy > 0) L2 = Math.min(L2, (bot - py) / dy);
    L2 = Math.max(60, L2);
    const x2 = px + dx * L2, y2 = py + dy * L2, x1 = px + dx * 30, y1 = py + dy * 30;
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    Object.entries({ x1, y1, x2, y2, stroke: color, "stroke-width": 3, "stroke-dasharray": "2 8", "stroke-linecap": "round", opacity: margin >= 0 ? 1 : .45 }).forEach(([k, v]) => ln.setAttribute(k, v));
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    Object.entries({ cx: x2, cy: y2, r: 16, fill: color }).forEach(([k, v]) => dot.setAttribute(k, v));
    svg.append(ln, dot);
    const lab = $("ray-" + body); lab.hidden = false;
    lab.textContent = t((body === "sun" ? "mc.sun" : "mc.earth") + (margin >= 0 ? "Above" : "Below"), { n: deg(Math.abs(margin)) });
    lab.style.left = (x2 - dy * 0 + (dx >= 0 ? 0 : 0)) + "px"; lab.style.top = (y2 + (dy > 0 ? 34 : -34)) + "px";
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
  shell.setContext({ site: `${s.n} · ${s.name}`, date: fmtDate(new Date(m.t0)), days: fmtNum(hours() / DAY), seal: sealFor(doc.status), online,
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
    left.append(el("div", "mp-pill is-white mc-battery", t("mc.battery")));
    const circles = el("div", "mc-circles");
    circles.append(statCircle({ value: unitTxt(m.sunPct), label: t("mc.sunVisible"), seal: m.sunPct.seal, satellites: satellites(sunR, [t("mc.nights"), t("mc.longest"), t("mc.set"), t("mc.rise")]) }));
    const ec = statCircle({ value: unitTxt(m.earthPct), label: t("mc.earth"), seal: m.earthPct.seal, satellites: satellites(earthR, [t("mc.losses"), t("mc.longest"), t("mc.loss"), t("mc.back")]) });
    ec.classList.add("mc-earth"); circles.append(ec); left.append(circles);
    const height = sourced(s.site_height_m, { unit: "m", status: doc.status, source: "web/data/sites.json · site_height_m" });
    const n = grid.normal(s.stereo_x_m, s.stereo_y_m);
    const slope = sourced(n.slopeDeg, { unit: "°", status: "ESTIMATE", source: "LOLA 400 m grid · central difference" });
    for (const [k, v] of [["mc.altitude", height], ["mc.slope", slope]]) {
      const p = el("div", "mp-pill is-white mc-metric"); p.append(el("span", null, t(k)), el("b", "mp-num", unitTxt(v, v.unit === "°" ? 1 : 0)), sealEl(v.seal)); left.append(p);
    }
    left.append(energyCard(st, s, m), contactCard(st, s, m, earthR), terrainCard(st, s, height, slope));
  }

  // ---- right column
  const right = $("right"); right.replaceChildren(await numbersCard(s, m), await nowCard(s, m));
  const comp = el("div", "mc-compass"); comp.setAttribute("role", "img");
  const az = cur.geo?.earthAz; comp.setAttribute("aria-label", t("mc.compass") + " " + deg(az));
  comp.append(el("small", null, t("mc.compass")), el("b", null, az == null ? nd() : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8]), el("span", "mp-coord", deg(az)));
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
  const answer = margin == null ? t("mc.energy.ansNd", { n: hrs(night) }) : t("mc.energy.ans", { n: hrs(night), m: hrs(auton), k: hrs(margin) });
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

function contactCard(st, s, m, r) {
  const why = el("div"); why.append(barEl(dailyEarth(m), "var(--earth)"), el("p", "mp-label", t("mc.contact.why")));
  return createLayerCard({ id: "card-contact", title: t("mc.contact"), status: m.earthPct.status,
    answer: t("mc.contact.ans", { n: unitTxt(m.earthPct), m: unitTxt(m.longestBlackoutH) }), why, layer: st.layer, onLayer: layer => setState({ layer }),
    proof: [[t("proof.definition"), t("mc.defEarth")], [t("proof.step"), m.earthPct.detail.step], [t("proof.window"), `${m.earthPct.detail.start} · ${fmtNum(hours())} h`],
      [t("proof.source"), `${m.series.meta.provenance?.ephemeris || ""} · ${m.series.meta.provenance?.terrain || ""}`], [t("proof.sha"), m.earthPct.detail.sha256],
      [t("proof.status"), `${m.earthPct.status} · ${t("seal." + m.earthPct.seal)}`]] }).el;
}
function dailyEarth(m) {
  const out = [], i0 = Math.ceil((m.t0 - m.series.start) / H);
  for (let d = 0; d * DAY < hours(); d++) { let on = 0, n = 0; for (let h = d * DAY; h < Math.min(hours(), d * DAY + DAY); h++) { const i = i0 + h; if (i < 0 || i >= m.series.count) continue; n++; if (m.series.earthMargin[i] >= 0) on++; } out.push(n ? on / n : null); }
  return out;
}

function terrainCard(st, s, height, slope) {
  const ps = pgda ? pgdaAt(grid, pgda.sun, s.stereo_x_m, s.stereo_y_m) : null, pe = pgda ? pgdaAt(grid, pgda.earth, s.stereo_x_m, s.stereo_y_m) : null;
  const why = el("p", "mp-label", t("mc.terrain.why", { s: fmtVal(ps, fmtNum, nd(), 0, "%"), e: fmtVal(pe, fmtNum, nd(), 0, "%") }));
  // Two origins: height is PRE (LOLA), slope is EST (derived). The card shows the weaker one.
  return createLayerCard({ id: "card-terrain", title: t("mc.terrain"), status: slope.value == null ? height.status : slope.status,
    answer: t("mc.terrain.ans", { n: unitTxt(height), k: unitTxt(slope, 1) }), why, layer: st.layer, onLayer: layer => setState({ layer }),
    proof: [[t("mc.altitude"), `${unitTxt(height)} · ${height.source} · ${height.seal}`], [t("mc.slope"), `${unitTxt(slope, 1)} · ${t("mc.defSlope")} · ${slope.seal}`],
      [t("proof.source"), `${grid.h.source} · sha256 ${grid.h.sha256}`], ["PGDA", `${grid.h.layers.pgda_sun.product} · ${grid.h.layers.pgda_earth.product}`]] }).el;
}

let otherId = null;
async function numbersCard(s, m) {
  const others = doc.sites.filter(x => x.id !== s.id);
  if (!others.some(x => x.id === otherId)) otherId = others[0].id;
  const o = others.find(x => x.id === otherId), om = (await compute(o)).m;
  const c = el("article", "mp-card mc-numbers"); c.id = "card-numbers";
  const head = el("div", "mp-layer-head"); head.append(el("h3", null, t("mc.numbers", { site: s.name })));
  const sel = el("select"); sel.setAttribute("aria-label", t("mc.vs"));
  for (const x of others) sel.append(new Option(`${t("mc.vs")} ${x.n} · ${x.name}`, x.id, false, x.id === otherId));
  sel.onchange = () => { otherId = sel.value; draw(); }; sel.className = "mc-vs"; c.append(head, sel);
  const h = (x) => x.value == null ? null : x.value * hours() / 100;
  const both = w => w.raw.status === "COMPUTED" ? w.raw.bothPct * hours() / 100 : null;
  const table = (title, rows, lowerBetter) => {
    c.append(el("h4", "mp-label", title)); const tb = el("table", "mc-table");
    const hr = tb.createTHead().insertRow(); hr.append(el("th"), el("th", null, `${s.n}`), el("th", null, `${o.n}`));
    for (const [lab, a, b] of rows) { const tr = tb.insertRow(); tr.append(el("th", null, lab)); const ta = tr.insertCell(), tb2 = tr.insertCell();
      ta.textContent = fmtVal(a, fmtNum, nd()); tb2.textContent = fmtVal(b, fmtNum, nd());
      if (a != null && b != null && a !== b) { const worse = lowerBetter ? (a > b ? ta : tb2) : (a < b ? ta : tb2); worse.classList.add("is-worse"); worse.title = t("mc.worse"); } }
    c.append(tb);
  };
  table(t("mc.windows"), [[t("mc.sunVisible"), h(m.sunPct), h(om.sunPct)], [t("mc.earth"), h(m.earthPct), h(om.earthPct)], [t("mc.sunAndEarth"), both(m), both(om)]], false);
  table(t("mc.risks"), [[t("mc.shadow"), m.longestDarkH.value, om.longestDarkH.value], [t("mc.loss.long"), m.longestBlackoutH.value, om.longestBlackoutH.value]], true);
  const f = el("p", "mp-label"); f.append(sealEl(m.sunPct.seal), " " + (m.series.meta.provenance?.terrain || "") + " · " + (m.series.meta.provenance?.ephemeris || "")); c.append(f);
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
  const head = el("div", "mp-layer-head"); head.append(el("h3", null, t("mc.now")), sealEl(r.seal)); c.append(head);
  const big = el("p", "mp-num mc-now-big"); big.textContent = r.hours == null ? nd() : `${fmtNum(Math.floor(r.hours))} h ${String(Math.round((r.hours % 1) * 60)).padStart(2, "0")}`;
  c.append(big, el("p", null, r.hours == null ? (r.reason || t("mc.now.none")) : t("mc.now." + r.kind)), el("p", "mp-label", src));
  return c;
}

function dock(s) {
  const d = $("dock"), i = doc.sites.indexOf(s), n = doc.sites.length;
  const btn = (txt, label, fn, cls = "") => { const b = el("button", "mp-pill " + cls, txt); b.type = "button"; b.setAttribute("aria-label", label); b.onclick = fn; return b; };
  const hint = el("p", "mc-hint", t("mc.hint"));
  const sel = el("select", "mp-pill is-primary mc-sel"); sel.setAttribute("aria-label", t("ctx.site"));
  for (const x of doc.sites) sel.append(new Option(`${t("ctx.site")} ${x.n} · ${x.name}`, x.id, false, x.id === s.id));
  sel.onchange = () => setState({ site: sel.value });
  sel.onkeydown = e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setState({ site: doc.sites[(i + (e.key === "ArrowLeft" ? n - 1 : 1)) % n].id }); } };
  const row = el("div", "mc-dock-row");
  row.append(btn("‹", t("mc.prev"), () => setState({ site: doc.sites[(i + n - 1) % n].id })), sel, btn("›", t("mc.next"), () => setState({ site: doc.sites[(i + 1) % n].id })),
    btn("−", t("mc.zout"), () => { terrain.zoom(0.7); frame(); }), btn("+", t("mc.zin"), () => { terrain.zoom(1.4); frame(); }));
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
pgdaP.then(() => draw());
draw();
