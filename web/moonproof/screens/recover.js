// D · Replanejar. 4 steps: delay (Step 1), what changed (2), exits sorted by slack (3), compare and decide (4).
// Delay numbers: POST /api/scenarios/delay when online, otherwise the stored hourly series (same definition).
// Exits (wait, switch site, shorten) are computed from the series; an exit with no computed result is not shown.
import { mountSheet } from "./sheet.js";
import { mountShell } from "../core/shell.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, apiOnline } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { createLayerCard } from "../core/layers.js";
import { register, t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState, hrefTo } from "../core/state.js";
import { judge, slack, computeExits, longestRun, parseHash, buildHash } from "./scenario-calc.js";
import { loadAll, staticMetrics, flagsOf, apiDelayMetrics, HOUR_MS } from "./scenario-data.js";
// Replan search horizon: about one synodic lunar day, independent of the mission length (AUD-12).
const SEARCH_DAYS = 30;

register({
  en: {
    "rec.ctx": "Scenario {L} · {site}", "rec.landing.delayed": "landing delayed", "rec.violated": "{n} RULES VIOLATED", "rec.violated1": "1 RULE VIOLATED", "rec.ok": "NO RULE VIOLATED", "rec.nd": "NO DATA",
    "rec.step1": "Step 1 · how long is the delay? · hours", "rec.hours": "hours", "rec.newland": "New landing", "rec.end": "Mission end", "rec.endval": "{d} · {n} days after",
    "rec.step2": "Step 2 · what changed", "rec.night": "Longest night", "rec.slack": "Margin to the rule", "rec.earth": "Earth visible", "rec.loss": "Longest Earth loss",
    "rec.step3": "Step 3 · choose an option", "rec.exit.wait": "Wait until {d}", "rec.exit.wait.s": "same site · window moves", "rec.exit.switch": "Land at {name}", "rec.exit.switch.s": "same date · other site",
    "rec.exit.shorten": "Mission of {n} days", "rec.exit.shorten.s": "same site · shorter window", "rec.slackWord": "margin", "rec.none": "No option meets every rule in the search done. Nothing is shown without a calculation.", "rec.nearby.title": "Live API · nearby catalog sites at the delayed start (POST /api/scenarios/delay, PRE)", "rec.nearby.ok": "meets the rules", "rec.nearby.no": "breaks a rule", "rec.nearby.nd": "no data ({r})", "rec.coverage": "Searched: waits up to +{d} days, the other {n} catalog sites at the same start, shorter windows. Options come from the stored hourly series (web/data), even when the delay itself came from the API.",
    "rec.step4": "Step 4 · compare and decide", "rec.step4.short": "Compare", "rec.head.break": "The delay makes the longest night {v} h, above the assumed limit of {lim} h.", "rec.head.ok": "With this delay every rule is still met.", "rec.head.nd": "No data for this delay.",
    "rec.timeline": "Sun over the window · red = rule-breaking night", "rec.planned": "Planned", "rec.after": "+{d} h", "rec.nightOf": "night of {v} h", "rec.exitLine": "Exit {L} · {what}",
    "rec.src.api": "POST /api/scenarios/delay", "rec.src.static": "stored hourly series (web/data)", "rec.src": "Source", "rec.rules": "Rules", "rec.assumed": "assumed limit",
    "rec.def": "Margin", "rec.def.txt": "Hours left to the tighter rule (night or Earth loss); negative = violated. Not the onboard battery margin.",
    "rec.outside": "Window outside the computed series.", "rec.site": "Site", "rec.battery": "Battery margin", "rec.battery.nd": "needs the onboard API", "rec.sha": "Series SHA-256",
    "rec.delay.aria": "Delay of {n} hours", "rec.day": "D{n}", "rec.chip.exit": "Exit D · switch site",
  },
  "pt-BR": {
    "rec.ctx": "Cenário {L} · {site}", "rec.landing.delayed": "pouso adiado", "rec.violated": "{n} REGRAS VIOLADAS", "rec.violated1": "1 REGRA VIOLADA", "rec.ok": "NENHUMA REGRA VIOLADA", "rec.nd": "SEM DADO",
    "rec.step1": "Passo 1 · quanto o pouso atrasou? · horas", "rec.hours": "horas", "rec.newland": "Novo pouso", "rec.end": "Fim da missão", "rec.endval": "{d} · {n} dias depois",
    "rec.step2": "Passo 2 · o que mudou", "rec.night": "Maior noite", "rec.slack": "Folga até a regra", "rec.earth": "Terra visível", "rec.loss": "Maior perda da Terra",
    "rec.step3": "Passo 3 · escolha uma saída", "rec.exit.wait": "Esperar até {d}", "rec.exit.wait.s": "mesmo local · a janela anda", "rec.exit.switch": "Pousar em {name}", "rec.exit.switch.s": "mesma data · outro local",
    "rec.exit.shorten": "Missão de {n} dias", "rec.exit.shorten.s": "mesmo local · janela menor", "rec.slackWord": "folga", "rec.none": "Nenhuma saída atende a todas as regras na busca feita. Sem cálculo, nada aparece.", "rec.nearby.title": "API ao vivo · locais vizinhos do catálogo no início atrasado (POST /api/scenarios/delay, PRE)", "rec.nearby.ok": "atende às regras", "rec.nearby.no": "quebra uma regra", "rec.nearby.nd": "sem dado ({r})", "rec.coverage": "Buscado: esperar até +{d} dias, os outros {n} locais do catálogo no mesmo início e janelas menores. As saídas vêm das séries horárias gravadas (web/data), mesmo quando o atraso veio da API.",
    "rec.step4": "Passo 4 · comparar e decidir", "rec.step4.short": "Comparar", "rec.head.break": "O atraso leva a maior noite a {v} h, acima do limite assumido de {lim} h.", "rec.head.ok": "Com este atraso todas as regras ainda valem.", "rec.head.nd": "Sem dado para este atraso.",
    "rec.timeline": "Sol na janela · vermelho = noite que quebra a regra", "rec.planned": "Planejado", "rec.after": "+{d} h", "rec.nightOf": "noite de {v} h", "rec.exitLine": "Saída {L} · {what}",
    "rec.src.api": "POST /api/scenarios/delay", "rec.src.static": "série horária gravada (web/data)", "rec.src": "Fonte", "rec.rules": "Regras", "rec.assumed": "limite assumido",
    "rec.def": "Folga", "rec.def.txt": "Horas que sobram até a regra mais apertada (noite ou perda da Terra); negativa = violada. Não é a folga da bateria de bordo.",
    "rec.outside": "Janela fora da série calculada.", "rec.site": "Local", "rec.battery": "Folga da bateria", "rec.battery.nd": "exige a API de bordo", "rec.sha": "SHA-256 da série",
    "rec.delay.aria": "Atraso de {n} horas", "rec.day": "D{n}", "rec.chip.exit": "Saída D · trocar de local",
  },
});

export const DELAYS = [12, 24, 48, 72, 96]; // Step 1 range (+12 h … +96 h), per the screen specification
const DAY = 24, EXIT_LETTERS = ["B′", "D", "B″"];
const shell = mountShell({ screen: "recover", context: null, onLang: () => draw() });
mountSheet(document.getElementById("sheet"));
{ // phone: the site dock lives inside the sheet, under its handle (as in Mission), never loose over the map
  const sheet = document.getElementById("sheet"), dock = document.getElementById("dock"), phone = matchMedia("(max-width:700px)");
  const place = () => { if (phone.matches) { if (dock.parentElement !== sheet) sheet.querySelector(".mp-sheet-handle").after(dock); } else if (dock.parentElement !== document.body) document.body.append(dock); };
  phone.addEventListener?.("change", place); place(); }
const doc = await loadSites(), all = await loadAll(doc), online = await apiOnline();
const siteOf = id => doc.sites.find(s => s.id === id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtDate = ms => new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(ms) + " UTC";
const fmtDay = ms => new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short", timeZone: "UTC" }).format(ms);
const hv = x => (x == null ? t("nd") : fmtNum(x, 0) + "\u00a0h");
const pv = x => (x == null ? t("nd") : fmtNum(x, 0) + "%");
const signed = x => (x == null ? t("nd") : (x > 0 ? "+" : x < 0 ? "−" : "") + fmtNum(Math.abs(x), 0) + "\u00a0h");

function scenario() {
  const h = parseHash(location.hash), st = getState();
  const site = siteOf(h.sc[0]?.site) ? h.sc[0].site : (siteOf(st.site) ? st.site : doc.sites[0].id);
  return { site, start: h.sc[0]?.start || st.start || doc.window.start_utc, hours: h.sc[0]?.hours || st.hours || 14 * DAY,
    d: DELAYS.includes(h.d) ? h.d : DELAYS[Math.floor(DELAYS.length / 2)], x: h.x };
}
const write = patch => { const s = { ...scenario(), ...patch }; history.replaceState(null, "", location.search + "#" + buildHash({ sc: [{ site: s.site, start: s.start, hours: s.hours }], d: s.d, x: s.x })); draw(); };

const metricsAt = (id, startMs, hours) => { const m = staticMetrics(all.get(id), startMs, hours, doc.status, id); return m ? { ...m, dark: m.dark, blackout: m.blackout } : null; };

async function draw() {
  const sc = scenario(), st = getState(), rules = { night: st.night, blackout: st.blackout };
  const site = siteOf(sc.site), series = all.get(sc.site), t0 = Date.parse(sc.start), t1 = t0 + sc.d * HOUR_MS;
  let base = metricsAt(sc.site, t0, sc.hours), delayed = metricsAt(sc.site, t1, sc.hours), apiNearby = null;
  if (online) { const r = await apiDelayMetrics({ siteId: sc.site, startIso: new Date(t0).toISOString(), hours: sc.hours, delayH: sc.d, rules }); if (r.base && r.delayed) { base = r.base; delayed = r.delayed; } apiNearby = r.nearby || []; }
  const jd = judge(delayed, rules), jb = judge(base, rules);
  const exits = computeExits({ metricsAt, siteId: sc.site, siteIds: doc.sites.map(s => s.id), startMs: t0, hours: sc.hours, delayH: sc.d, rules, searchDays: SEARCH_DAYS });
  const chosen = exits.find(e => e.kind === sc.x) || exits[0] || null;
  shell.setContext({ site: t("rec.ctx", { L: "B", site: String(site.n) }), date: fmtDay(t1), days: fmtNum(sc.hours / DAY),
    seal: (delayed || base)?.seal || "N/D", online, action: { label: t("rec.step4.short"), href: hrefTo("compare.html") + "#" + compareHash(sc, chosen) } });
  const alert = el("span", "mp-alert", ""); const n = jd.status === "nd" ? null : jd.reasons.length;
  alert.textContent = n == null ? t("rec.nd") : n === 0 ? t("rec.ok") : n === 1 ? t("rec.violated1") : t("rec.violated", { n });
  if (n === 0) alert.classList.add("is-ok");

  // Step 1 + 2 (left)
  const dial = el("div", "mp-dial"); dial.setAttribute("role", "radiogroup"); dial.setAttribute("aria-label", t("rec.step1"));
  const core = el("div", "mp-stat-core"); core.append(Object.assign(el("span", "mp-num"), { textContent: "+" + fmtNum(sc.d) }), el("small", "", t("rec.hours"))); dial.append(core);
  const sats = DELAYS.filter(x => x !== sc.d).slice(0, 4);
  sats.forEach((x, k) => { const b = el("button", "mp-sat"); b.type = "button"; b.dataset.pos = String(k); b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false");
    b.setAttribute("aria-label", t("rec.delay.aria", { n: x })); b.textContent = "+" + fmtNum(x); b.onclick = () => write({ d: x, x: null }); dial.append(b); });
  const p1 = el("div", "mp-step1"); p1.append(el("p", "mp-label mp-q", t("rec.step1")), dial);
  const pills = el("div", "mp-pills");
  pills.append(pill("is-white", t("rec.newland"), fmtDate(t1)), pill("is-white", t("rec.end"), t("rec.endval", { d: fmtDay(t1 + sc.hours * HOUR_MS), n: fmtNum(sc.hours / DAY) })));
  const chg = el("div", "mp-change");
  const line = (label, a, b, bad) => { chg.append(el("span", "mp-label", label), Object.assign(el("s"), { textContent: a }), Object.assign(el("b", bad ? "is-fail" : ""), { textContent: b })); };
  line(t("rec.night"), hv(base?.dark ?? null), hv(delayed?.dark ?? null), delayed && delayed.dark > rules.night);
  line(t("rec.slack"), signed(slack(base, rules)), signed(slack(delayed, rules)), (slack(delayed, rules) ?? 0) < 0);
  line(t("rec.earth"), pv(base?.earthPct ?? null), pv(delayed?.earthPct ?? null), false);
  line(t("rec.loss"), hv(base?.blackout ?? null), hv(delayed?.blackout ?? null), delayed && delayed.blackout > rules.blackout);
  const p2 = el("div", "mp-card"); p2.append(el("p", "mp-label mp-q", t("rec.step2")), chg, seals(delayed, base));
  document.getElementById("left").replaceChildren(alert, p1, pills, p2);

  // Step 3 (right)
  const head = jd.status === "nd" ? t("rec.head.nd") : jd.reasons.some(r => r.key === "night") ? t("rec.head.break", { v: fmtNum(delayed.dark), lim: fmtNum(rules.night) }) : jd.status === "pass" ? t("rec.head.ok") : t("rec.head.break", { v: fmtNum(delayed.dark), lim: fmtNum(rules.night) });
  const list = el("div", "mp-exits"); list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", t("rec.step3"));
  exits.forEach((e, i) => {
    const b = el("button", "mp-exit"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(e === chosen)); b.tabIndex = e === chosen ? 0 : -1;
    const [name, sub] = exitText(e);
    const nm = el("span", "mp-exit-name", name); nm.append(el("small", "", sub));
    b.append(el("span", "mp-scn-letter", EXIT_LETTERS[["wait", "switch", "shorten"].indexOf(e.kind)]), nm, (() => { const s = el("span", "mp-exit-slack"); s.append(el("small", "", t("rec.slackWord")), Object.assign(el("b"), { textContent: signed(e.slack) })); return s; })());
    b.onclick = () => write({ x: e.kind });
    b.onkeydown = ev => { const d = ev.key === "ArrowDown" ? 1 : ev.key === "ArrowUp" ? -1 : 0; if (d) { ev.preventDefault(); write({ x: exits[(i + d + exits.length) % exits.length].kind }); document.querySelector('.mp-exit[aria-checked="true"]')?.focus(); } };
    list.append(b);
  });
  if (!exits.length) list.append(el("p", "mp-label", t("rec.none")));
  // AUD-12/13: say what was actually searched and where the options come from.
  // AUD-13: API nearby sites are a separate block with their own source; never ranked with the static exits.
  if (apiNearby && apiNearby.length) {
    const nb = el("div", "mp-nearby"); nb.append(el("p", "mp-label", t("rec.nearby.title")));
    for (const n of apiNearby) { const row = el("p", "mp-nearby-row");
      row.append(el("b", "", n.siteId), " · " + (n.km == null ? t("nd") : fmtNum(n.km, 1) + " km") + " · ",
        el("span", n.admissible === true ? "is-ok" : n.admissible === false ? "is-fail" : "", n.admissible === true ? t("rec.nearby.ok") : n.admissible === false ? t("rec.nearby.no") : t("rec.nearby.nd", { r: n.reason })));
      nb.append(row); }
    list.append(nb);
  }
  list.append(el("p", "mp-label mp-coverage", t("rec.coverage", { d: fmtNum(SEARCH_DAYS), n: fmtNum(doc.sites.length - 1) })));
  const go = el("a", "mp-pill is-primary", t("rec.step4")); go.href = hrefTo("compare.html") + "#" + compareHash(sc, chosen); go.style.justifyContent = "center";
  const proof = el("table", "mp-proof"); const add = (k, v) => { const r = proof.insertRow(); const h = el("th", "", k); h.scope = "row"; r.append(h); r.insertCell().append(v); };
  add(t("rec.def"), t("rec.def.txt")); add(t("rec.rules"), t("rec.assumed") + `: ${fmtNum(rules.night)} h · ${fmtNum(rules.blackout)} h`); add(t("rec.battery"), t("rec.battery.nd"));
  const m = delayed || base; const src = el("span");
  if (m) { src.append((m.origin === "api" ? t("rec.src.api") : t("rec.src.static")) + " · ", sealEl(m.seal)); if (m.sha) src.append(el("br"), Object.assign(el("code", "mp-coord"), { textContent: m.sha })); } else src.append(t("rec.outside"), " ", sealEl("N/D"));
  add(t("rec.src"), src);
  const card = createLayerCard({ id: "exits", title: t("rec.step3"), status: m ? m.status : "NO_SERIES_DATA", answer: head, why: list, proof, layer: st.layer, onLayer: layer => setState({ layer }) });
  // exits are the content of Step 3, so they stay visible in every layer: move them under the answer
  card.el.querySelector(".mp-layer-answer").after(list); card.el.querySelector(".mp-chips").before(go);
  document.getElementById("right").replaceChildren(card.el);

  // timeline
  const tl = el("section", "mp-glass mp-scn-time"); tl.append(el("p", "mp-label mp-q", t("rec.timeline")));
  tl.append(trackRow(t("rec.planned"), series, t0, sc.hours, rules), trackRow(t("rec.after", { d: sc.d }), series, t1, sc.hours, rules));
  document.getElementById("time").replaceChildren(tl);
  drawDock(); markMap(sc, chosen, delayed);
}
function seals(a, b) { const d = el("div", "mp-foot"); const m = a || b; d.append(m ? sealEl(m.seal) : sealEl("N/D"), el("span", "mp-label", m ? (m.origin === "api" ? t("rec.src.api") : t("rec.src.static")) : t("rec.outside"))); return d; }
function pill(cls, k, v) { const p = el("div", "mp-pill " + cls); p.append(el("span", "", k), Object.assign(el("b"), { textContent: v })); return p; }
function exitText(e) {
  if (e.kind === "wait") return [t("rec.exit.wait", { d: fmtDay(e.startMs) }), t("rec.exit.wait.s")];
  if (e.kind === "switch") return [t("rec.exit.switch", { name: siteOf(e.siteId).name }), t("rec.exit.switch.s")];
  return [t("rec.exit.shorten", { n: fmtNum(e.hours / DAY) }), t("rec.exit.shorten.s")];
}
function compareHash(sc, chosen) {
  const base = { site: sc.site, start: sc.start, hours: sc.hours };
  const alt = chosen ? { site: chosen.siteId, start: new Date(chosen.startMs).toISOString(), hours: chosen.hours } : { site: sc.site, start: new Date(Date.parse(sc.start) + sc.d * HOUR_MS).toISOString(), hours: sc.hours };
  return buildHash({ sc: [base, alt] });
}
function trackRow(label, series, startMs, hours, rules) {
  const row = el("div", "mp-time-row"); row.append(el("span", "", label));
  const track = el("div", "mp-track"); track.setAttribute("role", "img");
  const { sun } = flagsOf(series, startMs, hours); const worst = longestRun(sun, false);
  let i = 0;
  while (i < sun.length) { let j = i; const v = sun[i]; while (j < sun.length && sun[j] === v) j++;
    const seg = el("i", v === null ? "n" : v ? "s" : "d"); seg.style.flex = String(j - i);
    if (v === false && i === worst.start && worst.len > rules.night) seg.classList.add("is-break");
    track.append(seg); i = j; }
  track.setAttribute("aria-label", `${label}: ${t("rec.nightOf", { v: fmtNum(worst.len) })}`);
  row.append(track); return row;
}
function drawDock() {
  const list = doc.sites, sc = scenario(), i = list.findIndex(s => s.id === sc.site), n = list.length;
  const b = (txt, aria, fn, cls = "") => { const x = el("button", "mp-pill " + cls, txt); x.type = "button"; x.setAttribute("aria-label", aria); x.onclick = fn; return x; };
  document.getElementById("dock").replaceChildren(b("‹", "previous", () => write({ site: list[(i + n - 1) % n].id, x: null })),
    (x => (x.replaceChildren(el("span", "mp-ellip", x.textContent)), x))(b(`${t("rec.site")} ${list[i].n} · ${list[i].name}`, list[i].name, () => {}, "is-primary mp-sel")), b("›", "next", () => write({ site: list[(i + 1) % n].id, x: null })));
}
let terrain = null;
const route = []; // read by the terrain on every redraw; filled in place (B then the chosen exit site)
let chips = [];
function markMap(sc, chosen, delayed) {
  const sw = chosen?.kind === "switch";
  route.splice(0, route.length, ...(sw ? [sc.site, chosen.siteId] : []));
  terrain && terrain.select(sc.site);
  const rules = { night: getState().night };
  const worst = delayed ? longestRun(flagsOf(all.get(sc.site), Date.parse(sc.start) + sc.d * HOUR_MS, sc.hours).sun, false).len : 0;
  chips = [];
  if (delayed && worst > rules.night) chips.push({ site: sc.site, cls: "is-red", text: t("rec.nightOf", { v: fmtNum(worst) }) });
  if (sw) chips.push({ site: chosen.siteId, cls: "is-jade", text: t("rec.chip.exit") });
  placeChips();
  document.querySelectorAll(".mp-marker").forEach(m => { const isB = m.dataset.site === sc.site, isD = chosen?.kind === "switch" && m.dataset.site === chosen.siteId;
    m.hidden = !(isB || isD); m.firstChild.textContent = isB ? "B" : "D"; });
}
terrain = await mountTerrain(document.getElementById("terrain"), { sites: doc.sites, selected: scenario().site, route, onSelect: id => write({ site: id, x: null }) });
// Map chips follow their marker (the terrain rebuilds markers on redraw, so measure after the next frame).
function placeChips() {
  document.querySelectorAll(".mp-dist").forEach(c => c.remove());
  requestAnimationFrame(() => { for (const c of chips) {
    const m = document.querySelector(`.mp-marker[data-site="${c.site}"]`); if (!m || m.hidden || m.dataset.covered === "true") continue;
    const r = m.getBoundingClientRect(), d = el("span", "mp-dist " + c.cls, c.text);
    Object.assign(d.style, { left: r.left + r.width / 2 + "px", top: r.bottom + 8 + "px" }); document.body.append(d); } });
}
addEventListener("resize", () => placeChips());
onState(() => draw()); addEventListener("hashchange", () => draw()); draw();
