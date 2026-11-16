// K1 Planejamento: API bodies against api/openapi.json, the real hourly series, honest rule effects, derived uncertainty,
// the Compare scenarios and the printable passport. Real series from web/data/sites/*.bin; no browser, no network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SiteSeries, decodeSeries } from "../../lab/data.js";
import { siteEvaluateBody, runScenario, H1_PROFILE } from "../screens/cockpit-model.js";
import { PLAN_DEFAULTS, ruleEffects, seriesStepH, observerHeightM, strideMetrics, hourlyRows, gridUncertainty, batteryMarginH, compareScenarios, compareBody, compareOutcome,
  computePlan, violates, csvDocument, jsonDocument, passportHtml, CSV_HEADER } from "../screens/plan-model.js";

const root = path.resolve(import.meta.dirname, "..");
const web = path.resolve(root, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const spec = JSON.parse(fs.readFileSync(path.resolve(web, "../api/openapi.json"), "utf8"));
const sitesDoc = JSON.parse(fs.readFileSync(path.join(web, "data/sites.json"), "utf8"));
const sites = sitesDoc.sites.map((s, i) => ({ ...s, n: i + 1 }));

function realSeries(id) {
  const meta = JSON.parse(fs.readFileSync(path.join(web, "data/sites", id + ".json"), "utf8"));
  const b = fs.readFileSync(path.join(web, "data/sites", id + ".bin"));
  return new SiteSeries(meta, decodeSeries(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), meta.series.count));
}
const A = realSeries(sites[0].id), B = realSeries(sites[1].id);
const START = sitesDoc.series_window.start_utc, T0 = Date.parse(START) + 24 * 3600e3 * 100, ISO0 = new Date(T0).toISOString();

// Minimal JSON-schema check (the subset api/openapi.json uses for these two requests): required, additionalProperties:false, types, bounds, items, formats.
function validate(schema, v, at = "$") {
  if (schema.$ref) return validate(spec.components.schemas[schema.$ref.split("/").pop()], v, at);
  const errs = [], types = [].concat(schema.type || []);
  const is = { string: x => typeof x === "string", number: x => typeof x === "number" && Number.isFinite(x), integer: Number.isInteger, boolean: x => typeof x === "boolean",
    array: Array.isArray, object: x => x && typeof x === "object" && !Array.isArray(x), null: x => x === null };
  if (types.length && !types.some(ty => is[ty](v))) return [`${at}: expected ${types}`];
  if (schema.format === "date-time" && !(Number.isFinite(Date.parse(v)) && /(Z|[+-]\d\d:\d\d)$/.test(v))) errs.push(`${at}: not RFC3339`);
  if (schema.exclusiveMinimum != null && !(v > schema.exclusiveMinimum)) errs.push(`${at}: <= ${schema.exclusiveMinimum}`);
  if (schema.minimum != null && v < schema.minimum) errs.push(`${at}: < ${schema.minimum}`);
  if (schema.maximum != null && v > schema.maximum) errs.push(`${at}: > ${schema.maximum}`);
  if (Array.isArray(v)) {
    if (schema.minItems != null && v.length < schema.minItems) errs.push(`${at}: too few items`);
    if (schema.maxItems != null && v.length > schema.maxItems) errs.push(`${at}: too many items`);
    if (schema.uniqueItems && new Set(v).size !== v.length) errs.push(`${at}: duplicates`);
    if (schema.items) v.forEach((x, i) => errs.push(...validate(schema.items, x, `${at}[${i}]`)));
  } else if (is.object(v) && schema.properties) {
    for (const k of schema.required || []) if (!(k in v)) errs.push(`${at}: missing ${k}`);
    for (const k of Object.keys(v)) { if (!schema.properties[k]) { if (schema.additionalProperties === false) errs.push(`${at}: unknown field ${k}`); } else errs.push(...validate(schema.properties[k], v[k], `${at}.${k}`)); }
  }
  return errs;
}
const check = (name, body) => validate({ $ref: "#/components/schemas/" + name }, body);

// ---- AUD-04
test("AUD-04: POST /api/compare body follows CompareRequest; the old {sites,start,hours} is rejected by the same check", () => {
  assert.deepEqual(check("CompareRequest", compareBody({ siteIds: [sites[0].id, sites[1].id], startIso: ISO0, hours: 336 })), []);
  assert.notDeepEqual(check("CompareRequest", { sites: [sites[0].id], start: ISO0, hours: 336 }), [], "the validator must reject the old body");
  const b = compareBody({ siteIds: [sites[0].id, sites[0].id, "b", "c", "d"], startIso: "2027-03-14T06:00:00+00:00", hours: 24 });
  assert.deepEqual(b.site_ids, [sites[0].id, "b", "c"]); // unique, at most 3
  assert.equal(b.start_utc, "2027-03-14T06:00:00.000Z");
  assert.equal(compareBody({ siteIds: [], startIso: ISO0, hours: 24 }), null);
  assert.equal(compareBody({ siteIds: ["a"], startIso: "not a date", hours: 24 }), null);
  assert.equal(compareBody({ siteIds: ["a"], startIso: ISO0, hours: 0 }), null);
});
test("AUD-04: offline, 422 and partial answers are told apart and carry no number", () => {
  assert.deepEqual(compareOutcome(null), { state: "skipped", unavailable: [] });
  assert.equal(compareOutcome({ ok: false, offline: true, error: "x" }).state, "offline");
  const r = compareOutcome({ ok: false, offline: false, error: "HTTP 422" });
  assert.equal(r.state, "rejected"); assert.equal(r.error, "HTTP 422");
  assert.equal(compareOutcome({ ok: true, data: { results: [{ site: { id: "a" }, data_status: "AVAILABLE" }] } }).state, "ok");
  const p = compareOutcome({ ok: true, data: { results: [{ site: { id: "a" }, data_status: "AVAILABLE" }, { site: { id: "b" }, data_status: "NO_SERIES_DATA" }] } });
  assert.deepEqual([p.state, p.unavailable], ["partial", ["b"]]);
  assert.equal(compareOutcome({ ok: true, data: {} }).state, "partial");
});

// ---- AUD-05 / 08 / 09 through computePlan
const entries = (hours = 336) => [{ site: sites[0], start: ISO0, hours, series: A }, { site: sites[1], start: ISO0, hours, series: B }, { site: sites[1], start: new Date(T0 + 2 * hours * 3600e3).toISOString(), hours, series: B }];
const RULES = { ...PLAN_DEFAULTS };
function fakeCall(log, timeline) {
  return async (p, o) => {
    log.push({ p, body: o.body });
    if (p !== "/api/onboard/site-evaluate") return { ok: false, offline: false, error: "HTTP 404" };
    const errs = check("SiteOnboardRequest", o.body);
    if (errs.length) return { ok: false, offline: false, error: "HTTP 422 " + errs.join("; ") };
    return { ok: true, data: { onboard: { science_status: "SYNTHETIC", inputs_sha256: "x", options: [{ timeline: timeline.map(c => ({ charge_wh: c })) }] } } };
  };
}
test("AUD-05: site-evaluate gets the full envelope; the battery margin is derived from the declared profile and the floor rule", async () => {
  const log = [];
  const reserve = H1_PROFILE.battery_capacity_wh * RULES.battery / 100, low = reserve + 3 * H1_PROFILE.load_w;
  const calc = await computePlan({ status: sitesDoc.science_status, entries: entries(), rules: RULES, power: { ...H1_PROFILE }, call: fakeCall(log, [low + 1000, low, low + 500]), run: runScenario });
  assert.equal(log.length, 3);
  for (const c of log) {
    assert.equal(c.p, "/api/onboard/site-evaluate");
    assert.deepEqual(check("SiteOnboardRequest", c.body), []);
    for (const k of ["mission_id", "start_utc", "duration_hours", "candidates", "power", "max_comm_blackout_hours"]) assert.ok(k in c.body, k);
    assert.equal(c.body.power.reserve_wh, reserve); // floor % of the declared capacity
    assert.deepEqual(c.body.power.solar_generation_w, H1_PROFILE.solar_generation_w);
  }
  assert.deepEqual(log[0].body, siteEvaluateBody({ siteId: sites[0].id, startIso: ISO0, hours: 336, power: { ...H1_PROFILE, reserve_wh: reserve }, maxBlackoutH: RULES.blackout, delayH: 0 }));
  const bat = calc.rows.find(r => r.id === "battery");
  assert.deepEqual(bat.vals, [3, 3, 3]); // (lowest charge - floor) / load
  assert.equal(bat.status, "SYNTHETIC"); assert.equal(bat.margin, 3);
});
test("AUD-05: when the API says no, the battery row is null with no seal state (never 0, never a fake SIM)", async () => {
  const failing = async () => ({ ok: false, offline: false, error: "HTTP 422" });
  const calc = await computePlan({ status: sitesDoc.science_status, entries: entries(), rules: RULES, power: { ...H1_PROFILE }, call: failing, run: runScenario });
  const bat = calc.rows.find(r => r.id === "battery");
  assert.deepEqual(bat.vals, [null, null, null]); assert.equal(bat.status, null); assert.equal(bat.margin, null);
  const log = []; // offline: no call at all
  const off = await computePlan({ status: "x", entries: entries(), rules: RULES, power: { ...H1_PROFILE }, call: fakeCall(log, [1]), run: runScenario, online: false });
  assert.equal(log.length, 0); assert.deepEqual(off.rows.find(r => r.id === "battery").vals, [null, null, null]);
  assert.equal(batteryMarginH([], 1, 1), null); assert.equal(batteryMarginH([5, 4], 1, 0), null); assert.equal(batteryMarginH(null, 1, 1), null);
  assert.equal(batteryMarginH([10, 4], 6, 2), -1); // floor breached stays negative
});
test("AUD-08: slope and roughness are null + N/D with the real sites; mast, sun mode are informational, step is applied", async () => {
  assert.ok(sites.every(s => s.metrics?.slope_deg == null), "no real site has slope_deg");
  const calc = await computePlan({ status: sitesDoc.science_status, entries: entries(), rules: RULES, power: { ...H1_PROFILE }, call: async () => ({ ok: false, offline: true }), run: runScenario, online: false });
  for (const id of ["slope", "rough"]) { const r = calc.rows.find(x => x.id === id); assert.deepEqual(r.vals, [null, null, null], id); assert.equal(r.margin, null); assert.notEqual(r.status, sitesDoc.science_status); }
  assert.equal(calc.hasSlopeData, false);
  assert.deepEqual({ ...ruleEffects({ hasSlopeData: calc.hasSlopeData }) }, { night: "applied", blackout: "applied", battery: "applied", step: "applied", mast: "info", sunMode: "info", slope: "info" });
  assert.equal(ruleEffects({ hasSlopeData: true }).slope, "applied");
  // when a site does carry slope, the rule is honoured
  const withSlope = await computePlan({ status: "S", entries: entries(), rules: { ...RULES, slope: 5 }, power: { ...H1_PROFILE }, call: async () => ({ ok: false }), run: runScenario, online: false, slopeOf: s => (s.id === sites[0].id ? 4 : 9) });
  const sl = withSlope.rows.find(r => r.id === "slope");
  assert.deepEqual(sl.vals, [4, 9, 9]); assert.equal(sl.margin, 5 - 9); assert.equal(violates(sl, 9), true); assert.equal(violates(sl, 4), false);
  assert.equal(seriesStepH(A), 1); assert.equal(observerHeightM(A), A.meta.site.observer_height_m);
});
test("AUD-08: the calculation step is honoured: 3 h samples are a subset of the hourly run and equal SiteSeries.window() at the series step", () => {
  for (const [S] of [[A], [B]]) {
    const w = S.window(T0, 336), m = strideMetrics(S, T0, 336, 1);
    assert.equal(m.longestDarkH, w.longestDarkH); assert.equal(m.longestBlackoutH, w.longestBlackoutH);
    assert.ok(Math.abs(m.sunPct - w.sunPct) < 1e-9 && Math.abs(m.earthPct - w.earthPct) < 1e-9);
  }
  const m3 = strideMetrics(A, T0, 336, 3);
  assert.equal(m3.samples, 112); assert.equal(m3.longestDarkH % 3, 0); assert.equal(m3.longestBlackoutH % 3, 0);
  assert.equal(strideMetrics(A, T0, 336, 1.5), null, "a step that is not a multiple of the series step cannot be honoured");
  assert.equal(strideMetrics(A, T0 - 1e15, 336, 1), null, "outside the series");
  assert.equal(strideMetrics(A, T0 + 30 * 60 * 1000, 336, 1), null, "off-grid starts must not silently shift a lunar window");
  assert.equal(hourlyRows(A, T0 + 30 * 60 * 1000, 336, 1), null, "exports must reject the same shifted window");
});
test("AUD-09: uncertainty is the grid resolution of the real step and window; unknown = null; no fixed constant", async () => {
  const run = async (step, hours) => (await computePlan({ status: "S", entries: entries(hours), rules: { ...RULES, step }, power: { ...H1_PROFILE }, call: async () => ({ ok: false }), run: runScenario, online: false })).rows;
  const r1 = await run(1, 336), r3 = await run(3, 336), r1s = await run(1, 168);
  const unc = (rows, id) => rows.find(r => r.id === id).unc;
  assert.deepEqual(unc(r1, "night"), { unit: "h", value: 1 }); assert.deepEqual(unc(r3, "night"), { unit: "h", value: 3 });
  assert.ok(Math.abs(unc(r1, "sun").value - 100 / 336) < 1e-9); assert.ok(Math.abs(unc(r3, "sun").value - 100 / 112) < 1e-9);
  assert.ok(Math.abs(unc(r1s, "sun").value - 100 / 168) < 1e-9, "follows the window length");
  const none = await computePlan({ status: "S", entries: entries().map(e => ({ ...e, series: null })), rules: RULES, power: { ...H1_PROFILE }, call: async () => ({ ok: false }), run: runScenario, online: false });
  assert.equal(unc(none.rows, "night").value, null); assert.equal(unc(none.rows, "sun").value, null);
  assert.deepEqual(none.rows.find(r => r.id === "night").vals, [null, null, null]); assert.equal(none.rows.find(r => r.id === "night").status, null);
  assert.equal(gridUncertainty("h", null), null); assert.equal(gridUncertainty("pct", 1, 0), null);
  const src = read("screens/plan.tsx");
  assert.doesNotMatch(src, /unc:\s*"±/); assert.doesNotMatch(src, /±1|±0\.3/);
});

// ---- AUD-06
test("AUD-06: windowMetrics().series is a SiteSeries (no .slice); the export reads the real hourly rows from it", () => {
  assert.equal(typeof A.slice, "undefined", "the old (m.series||[]).slice(0,48) threw a TypeError on this shape");
  const rows = hourlyRows(A, T0, 336, 1);
  assert.equal(rows.length, 336);
  const w = A.window(T0, 336), sun = rows.filter(r => r.sun_visible).length;
  assert.ok(Math.abs(100 * sun / 336 - w.sunPct) < 1e-9, "rows agree with the window metrics");
  assert.equal(rows[0].utc, ISO0); assert.equal(rows[1].offset_h, 1);
  assert.equal(typeof rows[5].sun_margin_deg, "number"); assert.equal(hourlyRows(A, T0, 336, 3).length, 112);
});
test("AUD-06: CSV has header + units, one row per hour, and an N/D row with a note when there is no series (no throw)", () => {
  const sc = [{ siteId: "a", siteName: 'Name, "quoted"', start: ISO0, hours: 336, rows: hourlyRows(A, T0, 336, 1) }, { siteId: "b", siteName: "B", start: ISO0, hours: 336, rows: null }];
  const csv = csvDocument({ scenarios: sc, stepH: 1, status: "PRELIMINARY", nd: "N/D", warning: "no series" });
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], CSV_HEADER.join(",")); assert.match(lines[0], /sun_margin_deg/); assert.match(lines[0], /_utc/);
  assert.equal(lines.length, 1 + 336 + 1);
  assert.match(lines[1], /^A,a,"Name, ""quoted""",/);
  assert.match(lines.at(-1), /^B,b,B,.*,N\/D,N\/D,N\/D,N\/D,N\/D,N\/D,N\/D,no series$/);
  assert.doesNotThrow(() => csvDocument({ scenarios: [{ siteId: "a", siteName: "n", start: "", hours: 1, rows: undefined }], stepH: null, status: null, warning: "w" }));
});
test("AUD-06: JSON export carries the same hourly series and a warning (series:null) when absent", () => {
  const rows = [{ id: "night", unit: "h", vals: [1, 2, 3], limit: null, margin: null, unc: { unit: "h", value: 1 }, status: "S" }];
  const j = jsonDocument({ rules: RULES, effects: ruleEffects(), power: { ...H1_PROFILE }, rows, calcStepH: 1, seriesStep: 1, status: "S", version: null, link: "l", generatedAt: "t", warning: "w",
    scenarios: [{ siteId: "a", siteName: "A", start: ISO0, hours: 336, rows: hourlyRows(A, T0, 336, 1), sha256: "x" }, { siteId: "b", siteName: "B", start: ISO0, hours: 336, rows: null }] });
  assert.equal(j.scenarios[0].series.length, 336); assert.equal(j.scenarios[0].warning, null);
  assert.equal(j.scenarios[1].series, null); assert.equal(j.scenarios[1].warning, "w");
  assert.equal(j.rules.effect.mast, "info"); assert.equal(j.rules.label, "assumed limit"); assert.equal(j.version, null);
  assert.doesNotThrow(() => JSON.stringify(j));
});

// ---- AUD-07
test("AUD-07: the passport is an escaped, self-contained printable page with rules, rows, origin, version and limits (no VAL, no network)", () => {
  const html = passportHtml({ lang: "pt-BR", version: "abc1234", link: "http://x/?a=1&b=<2>", generatedAt: "2026-11-14T00:00:00Z", origin: "PRE · PRELIMINARY", limits: ["limite <um>"],
    L: { title: "Passaporte <b>", how: "como", print: "Imprimir / salvar como PDF", version: "Versão", generated: "Gerado", origin: "Origem", link: "Link", rules: "Regras", value: "Valor", effect: "Efeito", scenarios: "Cenários", limits: "Limites",
      colMetric: "Métrica", colUnit: "Unid.", colRule: "Regra", colMargin: "Margem B", colUnc: "Incerteza", colOrigin: "Origem" },
    rules: [{ label: "Noite máxima", value: "60 h", effect: "aplicada" }, { label: "Mastro", value: "2 m", effect: "sem efeito" }],
    columns: [{ head: "A", sub: "1 · X" }, { head: "B", sub: "2 · Y" }],
    rows: [{ label: "Maior noite", unit: "h", cells: ["10", "—"], rule: "≤ 60", margin: "—", unc: "±1", seal: "PRE" }] });
  assert.match(html, /^<!doctype html>/i); assert.match(html, /@media print/); assert.match(html, /Imprimir \/ salvar como PDF/);
  for (const s of ["Noite máxima", "Mastro", "Maior noite", "abc1234", "PRE · PRELIMINARY", "≤ 60", "±1"]) assert.ok(html.includes(s), s);
  assert.ok(!html.includes("<b>") && html.includes("&lt;b&gt;") && html.includes("&lt;2&gt;") && html.includes("limite &lt;um&gt;"));
  assert.doesNotMatch(html, /\bVAL\b/); assert.doesNotMatch(html, /https?:\/\/(?!x\/)/); assert.doesNotMatch(html, /<script|<link|<img/i);
});
test("AUD-07: the button prints through a local window (no PDF service, no evidence &print=1) and says print / save as PDF", () => {
  const js = read("screens/plan.tsx");
  assert.doesNotMatch(js, /print=1/); assert.match(js, /window\.open\(""/); assert.match(js, /\.print\(\)/); assert.match(js, /passportHtml\(/);
  assert.match(js, /"plan\.print": "Print \/ save as PDF"/); assert.match(js, /"plan\.print": "Imprimir \/ salvar como PDF"/);
  assert.doesNotMatch(js, /PDF Passport|Passaporte PDF/);
  assert.doesNotMatch(read("designer/K1-kit-planning.designer.mds"), /Passaporte PDF/);
});

// ---- AUD-16
test("AUD-16: scenarios are the ones Compare derives (hash, else first site / second site / second site two windows later)", () => {
  const ids = sites.map(s => s.id), W = sitesDoc.series_window.start_utc;
  const d = compareScenarios({ hash: "", sites, start: null, hours: 336, windowStart: W });
  assert.deepEqual(d.map(s => s.site), [ids[0], ids[1], ids[1]]);
  assert.equal(d[0].start, W); assert.equal(d[2].start, new Date(Date.parse(W) + 2 * 336 * 3600e3).toISOString());
  assert.notDeepEqual(d.map(s => s.site), ids.slice(0, 3), "no longer the first three sites");
  const h = compareScenarios({ hash: `#sc=${ids[3]}~2026-01-01T00:00:00Z~48,nope~x~1,${ids[2]}`, sites, start: "2027-01-01T00:00:00Z", hours: 24, windowStart: W });
  assert.deepEqual(h, [{ site: ids[3], start: "2026-01-01T00:00:00Z", hours: 48 }, { site: ids[2], start: "2027-01-01T00:00:00Z", hours: 24 }]);
  const js = read("screens/plan.tsx");
  assert.doesNotMatch(js, /doc\.sites\.slice\(0,\s*3\)/); assert.match(js, /compareScenarios\(/);
  assert.doesNotMatch(js, /stays saved|fica salvo/);
  assert.match(js, /Nothing is saved: the link below reopens the calculation/); assert.match(js, /Nada é salvo: o link abaixo reabre o cálculo/);
});
