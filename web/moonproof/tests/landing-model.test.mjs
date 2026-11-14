import test from "node:test";
import assert from "node:assert/strict";
import { createSim, stepFixed, DEFAULT_VEHICLE, MOON_R_REF } from "../../lab/physics.js";
import * as M from "../screens/landing-model.js";

function flat(h = 0) { return () => h; }
function fly(ctrl, { alt = 400, vz = -20 } = {}) {
  const sim = createSim({ pos: [0, 0, alt], vel: [0, 0, vz], terrain: flat(0), target: [0, 0], centreDistance: MOON_R_REF });
  for (let i = 0; i < 60 * 50 && !sim.outcome; i++) stepFixed(sim, ctrl(sim));
  return sim;
}
const info = (sim) => ({ n: 1, at: "x", site: "s", siteName: "S", siteN: 1, mode: "free", simTimeIso: "x", terrainStatus: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", sky: { sunMargin: 1, earthMargin: 1 }, fuelStartKg: DEFAULT_VEHICLE.fuelMass, g: M.localGravity(MOON_R_REF) });

test("brakeHeight grows with speed and is null when the engine cannot out-push gravity", () => {
  const ctx = { mass: 1500, g: 1.6 };
  assert.ok(M.brakeHeight(30, ctx) > M.brakeHeight(15, ctx));
  assert.equal(M.brakeHeight(30, { mass: 1e6, g: 1.6 }), null);
});
test("a free fall crashes and the rules say so; nothing passes by default", () => {
  const sim = fly(() => ({ throttle: 0 }));
  const a = M.buildAttempt(sim, info(sim));
  assert.equal(a.result, "CRASH");
  const rules = M.evaluateRules(a);
  assert.equal(rules.find(r => r.id === "soft").state, "fail");
  assert.equal(M.verdictKey(a, rules), "crash");
});
test("a controlled descent lands and its rules pass", () => {
  const sim = fly(s => { const alt = s.s[2], v = -s.s[5]; const need = (v * v - 0.5 * 0.5) / (2 * Math.max(alt - 2, 1)) + 1.62; return { throttle: alt < 200 && v > 0.5 ? Math.min(1, need * s.s[6] / s.vehicle.maxThrust) : 0 }; }, { alt: 300, vz: -12 });
  assert.equal(sim.outcome.result, "LANDED", JSON.stringify(sim.outcome));
  const a = M.buildAttempt(sim, info(sim)); const r = M.evaluateRules(a);
  assert.equal(r.find(x => x.id === "soft").state, "ok");
  assert.equal(r.find(x => x.id === "target").state, "ok");
});
test("missing data is nd, never a pass and never zero (integrity rule 1)", () => {
  const r = M.evaluateRules({ contact: null, limits: DEFAULT_VEHICLE.limits, sky: null, fuelEndKg: null, fuelStartKg: 0 });
  assert.ok(r.every(x => x.state === "nd" && x.value === null));
  assert.equal(M.rulesMet(r).met, 0);
  assert.equal(M.fuelFrac(NaN, 100), null);
  assert.equal(M.fuelSeconds({ throttle: 0, fuel: 10 }, DEFAULT_VEHICLE), null);
});
test("limits come from the vehicle, not from constants in the screen", () => {
  const a = { contact: { dist: 1, vVert: 3, vHor: 0, slope: 0 }, limits: { ...DEFAULT_VEHICLE.limits, maxVerticalSpeed: 5 }, zoneRadiusM: 18, sky: { sunMargin: 1, earthMargin: 1 }, fuelEndKg: 100, fuelStartKg: 100 };
  assert.equal(M.evaluateRules(a).find(r => r.id === "soft").state, "ok");
  a.limits.maxVerticalSpeed = 2;
  assert.equal(M.evaluateRules(a).find(r => r.id === "soft").state, "fail");
});
test("verdict: low fuel only when everything else holds", () => {
  const ok = { result: "LANDED" };
  const mk = (fuel, other) => [{ id: "fuel", state: fuel }, { id: "soft", state: other }];
  assert.equal(M.verdictKey(ok, mk("fail", "ok")), "lowfuel");
  assert.equal(M.verdictKey(ok, mk("ok", "ok")), "safe");
  assert.equal(M.verdictKey(ok, mk("ok", "fail")), "warn");
  assert.equal(M.verdictKey({ result: "HARD_LANDING" }, mk("ok", "ok")), "hard");
});
test("descent bars take the peak of each interval and keep the real peak", () => {
  const trace = Array.from({ length: 41 }, (_, i) => ({ t: i * 0.5, vz: -(i < 20 ? i : 40 - i) }));
  const { interval, bars } = M.descentBars(trace, 8);
  assert.ok(interval >= 0.5 && bars.length <= 9);
  assert.equal(Math.max(...bars.map(b => b.v)), 20);
  assert.deepEqual(M.descentBars([]), { interval: null, bars: [] });
});
test("guided step never goes back and needs a brake height", () => {
  assert.equal(M.guidedStep(900, 1000, 200, 1), 1);
  assert.equal(M.guidedStep(500, 1000, 200, 1), 2);
  assert.equal(M.guidedStep(100, 1000, 200, 2), 3);
  assert.equal(M.guidedStep(10, 1000, 200, 3), 4);
  assert.equal(M.guidedStep(900, 1000, 200, 3), 3);
});
test("alert: fast descent below the needed height is critical, slow descent is ok", () => {
  const ctx = { vehicle: DEFAULT_VEHICLE, mass: 1500, g: 1.62 };
  assert.equal(M.alertFor({ vz: -1, altitudeAGL: 50 }, ctx).level, "ok");
  assert.equal(M.alertFor({ vz: -30, altitudeAGL: 5 }, ctx).level, "crit");
  assert.equal(M.alertFor({ vz: -30, altitudeAGL: 5000 }, ctx).level, "ok");
});
test("attempts travel through sessionStorage and survive garbage", () => {
  const mem = new Map(); const st = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(M.lastAttempt(st), null);
  M.saveAttempt(st, { n: 1 }); M.saveAttempt(st, { n: 2 });
  assert.equal(M.lastAttempt(st).n, 2); assert.equal(M.loadAttempts(st).length, 2);
  mem.set(M.ATTEMPTS_KEY, "{not json"); assert.deepEqual(M.loadAttempts(st), []);
});
