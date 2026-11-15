import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyFault, FAULTS, H1_PROFILE, siteEvaluateBody, evaluateBody, chargeTrace, runScenario, nextChange, countSunrises, dailyFractions,
  autonomyHours, fmtDuration, evaluateRules, rulesMet, clockLabel, hourIndex } from "../screens/cockpit-model.js";

const power = { ...H1_PROFILE, reserve_wh: 6000 };
const samples = Array.from({ length: 6 }, (_, i) => ({ sun_visible: i % 2 === 0, earth_visible: true }));

test("each fault changes only what it says", () => {
  const p = applyFault("panel", { power, samples, delayH: 0 }); assert.equal(p.power.solar_generation_w, power.solar_generation_w * 0.5); assert.equal(p.power.load_w, power.load_w);
  const b = applyFault("battery", { power, samples, delayH: 0 }); assert.equal(b.power.battery_capacity_wh, power.battery_capacity_wh * 0.8);
  assert.ok(b.power.initial_charge_wh <= b.power.battery_capacity_wh);
  assert.equal(applyFault("delay", { power, samples, delayH: 0 }).delayH, 24);
  assert.ok(applyFault("antenna", { power, samples, delayH: 0 }).samples.every(s => !s.earth_visible));
  assert.deepEqual(applyFault(null, { power, samples, delayH: 0 }).power, power);
  assert.deepEqual(Object.keys(FAULTS).sort(), ["antenna", "battery", "delay", "panel"]);
});
test("a fault never mutates the input", () => { const s0 = JSON.stringify(samples); applyFault("antenna", { power, samples, delayH: 0 }); assert.equal(JSON.stringify(samples), s0); });
test("request bodies match the OpenAPI shapes", () => {
  const a = siteEvaluateBody({ siteId: "x", startIso: "2025-01-01T00:00:00Z", hours: 24, power, maxBlackoutH: 12, delayH: 24 });
  assert.deepEqual(Object.keys(a).sort(), ["candidates", "duration_hours", "max_comm_blackout_hours", "mission_id", "power", "start_utc"]);
  assert.equal(a.candidates[0].delay_hours, 24);
  const b = evaluateBody({ siteId: "x", startIso: "2025-01-01T00:00:00Z", power, maxBlackoutH: 12, samples });
  assert.equal(b.candidates[0].samples.length, samples.length); assert.deepEqual(Object.keys(b.candidates[0].samples[0]).sort(), ["earth_visible", "sun_visible"]);
});
test("charge trace comes only from the API timeline; no timeline → null, never zeros", () => {
  assert.deepEqual(chargeTrace({ timeline: [{ charge_wh: 5 }, { charge_wh: 4 }] }, 9), [9, 5, 4]);
  assert.equal(chargeTrace({ timeline: [] }, 9), null); assert.equal(chargeTrace(null, 9), null); assert.equal(chargeTrace({ timeline: [{ charge_wh: NaN }] }, 9), null);
});
test("runScenario: site route, fallback to evaluate, and offline → no invented charge", async () => {
  const tl = { options: [{ timeline: [{ charge_wh: 1 }] }], science_status: "UNVERIFIED_INPUTS", inputs_sha256: "s" };
  const args = { siteId: "x", startIso: "2025-01-01T00:00:00Z", hours: 1, power, maxBlackoutH: 1, samples, delayH: 0 };
  const calls = [];
  const okSite = async (p) => { calls.push(p); return { ok: true, data: { onboard: tl } }; };
  const r1 = await runScenario(okSite, args); assert.equal(r1.route, "site"); assert.deepEqual(calls, ["/api/onboard/site-evaluate"]);
  const calls2 = []; const fb = async (p) => { calls2.push(p); return p.endsWith("site-evaluate") ? { ok: false, error: "HTTP 422" } : { ok: true, data: tl }; };
  const r2 = await runScenario(fb, args); assert.equal(r2.route, "eval"); assert.deepEqual(calls2, ["/api/onboard/site-evaluate", "/api/onboard/evaluate"]);
  const r3 = await runScenario(async () => ({ ok: false, offline: true, error: "x" }), args); assert.equal(r3.ok, false); assert.equal(r3.trace, undefined);
});
test("next change, sunrises and daily fractions come from the margins", () => {
  const m = [1, 1, -1, -1, -1, 1, 1];
  assert.deepEqual(nextChange(m, 0, m.length), { visible: true, inHours: 2, lastsHours: 3 });
  assert.deepEqual(nextChange(m, 2, m.length), { visible: false, inHours: 3, lastsHours: null });
  assert.equal(nextChange(m, 99, m.length), null);
  assert.equal(countSunrises(m, 0, m.length), 1);
  assert.deepEqual(dailyFractions(Array(30).fill(1).concat(Array(18).fill(-1)), 0, 48), [1, 6 / 24]);
  assert.deepEqual(dailyFractions([1, 1], 100, 24), [null]);
});
test("autonomy and formatting give — without inputs", () => {
  assert.equal(autonomyHours(10000, 6000, 500), 8); assert.equal(autonomyHours(null, 6000, 500), null); assert.equal(autonomyHours(1, 6000, 500), 0); assert.equal(autonomyHours(1, 1, 0), null);
  assert.equal(fmtDuration(null), "—"); assert.equal(fmtDuration(30), "1 d 6 h"); assert.equal(fmtDuration(5), "5 h");
  assert.equal(clockLabel(Date.UTC(2026, 0, 1), 26).text, "D02 02:00");
});
test("rules: no input → nodata (never pass); cold is always nodata/N/D", () => {
  const rs = evaluateRules({ lightStatus: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", trace: null, capacityWh: null, light: {} });
  assert.ok(rs.every(r => r.status === "nodata")); assert.equal(rs.find(r => r.id === "cold").seal, "N/D");
  const ok = evaluateRules({ lightStatus: "PRELIMINARY_X", trace: [100, 90, 80], capacityWh: 100, light: { longestDarkH: 10, longestBlackoutH: 5, sunrises: 3 } });
  assert.equal(ok.find(r => r.id === "floor").status, "pass"); assert.equal(ok.find(r => r.id === "night").seal, "PRE"); assert.equal(ok.find(r => r.id === "floor").seal, "SIM");
  const bad = evaluateRules({ lightStatus: "PRELIMINARY_X", trace: [100, 20], capacityWh: 100, light: { longestDarkH: 61, longestBlackoutH: 73, sunrises: 1 } });
  for (const id of ["floor", "night", "blackout", "sunrises"]) assert.equal(bad.find(r => r.id === id).status, "risk", id);
  assert.deepEqual(rulesMet(bad), { ok: 0, of: 6 });
});
test("rules never carry VAL unless the origin says VALIDATED", () => {
  assert.ok(evaluateRules({ lightStatus: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", trace: [1], capacityWh: 1, light: { longestDarkH: 1, longestBlackoutH: 1, sunrises: 5 } }).every(r => r.seal !== "VAL"));
  assert.equal(evaluateRules({ lightStatus: "VALIDATED", trace: null, capacityWh: null, light: { longestDarkH: 1 } }).find(r => r.id === "night").seal, "VAL");
});
test("cockpit screen: literals are limited, seals by origin, texts in both languages", async () => {
  const js = await readFile(new URL("../screens/cockpit.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(js, /["']VAL["']/); assert.doesNotMatch(js, /\bvalidated\b/i);
  assert.match(js, /"\/api\/sites\/|\/api\/sites\/\$\{/); assert.match(js, /next_transitions|hours_from_start/);
  assert.doesNotMatch(js, /\.\.\/onboard\//, "the onboard panel is archived (MoonProof-only product)");
  assert.match(js, /api\(/);
  const html = await readFile(new URL("../cockpit.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\.\.\/onboard\//); assert.doesNotMatch(html, /\b\d{2,}\s?%/);
});

test("the clock is a whole hour, so the hourly charge trace never reads a fraction (bug seen while playing at 6 h/s)", () => {
  const trace = [90, 91, 92, 93];
  for (const t of [0, 0.6, 8.999999999999998, 9, 2.5]) { const i = hourIndex(t, 3); assert.ok(Number.isInteger(i)); assert.ok(trace[Math.min(i, trace.length - 1)] != null, String(t)); }
  assert.equal(hourIndex(8.999999999999998, 100), 9); assert.equal(hourIndex(200, 100), 100); assert.equal(hourIndex(NaN, 5), 0); assert.equal(hourIndex(-3, 5), 0);
});
