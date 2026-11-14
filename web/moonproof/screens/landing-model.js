// Pure logic of screens F (Landing Lab) and G (Debrief). No DOM; testable in Node.
// Physics comes from web/lab/physics.js (imported, never rewritten). Every threshold below is either
// read from the vehicle (DEFAULT_VEHICLE.limits), derived from physics, or a declared UI/assumed parameter.
import { gravity, DEFAULT_VEHICLE, G0 } from "../../lab/physics.js";

export const ATTEMPTS_KEY = "moonproof.landing.attempts";
// Declared, editable parameters (assumed limits / UI layout), NOT measurements:
export const ASSUMED = Object.freeze({
  zoneRadiusM: 18,        // = outer radius of the target ring drawn by web/lab/scene.js (RingGeometry 14..18)
  fuelReserveFrac: 0.2,   // assumed limit: fuel reserve rule and "low fuel" state
  brakeMargin: 1.3,       // safety factor on the braking height
  bandHalf: 0.08,         // half width of the recommended-thrust band (UI)
  maxBars: 16,            // upper bound of bars in the descent-speed chart (layout)
  slopeNote: true,
});
export const GUIDE = Object.freeze({ aimFrac: 0.8, brakeBefore: 1.6, finalFrac: 0.35, steps: 4 });

export const localGravity = (centreDistance) => -gravity(0, 0, 0, centreDistance)[2];

/** Height needed to slow from speed v (m/s, positive down) to the touchdown limit with full thrust. null if the engine cannot out-push gravity. */
export function brakeHeight(v, { vehicle = DEFAULT_VEHICLE, mass, g, margin = ASSUMED.brakeMargin }) {
  const net = vehicle.maxThrust / mass - g;
  const vt = vehicle.limits.maxVerticalSpeed;
  if (!(net > 0) || !(v > vt)) return v > vt ? null : 0;
  return margin * (v * v - vt * vt) / (2 * net);
}

/** Guided step 1..4 from altitude; never goes back. */
export function guidedStep(altAGL, startAlt, brakeH, prev = 1) {
  let s = 1;
  if (altAGL <= startAlt * GUIDE.aimFrac) s = 2;
  if (brakeH != null && altAGL <= brakeH * GUIDE.brakeBefore) s = 3;
  if (brakeH != null && altAGL <= brakeH * GUIDE.finalFrac) s = 4;
  return Math.max(prev, s);
}

/** Alert state from telemetry. Returns {level: "ok"|"warn"|"crit", needH}. */
export function alertFor(tm, ctx) {
  const v = -tm.vz, lim = ctx.vehicle.limits.maxVerticalSpeed;
  if (!Number.isFinite(tm.altitudeAGL) || !(v > lim)) return { level: "ok", needH: null };
  const needH = brakeHeight(v, ctx);
  if (needH == null) return { level: "crit", needH };
  if (tm.altitudeAGL < needH) return { level: "crit", needH };
  if (tm.altitudeAGL < needH * ASSUMED.brakeMargin) return { level: "warn", needH };
  return { level: "ok", needH };
}

/** Recommended throttle fraction (0..1) to arrive at the touchdown limit exactly at the ground; null when not braking. */
export function recommendedThrottle(tm, ctx) {
  const v = -tm.vz, vt = ctx.vehicle.limits.maxVerticalSpeed;
  if (!(tm.altitudeAGL > 0) || !(v > vt)) return null;
  const a = (v * v - vt * vt) / (2 * tm.altitudeAGL);
  return Math.min(1, Math.max(0, (ctx.g + a) * ctx.mass / ctx.vehicle.maxThrust));
}

/** Seconds of fuel at the current thrust; null when the engine is off. */
export function fuelSeconds(tm, vehicle) {
  const T = tm.throttle * vehicle.maxThrust;
  if (!(T > 0)) return null;
  return tm.fuel / (T / (vehicle.isp * G0));
}

export const fuelFrac = (fuelKg, startKg) => (Number.isFinite(fuelKg) && startKg > 0 ? Math.max(0, fuelKg / startKg) : null);

/** Build the stored attempt from a finished sim. Nothing is invented: a missing value stays null. */
export function buildAttempt(sim, info) {
  const o = sim.outcome, c = sim.contact;
  const fuelEnd = sim.s[6] - sim.vehicle.dryMass;
  const trace = sim.trace.map(p => ({ t: p.t, x: p.x, y: p.y, z: p.z, vz: p.vz, hSpeed: p.hSpeed, alt: Number.isFinite(p.altitudeAGL) ? p.altitudeAGL : null, fuel: p.fuel, throttle: p.throttle }));
  const burn = trace.find(p => p.throttle > 0);
  return {
    n: info.n, at: info.at, site: info.site, siteName: info.siteName, siteN: info.siteN, mode: info.mode,
    simTimeIso: info.simTimeIso, terrainStatus: info.terrainStatus, sky: info.sky || null,
    result: o?.result || null, reasons: o?.reasons || [],
    contact: c ? { vVert: c.vVert, vHor: c.vHor, slope: c.slope, tilt: c.tilt, x: c.x, y: c.y, dist: Math.hypot(c.x - sim.target[0], c.y - sim.target[1]) } : null,
    flightS: sim.t, fuelStartKg: info.fuelStartKg, fuelEndKg: fuelEnd, fuelUsedKg: sim.fuelUsed,
    limits: { ...sim.vehicle.limits }, vehicle: { name: sim.vehicle.name, dryMass: sim.vehicle.dryMass, maxThrust: sim.vehicle.maxThrust },
    zoneRadiusM: ASSUMED.zoneRadiusM, target: [...sim.target], start: trace.length ? { x: trace[0].x, y: trace[0].y, alt: trace[0].alt } : null,
    burnStart: burn ? { t: burn.t, alt: burn.alt, vz: burn.vz } : null, g: info.g, trace,
  };
}

/** The 7 landing rules. state: "ok" | "fail" | "nd". Missing data is "nd", never a pass. */
export function evaluateRules(a) {
  const c = a?.contact, L = a?.limits;
  const rule = (id, v, test) => ({ id, state: v == null || !Number.isFinite(v) ? "nd" : (test(v) ? "ok" : "fail"), value: v ?? null });
  return [
    rule("target", c?.dist, v => v <= a.zoneRadiusM),
    rule("soft", c?.vVert, v => v <= L.maxVerticalSpeed),
    rule("lateral", c?.vHor, v => v <= L.maxHorizontalSpeed),
    rule("slope", c?.slope, v => v <= L.maxGroundSlopeDeg),
    rule("lit", a?.sky?.sunMargin, v => v >= 0),
    rule("earth", a?.sky?.earthMargin, v => v >= 0),
    rule("fuel", fuelFrac(a?.fuelEndKg, a?.fuelStartKg), v => v >= ASSUMED.fuelReserveFrac),
  ];
}
export const rulesMet = (rules) => ({ met: rules.filter(r => r.state === "ok").length, total: rules.length, known: rules.filter(r => r.state !== "nd").length });

/** Verdict key (texts: deb.v.*). */
export function verdictKey(a, rules) {
  if (a.result === "OUT_OF_MODELED_AREA") return "out";
  if (a.result === "CRASH") return "crash";
  if (a.result === "HARD_LANDING") return "hard";
  const fuel = rules.find(r => r.id === "fuel");
  const others = rules.filter(r => r.id !== "fuel" && r.state === "fail");
  if (others.length) return "warn";
  if (fuel.state === "fail") return "lowfuel";
  // AUD-10: mechanical touchdown is fine, but a criterion with no data (Sun/Earth/contact) is unknown, not passed.
  if (rules.some(r => r.state === "nd")) return "partial";
  return "safe";
}

/** Descent-speed bars: max downward speed per interval. interval is a multiple of the trace step. */
export function descentBars(trace, maxBars = ASSUMED.maxBars) {
  if (!trace?.length) return { interval: null, bars: [] };
  const T = trace[trace.length - 1].t;
  const step = trace.length > 1 ? trace[1].t - trace[0].t : 0.5;
  const interval = Math.max(step, Math.ceil(T / maxBars / step) * step);
  const n = Math.max(1, Math.ceil(T / interval));
  const bars = Array.from({ length: n }, (_, i) => ({ from: i * interval, v: 0 }));
  for (const p of trace) { const i = Math.min(n - 1, Math.floor(p.t / interval)); bars[i].v = Math.max(bars[i].v, -p.vz); }
  return { interval, bars };
}

/** Peak point of descent (point 2) and brake point (point 1), from the trace. */
export function keyPoints(a) {
  const tr = a.trace || [];
  if (!tr.length) return { peak: null, brake: null };
  const peak = tr.reduce((m, p) => (-p.vz > -m.vz ? p : m), tr[0]);
  const brake = a.burnStart ? tr.find(p => p.t >= a.burnStart.t) : null;
  return { peak, brake };
}

/** Was the braking late? Compares the burn start height with the height physics needed at that speed. */
export function brakingAssessment(a) {
  const b = a.burnStart; if (!b || b.alt == null) return { late: null, needH: null };
  const m = a.vehicle.dryMass + a.fuelStartKg;
  const needH = brakeHeight(-b.vz, { vehicle: { maxThrust: a.vehicle.maxThrust, limits: a.limits }, mass: m, g: a.g, margin: 1 });
  return { late: needH == null ? true : b.alt < needH, needH };
}

export function saveAttempt(storage, attempt) {
  const list = loadAttempts(storage); list.push(attempt);
  try { storage.setItem(ATTEMPTS_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
export function loadAttempts(storage) {
  try { const v = JSON.parse(storage.getItem(ATTEMPTS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** AUD-17: attempts live only in this tab (sessionStorage); this is the shareable, versioned copy. */
export function attemptExport(attempt, now = new Date()) {
  return { schema: "braspace.landing-attempt", version: 1, exported_utc: now.toISOString(), storage: "sessionStorage (this tab only)", science_status: "SIMULATION", attempt };
}
export const lastAttempt = (storage) => loadAttempts(storage).at(-1) || null;
