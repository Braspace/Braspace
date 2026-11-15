// H · Evidências — "De onde vem cada número?". Everything shown carries its origin; no origin → "—" + N/D.
import { mountShell } from "../core/shell.js";
import { holdReady, markReady } from "../core/ready.js";
import { mountTerrain } from "../core/terrain.js";
import { loadSites, loadSeries, loadRegion, api, apiBase, sealFor, DATA_BASE } from "../core/data.js";
import { sealEl } from "../core/layers.js";
import { register, t, fmtNum, lang } from "../core/i18n.js";
import { getState, setState, onState } from "../core/state.js";
import { TEXTS } from "./evidence-texts.js";
import { TEXTS as CK } from "./cockpit-texts.js";
import { REGISTRY } from "./evidence-registry.js";
import { sourceRows, trustRows, buildPassport, pickVersion, parseConfigCommit, registryChip, SECTIONS, TRUST_BLOCKS } from "./evidence-model.js";

register(TEXTS);
register({ en: { "cockpit.assumed": CK.en["cockpit.assumed"] }, "pt-BR": { "cockpit.assumed": CK["pt-BR"]["cockpit.assumed"] } });
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const shell = mountShell({ screen: "evidence", context: null, onLang: () => draw() });
holdReady();
const doc = await loadSites();
if (!doc.sites.some(s => s.id === getState().site)) setState({ site: doc.sites[0].id });
// Static facts loaded once.
const [ready, health, caps, layers, apiSites, vector] = await Promise.all([api("/readyz", { timeoutMs: 3000 }), api("/api/health", { timeoutMs: 3000 }), api("/v1/capabilities", { timeoutMs: 3000 }), api("/api/layers", { timeoutMs: 3000 }), api("/api/sites", { timeoutMs: 3000 }), api("/api/vector/status", { timeoutMs: 3000 })]);
const online = ready.ok;
let configCommit = null;
try { const r = await fetch(apiBase() + "/config.js", { cache: "no-store" }); if (r.ok) configCommit = parseConfigCommit(await r.text()); } catch { /* no config.js here */ }
const version = pickVersion({ configCommit, health: health.ok ? health.data : null });
const region = await fetch(DATA_BASE + "region/south_pole_400m.json").then(r => r.ok ? r.json() : null).catch(() => null);
await mountTerrain($("terrain"), { sites: doc.sites, selected: getState().site, onSelect: id => setState({ site: id }) });
let section = "passport", trustOpen = false;

async function siteMeta(site) { const s = await loadSeries(site).catch(() => null); return s ? s.meta : null; }
const kv = (rows) => { const tb = el("table"); for (const [k, v] of rows) { const tr = tb.insertRow(); const th = el("th", null, k); th.scope = "row"; tr.append(th); const td = tr.insertCell(); td.append(v ?? t("nd")); } return tb; };
const mono = v => Object.assign(el("span", "mp-mono"), { textContent: v ?? t("nd") });

async function model() {
  const st = getState(), site = doc.sites.find(s => s.id === st.site), meta = await siteMeta(site);
  const rows = sourceRows({ sites: { science_status: doc.status }, region, series: meta && { provenance: meta.provenance, science_status: meta.science_status, site: meta.site }, layers: layers.ok ? layers.data.layers : [] });
  const now = new Date().toISOString();
  const state = { ...st, link: location.href };
  const passport = buildPassport({ state, site, sites: { science_status: doc.status, generated_utc: doc.generated, series_window: doc.window }, series: meta, version,
    api: { online, state: ready.ok ? ready.status : null }, rows, rules: null, layers: layers.ok ? layers.data.layers : [], nowIso: now });
  return { st, site, meta, rows, passport };
}

async function draw() {
  const { st, site, meta, rows, passport } = await model();
  // "14 nov 2026 · 17:32 UTC" (day, short month, year, time): short enough for the 927 px context bar.
  const dp = Object.fromEntries(new Intl.DateTimeFormat(lang(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).formatToParts(new Date(passport.generated_at)).map(p => [p.type, p.value]));
  const d = `${dp.day} ${String(dp.month).replace(/\./g, "")} ${dp.year} · ${dp.hour}:${dp.minute} UTC`;
  shell.setContext({ site: t("evidence.passport", { s: String(site.n) }), date: t("evidence.computed_at", { d }),
    days: t("evidence.version", { v: version ? version.value : t("nd") }), seal: sealFor(doc.status), online,
    action: { label: t("evidence.download_json"), href: "#" } });
  // The core prints "<days> dias" in the last slot of .mp-ctx-text; here that slot carries the version, so replace
  // that text node (never a positional child of .mp-context: its 5th child is the primary action pill).
  const ctxText = document.querySelector(".mp-context .mp-ctx-text");
  if (ctxText && ctxText.lastChild) ctxText.lastChild.textContent = t("evidence.version", { v: version ? version.value : t("nd") });
  const action = document.querySelector(".mp-context .mp-pill.is-primary");
  if (action) { action.removeAttribute("href"); action.setAttribute("role", "button"); action.tabIndex = 0; action.onclick = e => { e.preventDefault(); download(passport); };
    action.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); download(passport); } }; }
  // "Alterar": switch the scenario (the terrain markers are hidden on this screen). Native select over a chip, rebuilt with the bar.
  const bar = document.querySelector(".mp-context"), primary = bar && bar.querySelector(".mp-pill.is-primary");
  if (bar) { const chip = el("div", "mp-ev-alter"), pick = el("select"); chip.append(el("span", null, t("evidence.change")), pick); pick.setAttribute("aria-label", t("evidence.change_aria"));
    for (const s of doc.sites) pick.append(new Option(`${s.n} · ${s.name}`, s.id, false, s.id === st.site));
    pick.onchange = () => setState({ site: pick.value }); bar.insertBefore(chip, primary); }
  // menu
  $("menu").replaceChildren(...SECTIONS.map(id => { const b = el("button", "mp-pill", t("evidence.nav." + id)); b.type = "button"; b.dataset.section = id;
    if (id === section) b.setAttribute("aria-current", "page"); b.onclick = () => { section = id; draw(); document.getElementById("sec-" + id)?.scrollIntoView({ block: "start" }); }; return b; }));
  // main
  const main = $("main");
  const sub = (cls, ttl, desc, seal) => { const c = el("div", "mp-sub " + cls); c.append(el("h3", null, ttl), el("p", null, desc), sealEl(seal)); return c; };
  const two = el("div", "mp-two"); two.append(sub("real", t("evidence.real_data"), t("evidence.real_data_desc"), sealFor(doc.status)), sub("sim", t("evidence.simulation"), t("evidence.simulation_desc"), "SIM"));
  const hMast = meta?.site?.observer_height_m;
  const assume = el("ol", "mp-assume");
  for (const [k, vars] of [["evidence.assume_sun", {}], ["evidence.assume_earth", { n: hMast == null ? t("nd") : fmtNum(hMast, 0) }], ["evidence.assume_unknown", {}], ["evidence.assume_precision", {}]]) assume.append(el("li", null, t(k, vars)));
  const block = (id, ...kids) => { const b = el("section", "mp-ev-block"); b.id = "sec-" + id; b.dataset.section = id; b.append(...kids); return b; };
  const pp = meta?.provenance;
  const passportRows = [[t("evidence.scenario"), `${site.n} · ${site.name}`], [t("evidence.passport_sites"), fmtNum(doc.sites.length)],
    [t("evidence.window"), doc.window ? `${doc.window.start_utc} · ${fmtNum(doc.window.hours)} h · ${fmtNum(doc.window.step_minutes)} min` : null],
    [t("evidence.series_sha"), mono(meta?.series?.sha256)], [t("evidence.status"), `${doc.status} · ${t("seal." + sealFor(doc.status))}`],
    [t("evidence.version", { v: "" }).trim(), version ? `${version.value} (${version.source})` : t("evidence.no_version")],
    [t("evidence.api"), online ? `${t("evidence.api_online")} · ${ready.status ?? t("nd")} (${t("evidence.api_state")})` : t("evidence.api_offline")],
    [t("evidence.proof_ephemeris"), pp?.ephemeris ?? null], [t("evidence.proof_horizon"), pp?.ray_parameters ? t("evidence.horizon_src", { h: fmtNum(hMast, 0), d: fmtNum(pp.ray_parameters.max_distance_m / 1000) }) : null]];
  const regNote = t("evidence.registry_note", { n: REGISTRY.assets.length, d: REGISTRY.reviewed_at });
  const regTable = kv(REGISTRY.assets.map(a => [a.asset_id, `${a.redistribution_status} · ${a.scientific_role}`]));
  const limits = [t("evidence.limits_rule_night", { n: st.night }), t("evidence.limits_rule_blackout", { n: st.blackout }), t("evidence.limits_rule_floor", { n: st.battery })]
    .map(k => [k, t("cockpit.assumed")]);
  main.replaceChildren(el("p", "mp-ev-eyebrow", t("evidence.title")), Object.assign(el("h1"), { textContent: t("evidence.where_numbers") }), el("p", "mp-ev-lead", t("evidence.intro")), two,
    block("assumptions", el("h2", null, t("evidence.assumptions")), assume),
    block("passport", el("h2", null, t("evidence.passport", { s: `${site.n} · ${site.name}` })), kv(passportRows)),
    block("sources", el("h2", null, t("evidence.registry")), el("p", "mp-label", regNote), regTable, el("p", "mp-label", t("evidence.matrix"))),
    block("limits", el("h2", null, t("evidence.limits_title")), el("h3", null, t("evidence.limits_rules")), kv(limits),
      el("p", "mp-label", `${t("evidence.limits_science")}: ${doc.status}`), el("p", "mp-label", `${t("evidence.limits_notes")}: ${doc.note ?? t("nd")}`)),
    block("lessons", el("h2", null, t("evidence.lessons")), el("p", "mp-label", t("evidence.lessons_nd")), sealEl("N/D")),
    block("missions", el("h2", null, t("evidence.missions")), el("p", "mp-label", t("evidence.missions_nd")), sealEl("N/D")));
  for (const b of main.querySelectorAll(".mp-ev-block")) b.hidden = !(b.dataset.section === section) && !(["passport", "assumptions"].includes(section) && ["passport", "assumptions"].includes(b.dataset.section));
  // sources
  const names = { terrain: "evidence.src_terrain", surface: "evidence.src_surface", ephemeris: "evidence.src_ephemeris", horizon: "evidence.src_horizon", battery: "evidence.src_battery", landing: "evidence.src_landing", rocks: "evidence.src_rocks" };
  const sd = r => {
    if (r.id === "terrain") return r.detail ? t("evidence.terrain_src", { m: fmtNum(r.detail.spacing_m), n: fmtNum(r.detail.native_resolution_m) }) : t("nd");
    if (r.id === "surface") return r.detail ? new URL(r.detail.source).hostname : t("nd");
    if (r.id === "ephemeris") return r.detail ? t("evidence.ephem_src", { k: Object.keys(r.detail.kernel_sha256 || {}).join(", ") }) : t("nd");
    if (r.id === "horizon") return r.detail ? t("evidence.horizon_src", { h: fmtNum(hMast, 0), d: fmtNum(r.detail.max_distance_m / 1000) }) : t("nd");
    if (r.id === "battery") return t("evidence.sim_battery"); if (r.id === "landing") return t("evidence.sim_landing"); return t("evidence.src_rocks_note");
  };
  const sh = el("div", "mp-head mp-row-between", "");
  sh.append(el("h2", null, t("evidence.sources")), el("span", "mp-count", "• " + t("evidence.sources_count", { n: rows.length })));
  $("sources").replaceChildren(sh, ...rows.map(r => { const row = el("div", "mp-src"); const l = el("div"); const sm = el("small", null, sd(r)); sm.title = sm.textContent; l.append(el("b", null, t(names[r.id])), sm);
    row.append(l, r.registryOnly ? Object.assign(el("span", "mp-chipreg", r.detail.redistribution), { title: t("evidence.registry_note", { n: REGISTRY.assets.length, d: REGISTRY.reviewed_at }) }) : sealEl(r.seal)); return row; }));
  // API sync (legacy Polar Lab backend widget): what the live API serves next to the static data.
  const sync = el("div", "mp-sync"); sync.append(el("h3", null, t("evidence.sync")));
  if (!online) sync.append(el("p", "mp-label", t("evidence.sync.off")));
  else {
    const n = Array.isArray(apiSites.data?.sites) ? apiSites.data.sites.length : null, h = health.ok ? health.data : {};
    const st = h.series_science_statuses ? Object.entries(h.series_science_statuses).map(([k, v]) => `${v} ${k}`).join(" · ") : t("nd");
    const vec = vector.ok ? (vector.data?.enabled ? t("evidence.sync.vecOn") : t("evidence.sync.vecOff")) : t("evidence.sync.vecNa");
    for (const [k, v] of [["evidence.sync.sites", n == null ? t("nd") : String(n)], ["evidence.sync.series", `${h.sites_with_series ?? t("nd")} (${st})`], ["evidence.sync.local", String(doc.sites.length)], ["evidence.sync.vector", vec]]) {
      const p = el("p", "mp-label"); p.append(el("b", null, t(k) + ": "), v); sync.append(p); }
  }
  $("sources").append(sync);
  // trust
  const th = el("div", "mp-row-between"); th.append(el("h2", null, t("evidence.how_much_trust")));
  const q = el("button", "mp-pill mp-help", "?"); q.type = "button"; q.setAttribute("aria-label", t("evidence.help")); q.setAttribute("aria-expanded", String(trustOpen)); q.onclick = () => { trustOpen = !trustOpen; draw(); }; th.append(q);
  const keys = { sun: "evidence.trust_sun", earth: "evidence.trust_earth", tilt: "evidence.trust_tilt", battery: "evidence.trust_battery" };
  const tr = trustRows({ sitesStatus: doc.status, slopeAvailable: false });
  $("trust").replaceChildren(th, ...(trustOpen ? [el("p", "mp-label", t("evidence.trust_help"))] : []), ...tr.map(r => { const row = el("div", "mp-trust"); row.dataset.trust = r.id; row.dataset.level = String(r.level);
    const [name, sub2] = t(keys[r.id]).split(" · "); const lab = el("div"); lab.append(el("b", null, name), el("small", null, r.seal === "N/D" ? t("evidence.trust_na") : sub2));
    const seg = el("div", "mp-seg"); seg.setAttribute("role", "img"); seg.setAttribute("aria-label", `${r.level}/${TRUST_BLOCKS}`);
    for (let k = 0; k < TRUST_BLOCKS; k++) seg.append(Object.assign(el("i"), { className: k < r.level ? "on" : "" }));
    row.append(lab, seg); return row; }));
  globalThis.__evidence = passport;
}
function download(passport) {
  const blob = new Blob([JSON.stringify({ ...passport, generated_at: new Date().toISOString() }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${t("evidence.json_name")}-${passport.scenario.site?.id || "site"}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
onState(() => draw());
await draw();
markReady();
