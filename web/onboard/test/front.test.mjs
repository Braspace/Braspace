// Run: node --test web/onboard/test/
// Unit tests for the synthetic generator and request validation.
// Integration test runs only when ONBOARD_API_URL is set (e.g. http://127.0.0.1:8080).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Sim = require("../sim.js");
const Req = require("../request.js");

const base = {
  id: "baseline",
  site_id: "synthetic-demo-a",
  start_utc: "2026-12-01T00:00:00Z",
  source_claim: "SYNTHETIC-NOT-NASA",
  step_minutes: 60,
  max_comm_blackout_hours: 1,
  power: { battery_capacity_wh: 200, initial_charge_wh: 150, reserve_wh: 50, solar_generation_w: 0, load_w: 80 }
};

function withSamples(c, count) {
  return { ...c, samples: Sim.generateSamples({ startUtc: c.start_utc, stepMinutes: c.step_minutes, count, siteId: c.site_id }) };
}

test("generateSamples returns requested count with both booleans", () => {
  const s = Sim.generateSamples({ startUtc: base.start_utc, stepMinutes: 60, count: 72, siteId: "synthetic-demo-a" });
  assert.equal(s.length, 72);
  for (const x of s) {
    assert.equal(typeof x.sun_visible, "boolean");
    assert.equal(typeof x.earth_visible, "boolean");
  }
});

test("generateSamples is deterministic for the same input", () => {
  const a = Sim.generateSamples({ startUtc: base.start_utc, stepMinutes: 30, count: 96, siteId: "synthetic-demo-b" });
  const b = Sim.generateSamples({ startUtc: base.start_utc, stepMinutes: 30, count: 96, siteId: "synthetic-demo-b" });
  assert.deepEqual(a, b);
});

test("72 h window has no synthetic daylight at any site (known limitation)", () => {
  for (const site of ["synthetic-demo-a", "synthetic-demo-b", "synthetic-demo-c"]) {
    const s = Sim.generateSamples({ startUtc: base.start_utc, stepMinutes: 60, count: 72, siteId: site });
    assert.equal(s.filter(x => x.sun_visible).length, 0, site);
  }
});

test("30-day window at 2 h step has both sun and darkness at site A", () => {
  const s = Sim.generateSamples({ startUtc: base.start_utc, stepMinutes: 120, count: 360, siteId: "synthetic-demo-a" });
  assert.ok(s.some(x => x.sun_visible) && s.some(x => !x.sun_visible), "sun should appear and disappear");
});

test("unknown site and invalid start are rejected by the generator", () => {
  assert.throws(() => Sim.generateSamples({ startUtc: base.start_utc, stepMinutes: 60, count: 2, siteId: "nao-existe" }));
  assert.throws(() => Sim.generateSamples({ startUtc: "não é data", stepMinutes: 60, count: 2, siteId: "synthetic-demo-a" }));
});

test("valid request with generated samples passes", () => {
  const r = Req.buildRequest("demo", [withSamples(base, 72)]);
  assert.equal(r.ok, true, r.errors.join("; "));
});

test("duration above 30 days is rejected", () => {
  const c = { ...base, step_minutes: 60, samples: new Array(721).fill({ sun_visible: false, earth_visible: false }) };
  const r = Req.buildRequest("demo", [c]);
  assert.equal(r.ok, false);
});

test("more than 480 samples is rejected", () => {
  const c = { ...base, step_minutes: 1, samples: new Array(481).fill({ sun_visible: false, earth_visible: false }) };
  assert.equal(Req.buildRequest("demo", [c]).ok, false);
});

test("blackout limit above scenario duration is rejected", () => {
  const c = { ...withSamples(base, 2), max_comm_blackout_hours: 5 };
  const r = Req.buildRequest("demo", [c]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes("bloqueio")));
});

test("charge above capacity and reserve above capacity are rejected", () => {
  const c = withSamples({ ...base, power: { ...base.power, initial_charge_wh: 300 } }, 2);
  assert.equal(Req.buildRequest("demo", [c]).ok, false);
  const d = withSamples({ ...base, power: { ...base.power, reserve_wh: 300 } }, 2);
  assert.equal(Req.buildRequest("demo", [d]).ok, false);
});

test("duplicate candidate ids are rejected", () => {
  const c = withSamples(base, 2);
  assert.equal(Req.buildRequest("demo", [c, { ...c }]).ok, false);
});

test("more than 8 candidates is rejected", () => {
  const list = Array.from({ length: 9 }, (_, i) => withSamples({ ...base, id: "c" + i }, 2));
  assert.equal(Req.buildRequest("demo", list).ok, false);
});

test("non-boolean visibility is rejected", () => {
  const c = { ...withSamples(base, 2), samples: [{ sun_visible: "sim", earth_visible: false }, { sun_visible: true, earth_visible: true }] };
  assert.equal(Req.buildRequest("demo", [c]).ok, false);
});

test("integration: API accepts the generated request (only when ONBOARD_API_URL is set)", { skip: !process.env.ONBOARD_API_URL }, async () => {
  const cands = [withSamples(base, 72), withSamples({ ...base, id: "alt", start_utc: "2026-12-03T00:00:00Z", power: { ...base.power, solar_generation_w: 110 } }, 72)];
  const r = Req.buildRequest("integration-test", cands);
  assert.equal(r.ok, true, r.errors.join("; "));
  const res = await fetch(process.env.ONBOARD_API_URL.replace(/\/$/, "") + "/api/onboard/evaluate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.body)
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  const body = JSON.parse(text);
  assert.equal(body.science_status, "UNVERIFIED_INPUTS");
  assert.equal(body.no_flight_recommendation, true);
  assert.equal(body.options.length, 2);
});
