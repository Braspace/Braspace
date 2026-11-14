// E · Cockpit — "Como está o módulo agora?". Light = stored hourly series (web/data, PRE); battery/autonomy/rules = API (SIM).
import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, windowMetrics, api, sealFor, apiOnline } from "../core/data.js";
import { createLayerCard, statCircle } from "../core/layers.js";
import { register, t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { TEXTS } from "./cockpit-texts.js";
import { FAULTS, H1_PROFILE, SPEEDS, HOUR_MS, applyFault, runScenario, nextChange, dailyFractions, autonomyHours, fmtDuration,
  clockLabel, hourIndex, evaluateRules, rulesMet, longestRun, countRises } from "./cockpit-model.js";

register(TEXTS);
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const shell = mountShell({ screen: "cockpit", context: null, onLang: () => draw() });
const doc = await loadSites();
if (!doc.sites.some(s => s.id === getState().site)) setState({ site: doc.sites[0].id });
const online = await apiOnline();
const terrain = await mountTerrain($("terrain"), { sites: doc.sites, selected: getState().site, onSelect: id => setState({ site: id }) });
const narrow = () => matchMedia("(max-width:700px)").matches;
const hoursOf = () => getState().hours || 14 * 24;

const S = { t: 0, playing: false, speed: SPEEDS[1], fault: null, run: null, light: null, siteKey: "", dismissed: null, sky: null, noSiteRoute: new Set() };

/** Frame the chosen site inside the free area of the map (centre on desktop, upper part above the sheet on mobile). */
function frame() {
  const site = doc.sites.find(s => s.id === getState().site); terrain.select(site.id);
  if (narrow()) { const v = terrain.view, H = innerHeight; v.cy = site.stereo_y_m - 0.2 * H * (v.span / Math.min(innerWidth, H)); terrain.redraw(); }
  placeBodies();
}
function markerCentre() {
  const b = document.querySelector(`.mp-marker[data-site="${CSS.escape(getState().site)}"]`); if (!b) return null;
  const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];
}
let bodies = null;
function placeBodies() {
  const c = markerCentre(); if (!c || !bodies) return;
  const k = narrow() ? 0.5 : 1; const sun = [c[0] - 150 * k, c[1] - 150 * k], earth = [c[0] + 150 * k, c[1] - 170 * k];
  for (const [b, p] of [["sun", sun], ["earth", earth]]) {
    Object.assign(bodies[b].ic.style, { left: p[0] + "px", top: p[1] + "px" });
    Object.assign(bodies[b].tag.style, { left: p[0] + "px", top: p[1] + 24 + "px" });
    bodies[b].line.setAttribute("x1", c[0]); bodies[b].line.setAttribute("y1", c[1]); bodies[b].line.setAttribute("x2", p[0]); bodies[b].line.setAttribute("y2", p[1]);
  }
}
function buildBodies() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "mp-ck-lines"); svg.setAttribute("aria-hidden", "true");
  bodies = {};
  for (const [b, col] of [["sun", "var(--sun)"], ["earth", "var(--earth)"]]) {
    const line = document.createElementNS(svg.namespaceURI, "line"); line.setAttribute("stroke", col); line.setAttribute("stroke-width", "2"); line.setAttribute("stroke-dasharray", "2 7"); line.setAttribute("stroke-linecap", "round"); svg.append(line);
    const ic = el("div", "mp-bodyic"); ic.dataset.body = b; const tag = el("div", "mp-ck-tag"); tag.dataset.body = b;
    document.body.append(ic, tag); bodies[b] = { line, ic, tag };
  }
  document.body.append(svg);
}
buildBodies();
addEventListener("resize", () => { frame(); });

async function compute() {
  const st = getState(), site = doc.sites.find(s => s.id === st.site), key = [st.site, st.start, hoursOf(), S.fault, st.battery].join("|");
  if (key === S.siteKey) return; S.siteKey = key;
  const m = await windowMetrics(doc, site, st.start, hoursOf());
  const series = m.series, i0 = Math.ceil((m.t0 - series.start) / HOUR_MS);
  const base = { power: { ...H1_PROFILE }, samples: [], delayH: 0 };
  const win = (off, n) => Array.from({ length: Math.max(0, Math.min(n, series.count - i0 - off)) }, (_, h) => ({ sun_visible: series.sunMargin[i0 + off + h] >= 0, earth_visible: series.earthMargin[i0 + off + h] >= 0 }));
  const f = applyFault(S.fault, { ...base, samples: win(0, hoursOf()) });
  const samples = win(f.delayH, hoursOf()).map(x => f.fault?.noEarth ? { ...x, earth_visible: false } : x);
  const power = { ...f.power, reserve_wh: f.power.battery_capacity_wh * st.battery / 100 };
  const startIso = new Date(m.t0 + f.delayH * HOUR_MS).toISOString();
  let run;
  if (!online) run = { ok: false, offline: true, route: "none" };
  else {
    const call = (p, o) => (p === "/api/onboard/site-evaluate" && S.noSiteRoute.has(st.site)) ? Promise.resolve({ ok: false, error: "cached DATA_NOT_AVAILABLE" }) : api(p, o);
    run = await runScenario(call, { siteId: st.site, startIso: new Date(m.t0).toISOString(), hours: hoursOf(), power, maxBlackoutH: Math.min(st.blackout, hoursOf()), samples, delayH: f.delayH });
    if (run.route === "eval") S.noSiteRoute.add(st.site);
    if (run.route === "site") run.samples = null;
  }
  S.light = { m, i0, samples, power, f, startIso, series,
    longestDarkH: samples.length ? longestRun(samples, "sun_visible", false) : null,
    longestBlackoutH: samples.length ? longestRun(samples, "earth_visible", false) : null, sunrises: samples.length ? countRises(samples) : null };
  S.run = run; S.t = Math.min(S.t, hoursOf());
}

async function skyTransition(site, atIso) {
  const k = site.id + atIso; if (S.sky?.k === k) return S.sky.v;
  const r = await api(`/api/sites/${encodeURIComponent(site.id)}/sky?start=${encodeURIComponent(atIso)}&hours=240`, { timeoutMs: 3000 });
  const v = r.ok ? r.data.next_transitions : null; S.sky = { k, v }; return v;
}

const rulesCard = el("article", "mp-card"), alertCard = el("article", "mp-card mp-alert"), faultCard = el("article", "mp-card");
const left = $("left"), right = $("right");
const sheet = $("sheet");

async function draw() {
  await compute();
  const th = hourIndex(S.t, hoursOf()); // series and API trace are hourly: read them at a whole hour, keep S.t continuous
  const st = getState(), site = doc.sites.find(s => s.id === st.site), L = S.light, run = S.run, series = L.series, H = hoursOf();
  const i = L.i0 + th, trace = run?.ok ? run.trace : null, cap = L.power.battery_capacity_wh;
  const charge = trace ? trace[Math.min(th, trace.length - 1)] : null;
  const floorWh = cap * st.battery / 100;
  const sunNext = nextChange(series.sunMargin, i, series.count), earthNext = nextChange(series.earthMargin, i, series.count);
  const dur = x => x?.lastsHours;
  const nightH = sunNext?.visible ? sunNext.lastsHours : sunNext?.inHours; // next night length (or what is left of the current one)
  const auto = autonomyHours(charge, floorWh, L.power.load_w);
  const margin = auto != null && nightH != null ? auto - nightH : null;
  const hh = (v, d = 0, sign = false) => v == null ? t("nd") : (sign && v > 0 ? "+" : "") + fmtNum(v, d) + "h";
  const clock = clockLabel(L.m.t0 + L.f.delayH * HOUR_MS, th);
  const seal = "SIM";

  shell.setContext({ site: t("cockpit.simulated_operation", { site: `${site.n} · ${site.name}` }),
    date: `${t("cockpit.day_time", { n: clock.day, h: clock.hhmm })} UTC`, days: fmtNum(H / 24), seal, online, action: { label: t("cockpit.onboard"), href: "../onboard/" } });
  const ctxEl = document.querySelector(".mp-context");
  if (ctxEl) { const chip = el("span", "mp-sim-chip", t("cockpit.sim_label")); ctxEl.append(el("span", "mp-label", t("cockpit.profile")), chip); }

  const title = el("p", "mp-ck-title", t("cockpit.how_now"));
  const stat = statCircle({ value: charge == null ? t("nd") : fmtNum(100 * charge / cap) + "%", label: t("cockpit.battery"), seal: charge == null ? "N/D" : seal,
    satellites: [{ value: hh(nightH), label: t("cockpit.next_night") }, { value: hh(auto), label: t("cockpit.endurance") },
      { value: fmtNum(st.battery) + "%", label: t("cockpit.floor") }, { value: hh(margin, 0, true), label: t("cockpit.margin") }] });
  const vis = (body, nx, elev) => { const d = el("div", "mp-vis"); d.dataset.body = body; d.dataset.vis = nx?.visible ? "yes" : "no";
    const lab = el("span"); lab.append(el("span", "dot"), t(body === "sun" ? "cockpit.sun_visible" : "cockpit.earth_visible"));
    const val = el("b", null, elev == null ? t("nd") : t(nx?.visible ? "cockpit.yes_angle" : "cockpit.sun_no", { n: fmtNum(elev, 1) })); d.append(lab, val); return d; };
  const sunEl = Number.isFinite(series.s.sunEl[i]) ? series.s.sunEl[i] : null, earthEl = Number.isFinite(series.s.earthEl[i]) ? series.s.earthEl[i] : null;
  const earthSeen = L.f.fault?.noEarth ? { ...earthNext, visible: false } : earthNext;
  const visrow = el("div", "mp-visrow"); visrow.append(vis("sun", sunNext, sunEl), vis("earth", earthSeen, earthEl));

  const days = dailyFractions(series.sunMargin, L.i0, H), today = Math.floor(th / 24);
  const chart = el("div"); const bars = el("div", "mp-days"); bars.setAttribute("role", "img"); bars.setAttribute("aria-label", t("cockpit.sun_hours_day"));
  days.forEach((f, d) => { const b = el("i"); if (f == null) b.dataset.nd = "1"; else b.style.setProperty("--f", Math.round(f * 100) + "%"); if (d === today) b.dataset.today = "1"; bars.append(b); });
  const axis = el("div", "mp-axis"); axis.append(el("span", null, "D0"), Object.assign(el("em"), { textContent: t("cockpit.today") }), el("span", null, "D" + (days.length - 1)));
  const nextLine = el("p", "mp-label"); nextLine.textContent = nightH == null ? t("nd") : t("cockpit.next_night_line", { t: sunNext.visible ? fmtDuration(sunNext.inHours) : t("nd"), n: fmtNum(nightH) });
  chart.append(bars, axis, nextLine);
  const rows = (...a) => a.map(([k, v]) => [k, v ?? t("nd")]);
  const code = v => Object.assign(el("code", "mp-coord"), { textContent: v ?? t("nd") });
  const route = run?.ok ? t(run.route === "site" ? "cockpit.route.site" : "cockpit.route.eval") : t("cockpit.route.none");
  const card = createLayerCard({ id: "card-sun-days", title: t("cockpit.sun_hours_day"), status: L.m.sunPct.status, answer: chart,
    why: el("p", "mp-label", t("cockpit.sunsets_why") + " " + t("cockpit.nextnight_why")), layer: st.layer, onLayer: layer => setState({ layer }),
    proof: rows([t("proof.source"), `${L.m.sunPct.source}`], [t("proof.sha"), code(L.m.sunPct.detail.sha256)], [t("proof.window"), `${L.m.sunPct.detail.start} · ${fmtNum(H)} h`],
      [t("proof.status"), `${L.m.sunPct.status} · ${t("seal." + L.m.sunPct.seal)}`], [t("cockpit.route"), route],
      [t("cockpit.inputs"), `${t("cockpit.in.capacity")} ${fmtNum(L.power.battery_capacity_wh)} Wh · ${t("cockpit.in.initial")} ${fmtNum(L.power.initial_charge_wh)} Wh · ${t("cockpit.in.solar")} ${fmtNum(L.power.solar_generation_w)} W · ${t("cockpit.in.load")} ${fmtNum(L.power.load_w)} W · ${t("cockpit.in.floor")} ${fmtNum(st.battery)}%`],
      [t("cockpit.fault_on", { p: "" }), L.f.fault ? `${t(L.f.fault.key, { n: L.f.fault.n })} (${t("seal.SIM")})` : t("nd")],
      [t("proof.status") + " API", run?.ok ? `${run.status} · ${t("seal." + sealFor(run.status))}` : t("cockpit.route.none")], ["inputs_sha256", code(run?.sha)],
      [t("cockpit.derived"), trace ? "charge_wh" : t("nd")]) });
  left.replaceChildren(title, stat, visrow, card.el);

  // rules
  const list = evaluateRules({ rules: { night: st.night, blackout: st.blackout, battery: st.battery }, lightStatus: doc.status, trace, capacityWh: run?.ok ? cap : null, light: L });
  const met = rulesMet(list); const rh = el("div", "mp-head"); rh.append(el("h3", null, t("cockpit.rules")), el("span", "mp-count", t("cockpit.rules_met", { n: met.ok, m: met.of })));
  const lim = { floor: st.battery, night: st.night, blackout: st.blackout, days: 5, sunrises: 2 };
  rulesCard.replaceChildren(rh, ...list.map(r => { const row = el("div", "mp-rule"); row.dataset.status = r.status; row.dataset.rule = r.id;
    const txt = el("span"); txt.append(t("cockpit.rule." + r.id, { n: lim[r.id] ?? "" }));
    if (r.id !== "cold") txt.append(Object.assign(el("small"), { textContent: `${t("cockpit.assumed")} · ${r.seal}` }));
    else txt.append(Object.assign(el("small"), { textContent: t("cockpit.cold_nd") }));
    const sealS = r.status === "nodata" ? ` · N/D` : "";
    row.append(txt, el("span", "st", t(r.status === "pass" ? "cockpit.pass" : r.status === "risk" ? "cockpit.risk" : "cockpit.nodata") + (r.status === "nodata" ? "" : "")));
    return row; }), Object.assign(el("a", "mp-link", t("cockpit.where_rules")), { href: hrefTo("evidence.html") }));

  // alert: next sunset from the API's next_transitions when it has the site's series, else from the stored series
  const at = new Date(L.m.t0 + L.f.delayH * HOUR_MS + th * HOUR_MS).toISOString();
  let apiTr = online ? await skyTransition(site, at) : null;
  const apiSun = apiTr?.sun || null;
  const fromApi = !!apiSun && Number.isFinite(apiSun.hours_from_start);
  const inH = fromApi ? apiSun.hours_from_start : sunNext?.inHours, setting = fromApi ? apiSun.kind === "sunset" : sunNext?.visible;
  const key = `${site.id}|${setting}|${Math.round((i + (inH ?? 0)))}`;
  alertCard.hidden = inH == null || S.dismissed === key;
  if (!alertCard.hidden) {
    const h3 = el("h3", null, t(setting ? "cockpit.sunset_in" : "cockpit.alert_title_rise", { t: fmtDuration(inH) }));
    const nn = nightH; const tip = nn == null ? null : el("p", null, t(setting ? "cockpit.sunset_tip" : "cockpit.alert_tip_rise", { n: fmtNum(nn) }));
    const src = el("p", "mp-label", t(fromApi ? "cockpit.alert_src_api" : "cockpit.alert_src_series"));
    const ok = el("button", "mp-pill is-white", t("cockpit.got_it")); ok.type = "button"; ok.onclick = () => { S.dismissed = key; draw(); };
    alertCard.replaceChildren(h3, ...(tip ? [tip] : []), src, ok);
  }
  // faults
  const fh = el("div", "mp-head"); fh.append(el("h3", null, t("cockpit.test_problem")), sealSpan("SIM"));
  const fb = el("div", "mp-faults");
  for (const f of Object.values(FAULTS)) { const b = el("button", "mp-pill", t(f.key, { n: f.n })); b.type = "button"; b.dataset.fault = f.id; b.setAttribute("aria-pressed", String(S.fault === f.id));
    b.onclick = () => { S.fault = S.fault === f.id ? null : f.id; draw(); }; fb.append(b); }
  const note = el("p", "mp-ck-note", run?.ok ? "" : t(run?.offline ? "cockpit.offline" : "cockpit.route.none"));
  faultCard.replaceChildren(fh, fb, note);
  right.replaceChildren(rulesCard, alertCard, faultCard);

  // map tags
  const tagSun = sunNext?.inHours != null ? t(sunNext.visible ? "cockpit.sun_sets_in" : "cockpit.sun_rises_in", { t: fmtDuration(sunNext.inHours) }) : t("nd");
  const tagEarth = L.f.fault?.noEarth ? t("cockpit.problem_no_antenna") : earthNext?.inHours != null ? t(earthNext.visible ? "cockpit.earth_gone_in" : "cockpit.earth_back_in", { t: fmtDuration(earthNext.inHours) }) : t("nd");
  bodies.sun.tag.textContent = tagSun; bodies.earth.tag.textContent = tagEarth; placeBodies();
  // player
  const rg = $("range"); rg.max = String(H); rg.value = String(th); rg.setAttribute("aria-valuetext", clock.text);
  $("time").textContent = clock.text; $("end").textContent = "D" + fmtNum(H / 24);
  $("play").textContent = S.playing ? "⏸" : "▶"; $("play").setAttribute("aria-label", t(S.playing ? "cockpit.pause" : "cockpit.play"));
  $("restart").setAttribute("aria-label", t("cockpit.restart")); $("speed").setAttribute("aria-label", t("cockpit.speed")); rg.setAttribute("aria-label", t("cockpit.time"));
  $("onboard").textContent = t("cockpit.onboard"); $("onboard").href = "../onboard/";
  $("handle").setAttribute("aria-label", t("cockpit.sheet"));
}
function sealSpan(s) { const e = el("span", "mp-seal", s); e.dataset.seal = s; e.title = t("seal." + s); return e; }

// player
const rg = $("range"), sp = $("speed");
for (const v of SPEEDS) sp.append(new Option(`${v} h/s`, String(v), false, v === S.speed));
sp.onchange = () => { S.speed = Number(sp.value); };
let timer = null;
function setPlaying(p) { S.playing = p; clearInterval(timer); if (p) timer = setInterval(() => { if (S.t >= hoursOf()) { setPlaying(false); return; } S.t = Math.min(hoursOf(), S.t + S.speed / 10); lightDraw(); }, 100); draw(); }
let busy = false; async function lightDraw() { if (busy) return; busy = true; try { await draw(); } finally { busy = false; } }
$("play").onclick = () => setPlaying(!S.playing);
$("restart").onclick = () => { S.t = 0; setPlaying(false); };
rg.oninput = () => { S.t = Number(rg.value); lightDraw(); };
$("player").addEventListener("keydown", e => { if (e.key === " " && e.target === rg) { e.preventDefault(); setPlaying(!S.playing); } });
// bottom sheet (mobile): drag the handle
{ const h = $("handle"); let y0 = null, h0 = 0;
  h.addEventListener("pointerdown", e => { y0 = e.clientY; h0 = sheet.getBoundingClientRect().height; h.setPointerCapture(e.pointerId); });
  h.addEventListener("pointermove", e => { if (y0 == null) return; sheet.style.setProperty("--sheet-h", Math.max(96, Math.min(innerHeight * 0.78, h0 + (y0 - e.clientY))) + "px"); });
  h.addEventListener("pointerup", () => { y0 = null; });
  h.addEventListener("keydown", e => { const cur = sheet.getBoundingClientRect().height; if (e.key === "ArrowUp") sheet.style.setProperty("--sheet-h", Math.min(innerHeight * 0.78, cur + 40) + "px"); if (e.key === "ArrowDown") sheet.style.setProperty("--sheet-h", Math.max(96, cur - 40) + "px"); }); }
let last = getState().site;
onState(s => { if (s.site !== last) { last = s.site; S.t = 0; S.dismissed = null; frame(); } draw(); });
frame(); await draw(); frame();
globalThis.__cockpit = S;
