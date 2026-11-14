import test from "node:test";
import assert from "node:assert/strict";
import { createSim, stepFixed, advance, specificEnergy, gravity, thrustFor, telemetry,
  DEFAULT_VEHICLE, MOON_MU, MOON_R_REF, G0 } from "../lab/physics.js";

const flat = (h = 0) => () => h;
const veh = (over = {}) => ({ ...DEFAULT_VEHICLE, ...over, limits: { ...DEFAULT_VEHICLE.limits, ...(over.limits || {}) } });
const run = (sim, control, seconds) => { const n = Math.round(seconds / sim.dt); for (let i = 0; i < n && !sim.outcome; i++) stepFixed(sim, control); return sim; };

test("gravity magnitude at the reference radius is mu/R^2 (~1.62 m/s^2)", () => {
  const g = gravity(0, 0, 0, MOON_R_REF);
  assert.ok(Math.abs(-g[2] - MOON_MU / MOON_R_REF ** 2) < 1e-12);
  assert.ok(Math.abs(-g[2] - 1.6242) < 1e-3);
});

test("free fall from rest matches the analytic near-surface solution", () => {
  const sim = createSim({ pos: [0, 0, 100], vel: [0, 0, 0] });
  run(sim, { throttle: 0 }, 5);
  const g = MOON_MU / MOON_R_REF ** 2;
  const expected = 100 - 0.5 * g * 25;
  assert.ok(Math.abs(sim.s[2] - expected) < 0.01, `z=${sim.s[2]} expected ${expected}`);
  assert.ok(Math.abs(sim.s[5] + g * 5) < 0.001);
});

test("specific mechanical energy is conserved without thrust (ballistic arc)", () => {
  const sim = createSim({ pos: [0, 0, 5000], vel: [300, -120, 50] });
  const e0 = specificEnergy(sim);
  run(sim, { throttle: 0 }, 60);
  const rel = Math.abs((specificEnergy(sim) - e0) / e0);
  assert.ok(rel < 1e-12, `relative energy drift ${rel}`);
});

test("constant vertical thrust gives a = T/m - g and mass falls as T/(Isp g0)", () => {
  const v = veh();
  const sim = createSim({ vehicle: v, pos: [0, 0, 1000], vel: [0, 0, 0] });
  const m0 = v.dryMass + v.fuelMass;
  run(sim, { throttle: 1 }, 10);
  const expectedMass = m0 - v.maxThrust * 10 / (v.isp * G0);
  assert.ok(Math.abs(sim.s[6] - expectedMass) < 1e-6, `m=${sim.s[6]} expected ${expectedMass}`);
  // Tsiolkovsky with gravity loss: dv = Isp g0 ln(m0/m1) - g t (g ~ constant over 1 km climb)
  const g = MOON_MU / (MOON_R_REF + (1000 + sim.s[2]) / 2) ** 2; // mean height of the climb
  const dv = v.isp * G0 * Math.log(m0 / sim.s[6]) - g * 10;
  assert.ok(Math.abs(sim.s[5] - dv) < 2e-3, `vz=${sim.s[5]} expected ${dv}`);
});

test("engine stops when propellant is exhausted and mass never drops below dry mass", () => {
  const v = veh({ fuelMass: 5 });
  const sim = createSim({ vehicle: v, pos: [0, 0, 5000], vel: [0, 0, 0] });
  run(sim, { throttle: 1 }, 30);
  assert.equal(sim.s[6], v.dryMass);
  assert.equal(thrustFor(sim, 1), 0);
  const vz = sim.s[5]; run(sim, { throttle: 1 }, 1);
  assert.ok(sim.s[5] < vz, "after burnout the lander only accelerates downward");
  assert.ok(Math.abs(sim.fuelUsed - 5) < 1e-9);
});

test("gentle touchdown on flat terrain is LANDED", () => {
  const sim = createSim({ pos: [0, 0, DEFAULT_VEHICLE.legDrop + 0.5], vel: [0, 0, -1.2], terrain: flat(0) });
  run(sim, { throttle: 0 }, 5);
  assert.equal(sim.outcome.result, "LANDED", JSON.stringify(sim.outcome));
});

test("fast impact on flat terrain is CRASH", () => {
  const sim = createSim({ pos: [0, 0, 50], vel: [0, 0, -10], terrain: flat(0) });
  run(sim, { throttle: 0 }, 10);
  assert.equal(sim.outcome.result, "CRASH");
});

test("slow touchdown on a 20° slope fails the slope limit", () => {
  const slope = Math.tan(20 * Math.PI / 180);
  const sim = createSim({ pos: [0, 0, DEFAULT_VEHICLE.legDrop + 0.6], vel: [0, 0, -1.0], terrain: (x) => slope * x });
  run(sim, { throttle: 0 }, 5);
  assert.equal(sim.outcome.result, "HARD_LANDING");
  assert.ok(sim.contact.slope > 19 && sim.contact.slope < 21, `slope ${sim.contact.slope}`);
});

test("leaving the modelled area ends the run honestly", () => {
  const sim = createSim({ pos: [0, 0, 500], vel: [200, 0, 0], terrain: flat(0), bounds: [-100, 100, -100, 100] });
  run(sim, { throttle: 0 }, 5);
  assert.equal(sim.outcome.result, "OUT_OF_MODELED_AREA");
});

test("same scenario and control log reproduce bit-identical states", () => {
  const plan = i => ({ throttle: (i % 97) / 96, tiltE: Math.sin(i / 50) * 0.2, tiltN: Math.cos(i / 70) * 0.1 });
  const go = () => { const s = createSim({ pos: [10, -20, 900], vel: [5, 2, -25], terrain: flat(-50) }); for (let i = 0; i < 2000 && !s.outcome; i++) stepFixed(s, plan(i)); return Array.from(s.s); };
  assert.deepEqual(go(), go());
});

test("frame-rate independence: accumulator-driven runs equal the fixed-step reference", () => {
  const ctrl = { throttle: 0.6, tiltE: 0.1, tiltN: -0.05 };
  const mk = () => createSim({ pos: [0, 0, 900], vel: [3, 0, -20] });
  const a = mk(), b = mk();
  for (let i = 0; i < 300; i++) advance(a, ctrl, 1 / 60);        // 60 Hz display
  for (let i = 0; i < 300; i++) advance(b, ctrl, i % 3 ? 1 / 144 : 1 / 30); // irregular display
  for (const run of [a, b]) {
    const ref = mk();
    const n = Math.round(run.t / run.dt);
    for (let i = 0; i < n; i++) stepFixed(ref, ctrl);
    assert.deepEqual(Array.from(ref.s), Array.from(run.s));
  }
});

test("RK4 convergence: halving dt reduces the error ~16x (4th order)", () => {
  // time-varying throttle exercises the integrator (piecewise constant per step, smooth in t)
  // Orbital-speed burn over 600 s: gravity direction and mass change substantially,
  // so truncation error dominates round-off at these step sizes.
  const v = veh({ fuelMass: 6000, tiltRateDegS: 1e6 });
  const endAt = (dt) => {
    const s = createSim({ vehicle: v, pos: [0, 0, 15000], vel: [1600, 0, 0], dt });
    const n = Math.round(600 / dt);
    for (let i = 0; i < n; i++) stepFixed(s, { throttle: 0.7, tiltE: -0.6, tiltN: 0 });
    return s.s;
  };
  const ref = endAt(1 / 16), e1 = endAt(8), e2 = endAt(4), e3 = endAt(1 / 50);
  const err = s => Math.hypot(s[0] - ref[0], s[1] - ref[1], s[2] - ref[2]);
  const ratio = err(e1) / err(e2);
  assert.ok(ratio > 12 && ratio < 20, `error ratio ${ratio} (dt=8 s: ${err(e1)} m, dt=4 s: ${err(e2)} m)`);
  assert.ok(err(e3) < 1e-4, `dt=1/50 s position error ${err(e3)} m after 600 s`);
});

test("telemetry reports altitude above terrain, not above the sphere", () => {
  const sim = createSim({ pos: [0, 0, 500], vel: [0, 0, 0], terrain: flat(120) });
  const t = telemetry(sim);
  assert.ok(Math.abs(t.altitudeAGL - (500 - 120 - DEFAULT_VEHICLE.legDrop)) < 1e-9);
});
