// FE-03 / FE-04: the real cockpit.js, run against a tiny fake DOM and a fake API.
// Run: node --test web/onboard/test/
// Nothing here reimplements the logic under test: the page script is loaded as the browser loads it,
// the API answers from fixtures, and the assertions read what the panels print.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseHash, buildHash, BORDO_SECTIONS, BORDO_SLUG } from "../../ds/router.js";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const TABS = ["visao", "entrada", "geometria", "horizonte", "janelas", "energia", "vida", "replan", "visual", "sens", "historico", "lanc", "status"];

// ---------- fake DOM ----------
class Node_ {}
class Text_ extends Node_ { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
class El extends Node_ {
  constructor(tag) {
    super(); this.tagName = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.dataset = {};
    this.className = ""; this._text = ""; this.hidden = false; this.open = false; this.value = ""; this.disabled = false;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith("data-")) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  append(...k) { for (const c of k) this.children.push(c instanceof Node_ ? c : new Text_(c)); }
  prepend(...k) { this.children.unshift(...k.map(c => (c instanceof Node_ ? c : new Text_(c)))); }
  replaceChildren(...k) { this.children = []; this.append(...k); }
  get textContent() { return [this._text, ...this.children.map(c => c.textContent)].filter(Boolean).join(" "); }
  set textContent(v) { this._text = String(v); this.children = []; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  remove() {}
  focus() {}
  select() {}
  get isConnected() { return true; }
}
function walk(el, pred, out = []) {
  if (el instanceof El) { if (pred(el)) out.push(el); el.children.forEach(c => walk(c, pred, out)); }
  return out;
}

// ---------- fake API ----------
// points of a hourly series with one long Earth blockade; the API ignores the "step" parameter, as the real one does
function hourlySeries({ hours = 720, blockFrom = 100, blockLen = 351, startMs = Date.parse("2026-12-01T00:00:00Z") } = {}) {
  return Array.from({ length: hours }, (_, i) => ({
    epoch_utc: new Date(startMs + i * 3600e3).toISOString().replace(".000Z", "Z"),
    sun_visible: i % 100 < 50, earth_visible: !(i >= blockFrom && i < blockFrom + blockLen), sun_margin_deg: 1, earth_margin_deg: 1
  }));
}
const withSeries = pts => ({ results: [{ data_status: "AVAILABLE", science_status: "SYNTHETIC", engine_science_status: "UNVERIFIED_INPUTS",
  evaluation: { series: pts, metrics: { sample_count: pts.length, step_hours: 1, sun_visible_fraction: 0.5, earth_visible_fraction: 0.5,
    longest_continuous_dark_hours: 50, longest_continuous_comm_gap_hours: 351 } } }] });
const noSeries = { results: [{ data_status: "NO_SERIES_DATA", science_status: "NOT_AVAILABLE" }] };

function makeFetch(seriesBySite, calls) {
  const json = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
  return async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, body });
    if (url.endsWith("/api/compare")) {
      const pts = seriesBySite[body.site_ids[0]];
      return json(200, pts ? withSeries(pts) : noSeries);
    }
    if (url.endsWith("/api/onboard/site-evaluate")) {
      if (body.duration_hours > 480) return json(400, { error: "window exceeds the onboard limit of 480", code: "WINDOW_TOO_LONG" });
      return json(200, { combined_decision: { status: "OK", candidate_id: "planejado" }, onboard: { decision: "OK" }, candidates: [{ science_status: "SYNTHETIC", breached_risks: [] }] });
    }
    if (/\/sky/.test(url)) return json(404, "404 page not found");
    if (url.endsWith("data/sites.json")) return json(200, { sites: [{ id: "malapert-massif", name: "Malapert Massif" }] });
    return json(500, "not mocked");
  };
}

// ---------- boot the real page script ----------
async function boot({ hash = "#/bordo", series = {} } = {}) {
  const calls = [], pushed = [], replaced = [];
  const els = {};
  for (const id of ["utc", "met", "views", "alarm-list", "alarm-sum", "alarm", "fab", "topnav", "page-title", "badges", "lamp-api", "top-site"]) { els[id] = new El(id === "top-site" ? "select" : "div"); }
  const buttons = TABS.map(t => { const b = new El("button"); b.setAttribute("data-tab", t); return b; });
  const body = new El("body"); body.children = Object.values(els);
  const location = { hash, hostname: "localhost" };
  const sb = {
    console, Date, JSON, Math, Promise, Object, Array, Number, String, Map, Set, Error, RegExp, Blob: class {}, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, Node: Node_,
    location, getComputedStyle: () => ({ getPropertyValue: () => "" }), fetch: makeFetch(series, calls),
    history: { pushState: (_s, _t, url) => { pushed.push(url); location.hash = url; }, replaceState: (_s, _t, url) => { replaced.push(url); location.hash = url; } },
    document: {
      readyState: "complete", title: "",
      getElementById: id => walk(body, e => e.attrs.id === id || e === els[id])[0] || null,
      querySelectorAll: q => (q === "nav.tabs button" ? buttons : []), querySelector: () => null,
      createElement: t => new El(t), createElementNS: (_n, t) => new El(t), createTextNode: t => new Text_(t), addEventListener() {}
    },
    addEventListener(t, f) { (sb.__ls[t] ||= []).push(f); }, __ls: {},
    MoonproofRouter: { parseHash, buildHash, BORDO_SECTIONS, BORDO_SLUG, saveLastRoute() {} }
  };
  sb.window = sb;
  vm.createContext(sb);
  for (const f of ["sim.js", "request.js", "model.js", "live.js", "features.js", "api.js", "cockpit.js"]) vm.runInContext(read(f), sb, { filename: f });
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 4)); };
  await settle();
  const env = {
    calls, pushed, replaced, els, buttons, location, sb,
    text: () => els.views.textContent,
    async go(tab) { buttons.find(b => b.dataset.tab === tab).listeners.click[0](); await settle(); return env.text(); },
    async pickSite(id) { els["top-site"].listeners.change[0]({ target: { value: id, selectedOptions: [{ disabled: false }] } }); await settle(); },
    async click(label) { const b = walk(els.views, e => e.tagName === "button" && e.textContent.includes(label))[0]; assert.ok(b, "button " + label); b.listeners.click[0](); await settle(); },
    rows: kind => walk(els.views, e => e.tagName === "tr" && e.children[0] && e.children[0].textContent === kind).map(r => r.children.map(c => c.textContent)),
    settle
  };
  return env;
}
const num = (re, text) => { const m = re.exec(text); assert.ok(m, "no match for " + re + " in: " + text.slice(0, 300)); return Number(m[1]); };
const A = "synthetic-demo-a";

// ---------- FE-03 ----------
test("FE-03: Visão geral and Janelas print the same longest Earth blockade for the same scenario", async () => {
  const env = await boot({ hash: "#/bordo?site=" + A, series: { [A]: hourlySeries() } });
  const visao = await env.go("visao");
  const janelas = await env.go("janelas");
  const overview = num(/maior bloqueio (\d+) h/, visao);
  const windows = num(/Maior bloqueio da Terra\s+([\d.]+) h/, janelas);
  assert.equal(windows, overview, "Janelas " + windows + " h vs Visão geral " + overview + " h");
  assert.ok(overview < 400, "the 351 h blockade must not double to 702 h (got " + overview + ")");
});

test("FE-03: the Earth windows of Janelas add up to the Earth hours of Visão geral and Janelas", async () => {
  const env = await boot({ hash: "#/bordo?site=" + A, series: { [A]: hourlySeries() } });
  const visao = await env.go("visao");
  const janelas = await env.go("janelas");
  const sum = env.rows("Terra").reduce((s, r) => s + Number(r[3]), 0);
  const headline = num(/Horas com Terra visível\s+([\d.]+) h de ([\d.]+) h/, janelas);
  assert.equal(sum, headline, "sum of window rows vs card");
  const kpi = num(/Terra visível\s+(\d+)\s+h/, visao);
  assert.equal(Math.round(sum), kpi, "Visão geral card");
  const total = Number(/Horas com Terra visível\s+[\d.]+ h de ([\d.]+) h/.exec(janelas)[1]);
  assert.equal(total, 720, "the card must cover the 720 h of the parameter");
});

test("FE-03: windows are half-open UTC intervals inside [start, start + 720 h)", async () => {
  const env = await boot({ hash: "#/bordo?site=" + A, series: { [A]: hourlySeries() } });
  await env.go("janelas");
  const stamps = [...env.rows("Terra"), ...env.rows("Luz")].flatMap(r => [r[1], r[2]]);
  assert.ok(stamps.length > 4);
  for (const s of stamps) {
    assert.match(s, /^\d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
    assert.ok(s >= "2026-12-01 00:00 UTC" && s <= "2026-12-31 00:00 UTC", "outside the 30 day window: " + s);
  }
  // each row: end - start equals its hours
  for (const [, a, b, hrs] of [...env.rows("Terra"), ...env.rows("Luz")]) {
    const ms = t => Date.parse(t.replace(" UTC", "").replace(" ", "T") + ":00Z");
    assert.equal((ms(b) - ms(a)) / 3600e3, Number(hrs));
  }
});

test("FE-03: the step printed by Geometria is the step of the parameter (120 min), not the API series step", async () => {
  const env = await boot({ hash: "#/bordo?site=" + A, series: { [A]: hourlySeries() } });
  const geo = await env.go("geometria");
  assert.match(geo, /passo de 120 min/);
  assert.match(geo, /passo 120 min/);
  assert.doesNotMatch(geo, /\(passo de 60 min\)|passo 60 min/);
});

test("FE-03: a parameter step that is not a multiple of the series step is said, never hidden", async () => {
  const env = await boot({ hash: "#/bordo?site=" + A, series: { [A]: hourlySeries() } });
  await env.go("entrada");
  const input = walk(env.els.views, e => e.tagName === "input" && e.attrs.max === "360")[0];
  input.listeners.change[0]({ target: { value: "90" } });
  await env.settle();
  const text = await env.go("janelas");
  assert.match(text, /passo de 60 min e o parâmetro pede 90 min/);
});

test("FE-03: when the API limits the energy window, the evaluated horizon and the limit are printed", async () => {
  const env = await boot({ hash: "#/bordo/energia?site=" + A, series: { [A]: hourlySeries() } });
  await env.go("energia");
  await env.click("AVALIAR COM SÉRIE (API)");
  const text = env.text();
  assert.match(text, /horizonte avaliado\s+480 h de 720 h/);
  assert.match(text, /PARCIAL/);
  assert.match(text, /fim exclusivo/);
  assert.match(text, /WINDOW_TOO_LONG/);
});

// ---------- FE-04 ----------
const R = "malapert-massif";

test("FE-04: synthetic place keeps the plain view, no real-place note", async () => {
  const env = await boot({ hash: "#/bordo?site=synthetic-demo-b", series: { "synthetic-demo-b": hourlySeries() } });
  for (const t of ["visao", "janelas"]) assert.doesNotMatch(await env.go(t), /não tem série na API/);
  assert.match(await env.go("visao"), /SYN-SITE-B · início/);
});

test("FE-04: real place with a series is computed from its series, with no synthetic substitute", async () => {
  const env = await boot({ hash: "#/bordo/janelas?site=" + R, series: { [R]: hourlySeries({ blockLen: 200 }) } });
  const visao = await env.go("visao");
  assert.match(visao, new RegExp(R + " · início"));
  assert.doesNotMatch(visao, /não tem série na API/);
  assert.match(visao, /maior bloqueio 20\d h/);
  // horizon, replanning and sensitivity are browser-model panels: said, not invented
  for (const t of ["horizonte", "replan", "sens"]) assert.match(await env.go(t), /só existe no modelo sintético/);
  assert.match(env.pushed.at(-1), new RegExp("site=" + R));
});

test("FE-04: real place without a series says so on every tab and keeps the SIM seal; no silent swap", async () => {
  const env = await boot({ hash: "#/bordo?site=" + R, series: { [R]: null } });
  for (const t of ["visao", "geometria", "janelas", "energia", "entrada", "status"]) {
    const text = await env.go(t);
    assert.match(text, /O local real "malapert-massif" não tem série na API/, t);
    assert.match(text, /SIM/, t);
    assert.match(text, /NÃO são desse local/, t);
  }
  assert.match(env.pushed.at(-1), new RegExp("site=" + R), "the URL still names the real place that was asked for");
});

test("FE-04: tabHash follows the place on screen after switching place", async () => {
  const env = await boot({ hash: "#/bordo", series: { [A]: hourlySeries(), "synthetic-demo-b": hourlySeries() } });
  await env.pickSite("synthetic-demo-b");
  assert.match(env.replaced.at(-1), /site=synthetic-demo-b/, "address bar updated at once");
  await env.go("janelas");
  assert.match(env.pushed.at(-1), /^#\/bordo\/janelas\?site=synthetic-demo-b$/);
  await env.pickSite(A);
  await env.go("energia");
  assert.match(env.pushed.at(-1), /^#\/bordo\/energia\?site=synthetic-demo-a$/);
});

test("FE-04: leaving a real place without series for a synthetic one drops the note and fixes the URL", async () => {
  const env = await boot({ hash: "#/bordo?site=" + R, series: { [R]: null, "synthetic-demo-b": hourlySeries() } });
  assert.match(await env.go("visao"), /não tem série na API/);
  await env.pickSite("synthetic-demo-b");
  const text = await env.go("visao");
  assert.doesNotMatch(text, /não tem série na API/);
  assert.doesNotMatch(env.pushed.at(-1), new RegExp(R));
  assert.match(env.pushed.at(-1), /site=synthetic-demo-b/);
});
