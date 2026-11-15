// C · Comparar. Up to 3 scenarios (site + start + duration), a verdict computed from the declared rules,
// a Sun/Earth-per-day chart and a differences table. Numbers come from POST /api/compare when the API has the
// series, otherwise from the stored hourly series with the same definition (see scenario-data.js).
import { mountSheet } from "./sheet.js";
import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, sealFor } from "../core/data.js";
import { createLayerCard, sealEl, barEl } from "../core/layers.js";
import { register, t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { judge, slack, verdictOf, dailyFractions, parseHash, buildHash } from "./scenario-calc.js";
import { loadAll, staticMetrics, flagsOf, apiCompareMetrics, HOUR_MS } from "./scenario-data.js";

register({
  en: {
    "cmp.ctx": "{n} scenarios · {s} sites", "cmp.dates": "{n} dates", "cmp.q": "Which scenario is best?",
    "cmp.v.single": "{L} is the only one that meets every rule.", "cmp.v.multi": "{L} meets every rule and has the most Sun and Earth together.",
    "cmp.v.none": "No scenario meets every rule.", "cmp.v.nodata": "Not enough data to compare.",
    "cmp.why.night": "{L}: longest night {v} h, above the assumed limit of {lim} h.",
    "cmp.why.blackout": "{L}: {v} h without Earth, above the assumed limit of {lim} h.",
    "cmp.why.nd": "{L}: no data for this window.", "cmp.why.ok": "{L} meets every rule.",
    "cmp.delay": "What if {L} is delayed?", "cmp.land": "Land", "cmp.pass": "Meets every rule", "cmp.fail.night": "Fail: long night",
    "cmp.fail.blackout": "Fail: no Earth", "cmp.nd": "No data",
    "cmp.chart": "Sun and Earth per day · {L}", "cmp.sun": "Sun", "cmp.earth": "Earth",
    "cmp.diff": "Differences", "cmp.full": "Full table", "cmp.power": "Power", "cmp.contact": "Contact",
    "cmp.rule.night": "rule: night ≤ {n} h", "cmp.rule.blackout": "rule: loss ≤ {n} h", "cmp.assumed": "assumed limit",
    "cmp.row.sun": "Sun visible", "cmp.row.night": "Longest night", "cmp.row.slack": "Margin to the rule", "cmp.row.battery": "Battery margin",
    "cmp.row.earth": "Earth visible", "cmp.row.loss": "Longest Earth loss", "cmp.row.both": "Sun and Earth together",
    "cmp.rocks": "Rocks smaller than 20 m are not in the data.", "cmp.scenario": "Scenario {L}", "cmp.add": "Add scenario",
    "cmp.edit": "Edit scenarios", "cmp.rules": "Rules (assumed limits)", "cmp.rule.night.l": "Longest night, h", "cmp.rule.blackout.l": "Earth loss, h",
    "cmp.site": "Site", "cmp.start": "Start (UTC)", "cmp.hours": "Hours", "cmp.remove": "Remove",
    "cmp.src.api": "POST /api/compare", "cmp.src.static": "stored hourly series (web/data)", "cmp.src": "Source", "cmp.def": "Definition",
    "cmp.def.txt": "Centre of the Sun or Earth above the local terrain horizon, hourly; night = longest run without Sun; Earth loss = longest run without Earth.",
    "cmp.outside": "Window outside the computed series.", "cmp.prev": "previous scenario", "cmp.next": "next scenario",
    "cmp.battery.nd": "needs the onboard API", "cmp.state": "State", "cmp.sha": "Series SHA-256",
  },
  "pt-BR": {
    "cmp.ctx": "{n} cenários · {s} locais", "cmp.dates": "{n} datas", "cmp.q": "Qual cenário é melhor?",
    "cmp.v.single": "{L} é o único que atende a todas as regras.", "cmp.v.multi": "{L} atende a todas as regras e tem mais Sol e Terra juntos.",
    "cmp.v.none": "Nenhum cenário atende a todas as regras.", "cmp.v.nodata": "Sem dados para comparar.",
    "cmp.why.night": "{L}: noite mais longa de {v} h, acima do limite assumido de {lim} h.",
    "cmp.why.blackout": "{L}: {v} h sem Terra, acima do limite assumido de {lim} h.",
    "cmp.why.nd": "{L}: sem dado nesta janela.", "cmp.why.ok": "{L} atende a todas as regras.",
    "cmp.delay": "E se {L} atrasar?", "cmp.land": "Pousar", "cmp.pass": "Atende a tudo", "cmp.fail.night": "Falha: noite longa",
    "cmp.fail.blackout": "Falha: sem Terra", "cmp.nd": "Sem dado",
    "cmp.chart": "Sol e Terra por dia · {L}", "cmp.sun": "Sol", "cmp.earth": "Terra",
    "cmp.diff": "Diferenças", "cmp.full": "Tabela completa", "cmp.power": "Energia", "cmp.contact": "Contato",
    "cmp.rule.night": "regra: noite ≤ {n} h", "cmp.rule.blackout": "regra: perda ≤ {n} h", "cmp.assumed": "limite assumido",
    "cmp.row.sun": "Sol visível", "cmp.row.night": "Maior noite", "cmp.row.slack": "Folga até a regra", "cmp.row.battery": "Folga da bateria",
    "cmp.row.earth": "Terra visível", "cmp.row.loss": "Maior perda da Terra", "cmp.row.both": "Sol e Terra juntos",
    "cmp.rocks": "Pedras menores que 20 m não aparecem nos dados.", "cmp.scenario": "Cenário {L}", "cmp.add": "Adicionar cenário",
    "cmp.edit": "Editar cenários", "cmp.rules": "Regras (limites assumidos)", "cmp.rule.night.l": "Maior noite, h", "cmp.rule.blackout.l": "Perda da Terra, h",
    "cmp.site": "Local", "cmp.start": "Início (UTC)", "cmp.hours": "Horas", "cmp.remove": "Remover",
    "cmp.src.api": "POST /api/compare", "cmp.src.static": "série horária gravada (web/data)", "cmp.src": "Fonte", "cmp.def": "Definição",
    "cmp.def.txt": "Centro do Sol ou da Terra acima do horizonte local do relevo, hora a hora; noite = maior trecho sem Sol; perda da Terra = maior trecho sem Terra.",
    "cmp.outside": "Janela fora da série calculada.", "cmp.prev": "cenário anterior", "cmp.next": "próximo cenário",
    "cmp.battery.nd": "exige a API de bordo", "cmp.state": "Estado", "cmp.sha": "SHA-256 da série",
  },
});

const LETTERS = ["A", "B", "C"];
const DAY = 24, MAXSC = 3;
const shell = mountShell({ screen: "compare", context: null, onLang: () => draw() });
mountSheet(document.getElementById("sheet"));
const doc = await loadSites();
const all = await loadAll(doc);
let drawGeneration = 0;
const siteOf = id => doc.sites.find(s => s.id === id);
const hoursDefault = () => getState().hours || 14 * DAY;
const t0Default = () => getState().start || doc.window.start_utc;

/** Scenarios from the URL hash; defaults derive from the data (first site, second site, second site two windows later). */
function scenarios() {
  const h = parseHash(location.hash).sc.filter(s => siteOf(s.site));
  if (h.length) return h.map(s => ({ site: s.site, start: s.start || t0Default(), hours: s.hours || hoursDefault() }));
  const ids = doc.sites.map(s => s.id), hrs = hoursDefault(), a = t0Default();
  const later = new Date(Date.parse(a) + 2 * hrs * HOUR_MS).toISOString();
  const second = ids[1] || ids[0];
  return [{ site: ids[0], start: a, hours: hrs }, { site: second, start: a, hours: hrs }, { site: second, start: later, hours: hrs }].slice(0, Math.min(MAXSC, 3));
}
let sel = 0;
const save = list => { history.replaceState(null, "", location.search + "#" + buildHash({ sc: list })); draw(); };

async function metricsFor(sc) {
  const startMs = Date.parse(sc.start);
  const r = await apiCompareMetrics(sc.site, new Date(startMs).toISOString(), sc.hours);
  return { online: r.online, metrics: r.metrics || staticMetrics(all.get(sc.site), startMs, sc.hours, doc.status, sc.site) };
}
const fmtDate = ms => new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(ms);
const hv = x => (x == null ? t("nd") : fmtNum(x, 0) + "\u00a0h");
const pv = x => (x == null ? t("nd") : fmtNum(x, 0) + "%");

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function ndSeal() { return sealEl("N/D"); }

async function draw() {
  const generation = ++drawGeneration;
  const list = scenarios(); if (sel >= list.length) sel = 0;
  const st = getState(), rules = { night: st.night, blackout: st.blackout };
  const loaded = await Promise.all(list.map(metricsFor));
  if (generation !== drawGeneration) return;
  const ms = loaded.map(x => x.metrics), online = loaded.some(x => x.online);
  const judged = ms.map(m => judge(m, rules));
  const verdict = verdictOf(judged, ms.map(m => m?.bothPct ?? null));
  const L = i => LETTERS[i];
  const cur = ms[sel];
  const sealCtx = cur ? cur.seal : "N/D";
  const dates = new Set(list.map(s => s.start)).size, sites = new Set(list.map(s => s.site)).size;
  shell.setContext({ site: t("cmp.ctx", { n: list.length, s: sites }), date: t("cmp.dates", { n: dates }), days: fmtNum(list[sel].hours / DAY),
    seal: sealCtx, online, action: { label: t("cmp.delay", { L: L(sel) }), href: recoverHref(list) } });

  // verdict (layer card): answer = sentence, why = reasons, proof = rules + sources
  const reasons = el("div");
  list.forEach((_, i) => {
    const j = judged[i];
    if (j.status === "nd") reasons.append(el("p", "mp-label", t("cmp.why.nd", { L: L(i) })));
    else if (j.status === "pass") reasons.append(el("p", "mp-label", t("cmp.why.ok", { L: L(i) })));
    else for (const r of j.reasons) reasons.append(el("p", "mp-label", t("cmp.why." + r.key, { L: L(i), v: fmtNum(r.value, 0), lim: fmtNum(r.limit, 0) })));
  });
  const answer = verdict.kind === "single" ? t("cmp.v.single", { L: L(verdict.winners[0]) })
    : verdict.kind === "multi" ? t("cmp.v.multi", { L: L(verdict.best) }) : verdict.kind === "none" ? t("cmp.v.none") : t("cmp.v.nodata");
  const seals = [...new Set(ms.filter(Boolean).map(m => m.seal))];
  const proof = el("div");
  proof.append(proofTable(list, ms, rules), editor(list, rules));
  const card = createLayerCard({ id: "verdict", title: t("cmp.q"), status: statusOf(ms), answer, why: reasons, proof, layer: st.layer, onLayer: layer => setState({ layer }) });
  const actions = el("div", "mp-actions");
  const go = el("a", "mp-pill is-primary", t("cmp.delay", { L: L(sel) })); go.href = recoverHref(list);
  const land = el("a", "mp-pill is-sim", t("cmp.land")); land.href = hrefTo("landing.html", { ...getState(), site: list[sel].site, start: list[sel].start, hours: list[sel].hours }); // AUD-01: the chosen scenario, not the global one
  actions.append(go, land); card.el.insertBefore(actions, card.el.querySelector(".mp-chips"));

  // scenario list
  const ul = el("div", "mp-scn-list"); ul.setAttribute("role", "radiogroup"); ul.setAttribute("aria-label", t("cmp.q"));
  list.forEach((sc, i) => {
    const b = el("button", "mp-scn"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(i === sel)); b.tabIndex = i === sel ? 0 : -1;
    const name = el("span", "mp-scn-name"); name.append(`${siteOf(sc.site).name}`, Object.assign(el("small"), { textContent: `${siteOf(sc.site).n} · ${fmtDate(Date.parse(sc.start))}` }));
    b.append(el("span", "mp-scn-letter", L(i)), name, badge(judged[i]));
    b.onclick = () => { sel = i; draw(); };
    b.onkeydown = e => { const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); sel = (i + d + list.length) % list.length; draw().then(() => ul.querySelector('[aria-checked="true"]')?.focus()); } };
    ul.append(b);
  });

  // chart for selected scenario
  const chart = el("section", "mp-card mp-cmp-time"); chart.append(el("h3", "", t("cmp.chart", { L: L(sel) })));
  const fl = flagsOf(all.get(list[sel].site), Date.parse(list[sel].start), list[sel].hours);
  const sunD = dailyFractions(fl.sun.map(v => v)), earthD = dailyFractions(fl.earth.map(v => v));
  const wrap = el("div", "mp-day-chart");
  const leg = el("div", "mp-legend"); for (const [k, key] of [["sun", "cmp.sun"], ["earth", "cmp.earth"]]) { const sp = el("span"); sp.append(el("i", "sw " + k), t(key)); leg.append(sp); }
  const eb = barEl(earthD, "var(--earth)"); eb.classList.add("is-mirror");
  const ax = el("div", "mp-axis"); ax.append(el("span", "", "D0"), el("span", "", "D" + Math.ceil((sunD.length - 1) / 2)), el("span", "", "D" + (sunD.length - 1)));
  wrap.append(leg, barEl(sunD, "var(--sun)"), eb, ax); chart.append(wrap);

  document.getElementById("left").replaceChildren(card.el, ul, chart);
  document.getElementById("right").replaceChildren(diffCard(list, ms, judged, rules));
  drawDock(list); terrain && terrain.select(list[sel].site); markRoute(list);
}
function statusOf(ms) { const m = ms.find(Boolean); return m ? m.status : "NO_SERIES_DATA"; }
function recoverHref(list) { return hrefTo("recover.html") + "#" + buildHash({ sc: [list[sel]] }); }
function badge(j) {
  const b = el("span", "mp-badge");
  if (j.status === "nd") { b.classList.add("is-nd"); b.textContent = t("cmp.nd"); }
  else if (j.status === "pass") b.textContent = t("cmp.pass");
  else { b.classList.add("is-fail"); b.textContent = t("cmp.fail." + j.reasons[0].key); }
  return b;
}
function diffCard(list, ms, judged, rules) {
  const c = el("section", "mp-card"); const head = el("div", "mp-foot"); head.style.justifyContent = "space-between"; head.style.marginTop = "0";
  head.append(el("h3", "", t("cmp.diff")));
  const full = el("button", "mp-chipg", t("cmp.full")); full.type = "button"; full.onclick = () => setState({ layer: "proof" }); head.append(full);
  const tb = el("table", "mp-diff"); const th = tb.createTHead().insertRow(); th.append(el("th"));
  list.forEach((_, i) => { const h = el("th", "", LETTERS[i]); h.scope = "col"; if (i === sel) h.setAttribute("aria-current", "true"); th.append(h); });
  const body = tb.createTBody();
  const group = (label, rule) => { const r = body.insertRow(); r.className = "grp"; const h = el("th"); h.colSpan = list.length + 1; h.append(label); h.append(Object.assign(el("small"), { textContent: "• " + rule })); r.append(h); };
  const best = (vals, lower) => { const f = vals.filter(v => v != null); if (!f.length) return null; return lower ? Math.min(...f) : Math.max(...f); };
  const row = (label, get, { lower = false, failIf = null, fmt = hv } = {}) => {
    const r = body.insertRow(); const h = el("th", "", label); h.scope = "row"; r.append(h);
    const vals = ms.map(m => (m ? get(m) : null)), b = best(vals, lower);
    vals.forEach(v => { const td = r.insertCell(); td.textContent = fmt(v); if (v == null) return; if (failIf && failIf(v)) td.className = "is-fail"; else if (v === b && vals.filter(x => x === b).length < vals.length) td.className = "is-best"; });
  };
  group(t("cmp.power"), t("cmp.rule.night", { n: fmtNum(rules.night) }) + " (" + t("cmp.assumed") + ")");
  row(t("cmp.row.sun"), m => m.sunPct, { fmt: pv });
  row(t("cmp.row.night"), m => m.dark, { lower: true, failIf: v => v > rules.night });
  const sl = ms.map(m => slack(m, rules));
  { const r = body.insertRow(); const h = el("th", "", t("cmp.row.slack")); h.scope = "row"; r.append(h); const b = best(sl, false);
    sl.forEach(v => { const td = r.insertCell(); td.textContent = v == null ? t("nd") : (v > 0 ? "+" : "") + hv(v); if (v != null) { if (v < 0) td.className = "is-fail"; else if (v === b && sl.filter(x => x === b).length < sl.length) td.className = "is-best"; } }); }
  { const r = body.insertRow(); const h = el("th", "", t("cmp.row.battery")); h.scope = "row"; r.append(h); ms.forEach(() => { const td = r.insertCell(); td.append(t("nd")); td.title = t("cmp.battery.nd"); }); }
  group(t("cmp.contact"), t("cmp.rule.blackout", { n: fmtNum(rules.blackout) }) + " (" + t("cmp.assumed") + ")");
  row(t("cmp.row.earth"), m => m.earthPct, { fmt: pv });
  row(t("cmp.row.loss"), m => m.blackout, { lower: true, failIf: v => v > rules.blackout });
  row(t("cmp.row.both"), m => m.bothPct, { fmt: pv });
  const foot = el("div", "mp-foot"); foot.append(ndSeal(), el("span", "mp-label", t("cmp.rocks")));
  c.append(head, tb, foot); return c;
}
function proofTable(list, ms, rules) {
  const tb = el("table", "mp-proof");
  const add = (k, v) => { const r = tb.insertRow(); const h = el("th", "", k); h.scope = "row"; r.append(h); r.insertCell().append(v); };
  add(t("cmp.def"), t("cmp.def.txt"));
  list.forEach((sc, i) => { const m = ms[i]; const v = el("span");
    if (!m) v.append(t("cmp.outside"), " ", ndSeal());
    else { v.append((m.origin === "api" ? t("cmp.src.api") : t("cmp.src.static")) + " · ", sealEl(m.seal), ` ${m.status || ""}`);
      if (m.sha) v.append(el("br"), Object.assign(el("code", "mp-coord"), { textContent: m.sha })); }
    add(`${LETTERS[i]} · ${t("cmp.src")}`, v); });
  add(t("cmp.rules"), t("cmp.assumed") + `: ${fmtNum(rules.night)} h · ${fmtNum(rules.blackout)} h`);
  return tb;
}
function editor(list, rules) {
  const f = el("div", "mp-edit");
  list.forEach((sc, i) => {
    const r = el("div", "mp-edit-row"); r.append(el("b", "", LETTERS[i]));
    const s = el("select"); s.setAttribute("aria-label", t("cmp.site")); for (const x of doc.sites) s.append(new Option(`${x.n} · ${x.name}`, x.id, false, x.id === sc.site));
    const d = el("input"); d.type = "date"; d.value = sc.start.slice(0, 10); d.setAttribute("aria-label", t("cmp.start"));
    const h = el("input"); h.type = "number"; h.min = String(DAY); h.step = String(DAY); h.value = String(sc.hours); h.setAttribute("aria-label", t("cmp.hours"));
    const upd = () => { const nl = list.map(x => ({ ...x })); const dv = d.value ? d.value + "T00:00:00Z" : sc.start; nl[i] = { site: s.value, start: dv, hours: Math.max(DAY, Number(h.value) || sc.hours) }; save(nl); };
    s.onchange = d.onchange = h.onchange = upd; r.append(s, d, h);
    if (list.length > 1) { const x = el("button", "mp-pill", t("cmp.remove")); x.type = "button"; x.onclick = () => save(list.filter((_, k) => k !== i)); r.append(x); }
    f.append(r);
  });
  if (list.length < MAXSC) { const a = el("button", "mp-pill", "+ " + t("cmp.add")); a.type = "button"; a.onclick = () => save([...list, { ...list[list.length - 1] }]); f.append(a); }
  const rr = el("div", "mp-edit-row");
  for (const key of ["night", "blackout"]) { const lab = el("label", "mp-label", t("cmp.rule." + key + ".l") + " "); const inp = el("input"); inp.type = "number"; inp.min = "1"; inp.value = String(rules[key]);
    inp.onchange = () => { const v = Number(inp.value); if (v > 0) setState({ [key]: v }); }; lab.append(inp); rr.append(lab); }
  f.append(rr); return f;
}
function drawDock(list) {
  const dock = document.getElementById("dock");
  const b = (txt, aria, fn) => { const x = el("button", "mp-pill", txt); x.type = "button"; x.setAttribute("aria-label", aria); x.onclick = fn; return x; };
  const s = el("select", "mp-pill is-primary"); s.setAttribute("aria-label", t("cmp.scenario", { L: "" }));
  list.forEach((_, i) => s.append(new Option(t("cmp.scenario", { L: LETTERS[i] }), String(i), false, i === sel))); s.onchange = () => { sel = Number(s.value); draw(); };
  dock.replaceChildren(b("‹", t("cmp.prev"), () => { sel = (sel + list.length - 1) % list.length; draw(); }),
    b("›", t("cmp.next"), () => { sel = (sel + 1) % list.length; draw(); }), s,
    b("+", t("cmp.add"), () => { if (list.length < MAXSC) save([...list, { ...list[sel] }]); }));
}
function markRoute() {
  const list = scenarios(); const order = [...new Set(list.map(s => s.site))];
  document.querySelectorAll(".mp-marker").forEach(m => { const idx = list.findIndex(s => s.site === m.dataset.site); m.hidden = idx < 0; if (idx >= 0) { const letters = list.map((s, i) => s.site === m.dataset.site ? LETTERS[i] : null).filter(Boolean).join("/"); m.firstChild.textContent = letters; } });
}
let terrain = null;
terrain = await mountTerrain(document.getElementById("terrain"), { sites: doc.sites, selected: scenarios()[0].site,
  route: [...new Set(scenarios().map(s => s.site))], onSelect: id => { const i = scenarios().findIndex(s => s.site === id); if (i >= 0) { sel = i; draw(); } } });
new MutationObserver(() => markRoute()).observe(document.getElementById("terrain"), { childList: true, subtree: true });
markRoute();
onState(() => draw());
addEventListener("hashchange", () => draw());
draw();

