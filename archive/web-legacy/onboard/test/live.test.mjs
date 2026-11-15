// Commits 2-4: API number when it exists, sealed SYNTHETIC when not; badges from the API; absent = "—".
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const L = require("../live.js");
const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const compare = { results: [{ data_status: "AVAILABLE", science_status: "SYNTHETIC", engine_science_status: "UNVERIFIED_INPUTS",
  evaluation: { metrics: { sample_count: 720, step_hours: 1, sun_visible_fraction: 0.502778, earth_visible_fraction: 0.5125, longest_continuous_dark_hours: 224, longest_continuous_comm_gap_hours: 351 },
    series: [{ epoch_utc: "2026-12-01T00:00:00Z", sun_visible: false, earth_visible: true, sun_margin_deg: -0.3, earth_margin_deg: 4.7 }] } }] };

test("headline numbers come from the API metrics (same as curl /api/compare)", () => {
  const s = L.summaryFromMetrics(L.liveFromCompare(compare).metrics);
  assert.equal(s.darkH, 224); assert.equal(s.blockH, 351); assert.equal(s.durationH, 720);
  assert.equal(Math.round(s.sunlitH), 362); assert.equal(Math.round(s.earthH), 369);
});

test("no series / NO_SERIES_DATA / missing metrics => null (UI falls back to the sealed local model)", () => {
  assert.equal(L.liveFromCompare(null), null);
  assert.equal(L.liveFromCompare({ results: [{ data_status: "NO_SERIES_DATA" }] }), null);
  assert.equal(L.summaryFromMetrics({}), null);
});

test("seal text: API shows science_status and rate_source, local says SYNTHETIC · browser model", () => {
  assert.match(L.seal("api", { science_status: "SYNTHETIC" }), /^API · SYNTHETIC$/);
  assert.match(L.seal("api", { science_status: "SYNTHETIC", rate_source: "NASA-STD" }), /rate_source: NASA-STD/);
  assert.equal(L.seal("local"), "SYNTHETIC · browser model");
  assert.equal(L.seal("nosource"), "illustrative · no source");
});

test("absent value is an em dash, a real 0 stays 0", () => {
  for (const v of [undefined, null, NaN, Infinity, "x"]) assert.equal(L.num(v), "—");
  assert.equal(L.num(0, 0), "0");
});

test("sky: 404 => null (local model); 200 => horizon interpolation with wrap-around", () => {
  assert.equal(L.skyFromResponse({ ok: false, status: 404, error: "404 page not found" }), null);
  const sky = L.skyFromResponse({ ok: true, data: { science_status: "SYNTHETIC", terrain_horizon: [{ azimuth_deg: 0, elevation_deg: 1 }, { azimuth_deg: 90, elevation_deg: 3 }, { azimuth_deg: 270, elevation_deg: 1 }], samples: [{ epoch_utc: "x" }] } });
  assert.equal(sky.horizon(45), 2); assert.equal(sky.horizon(315), 1); assert.equal(sky.horizon(360), 1);
});

test("delay rows carry the API admissible flag and breached criteria", () => {
  const r = L.delayRow({ delay_hours: 24, kind: "delay", science_status: "SYNTHETIC", admissible: false, metrics: { longest_continuous_dark_hours: 224, longest_continuous_comm_gap_hours: 351 }, breached: [{ criterion: "longest_continuous_dark_hours", value: 224, comparator: "<=", limit: 30, unit: "h" }] });
  assert.equal(r.admissible, false); assert.equal(r.darkH, 224); assert.match(r.breached[0], /224 <= 30 h/);
});

test("badges: read from readyz/capabilities; permanent no-flight chip; offline says browser model only", () => {
  const on = L.badges({ apiUp: true, readyz: { status: "ready", science_status: "UNVERIFIED_INPUTS" }, capabilities: { scientifically_validated: false, nasa_lola_loaded: false, naif_spice_loaded: false }, seriesStatus: "SYNTHETIC" });
  const t = on.map(b => b.text).join(" | ");
  assert.match(t, /readyz: ready/); assert.match(t, /science: UNVERIFIED_INPUTS/); assert.match(t, /validated: false/); assert.match(t, /LOLA not loaded/); assert.match(t, /series: SYNTHETIC/);
  assert.equal(on[on.length - 1].text, "No flight recommendation");
  const off = L.badges({ apiUp: false });
  assert.deepEqual(off.slice(0, 2).map(b => b.text), ["PROTÓTIPO · sintético", "Não validado"]); // permanent chips, also after the script replaces the static ones (CI e2e reads "Não validado")
  assert.match(off[2].text, /browser model only/); assert.equal(off[off.length - 1].text, "No flight recommendation");
});

test("cockpit.html: static chips are only a fallback inside #badges; cockpit.js replaces them from the API", () => {
  const h = src("cockpit.html");
  // main's test 133 needs the three honest chips in the served HTML; they sit INSIDE #badges, which renderBadges() replaces.
  const box = h.slice(h.indexOf('id="badges"'), h.indexOf('id="lamp-api"'));
  for (const t of ["PROTÓTIPO · sintético", "Não validado", "Sem recomendação de voo"]) {
    assert.ok(box.includes(t), t); assert.equal(h.split(t).length - 1, 1, t + " only once, inside #badges");
  }
  assert.match(src("cockpit.ts"), /box\.replaceChildren\(\.\.\.L\.badges/);
  assert.ok(h.includes('id="badges"') && h.indexOf("live.js") < h.indexOf("cockpit.js"));
});

test("cockpit.js: model numbers are sealed, fuel never drives alarms or verdicts, no literal 0 for absent", () => {
  const c = src("cockpit.ts");
  assert.ok(/L\.summaryFromMetrics/.test(c) && /OnboardApi\.scenarioDelay/.test(c) && /OnboardApi\.sky/.test(c));
  assert.ok(!/M\.violations\([^)]*life\)/.test(c), "fuel (life) must not feed violations");
  assert.ok(!/life\.fuelMarginKg/.test(c), "fuel margin is not used anywhere");
  assert.ok(!/: "0", "kg"/.test(c), "gauge must not write a literal 0");
  assert.ok(/404 page not found/.test(c), "sky route detection");
});

test("dev-server proxies the badge routes (/readyz, /v1/capabilities) as well as /api/*", () => {
  // The onboard is served by the shared web/dev-server.mjs (the Python dev-server.py was removed).
  const p = readFileSync(new URL("../../dev-server.mjs", import.meta.url), "utf8");
  assert.ok(/pathname\.startsWith\("\/api\/"\)/.test(p) && /pathname==="\/readyz"/.test(p) && /pathname==="\/v1\/capabilities"/.test(p));
});

// BR62: the browser-model track has no ms; stepOf used tr[1].ms - tr[0].ms => NaN => NaN bars.
test("stepOf: a track without ms falls back to the scenario step, never NaN", () => {
  const noMs = [{ i: 0, sun_visible: true }, { i: 1, sun_visible: false }, { i: 2, sun_visible: true }];
  assert.equal(L.stepOf(noMs, 120), 120);
  assert.equal(L.stepOf([], 60), 60);
  assert.equal(L.stepOf([{ ms: 0 }], 30), 30);
  assert.equal(L.stepOf([{ ms: 0 }, { ms: 3600e3 }], 120), 60);
});

test("stamp: browser-model samples get ms, so a daily bar count is finite", () => {
  const noMs = Array.from({ length: 6 }, (_, i) => ({ i, sun_visible: i % 2 === 0, earth_visible: true }));
  const tr = L.stamp(noMs, Date.parse("2026-12-01T00:00:00Z"), 240);
  assert.ok(tr.every(s => Number.isFinite(s.ms)));
  assert.equal(L.stepOf(tr, 999), 240);
  assert.equal(Math.round(24 * 60 / L.stepOf(tr, 999)), 6);
  assert.ok(!Number.isNaN(Math.round(24 * 60 / L.stepOf(noMs, 240))));
});

test("cockpit.js uses the shared stepOf/stamp, not tr[1].ms - tr[0].ms", () => {
  const c = src("cockpit.ts");
  assert.doesNotMatch(c, /tr\[1\]\.ms - tr\[0\]\.ms/);
  assert.match(c, /L\.stamp\(track\(0\)/);
});

