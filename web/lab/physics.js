// MoonProof Landing Lab — deterministic 3-DOF lander dynamics.
//
// Model (all SI units):
//   dr/dt = v
//   dv/dt = g(r) + (T / m) * u          T = throttle * maxThrust (0 when no propellant)
//   dm/dt = -T / (Isp * g0)
//   g(r)  = -mu * (r - c) / |r - c|^3   central lunar gravity, c = Moon centre
//
// Frame: local East-North-Up tangent frame at the selected site; origin on the
// DEM surface at the site, x = east, y = north, z = up (metres). The Moon centre
// is at c = (0, 0, -centreDistance), centreDistance = R_ref + site height.
//
// Attitude is NOT a 6-DOF rigid body: the thrust direction u is given by two tilt
// angles (east, north) that track the pilot command at a bounded rate (rate-limited
// kinematics). This is a declared 3-DOF simplification.
//
// Integration: classic RK4 with a fixed step (default 1/50 s) driven by an
// accumulator, so the trajectory does not depend on the browser frame rate.
// The physical state is never rounded during integration.

export const MOON_MU = 4.9028000661637961e12; // m^3 s^-2 (DE440 GM_Moon = 4902.800066 km^3 s^-2)
export const MOON_R_REF = 1737400; // m, LOLA reference radius
export const G0 = 9.80665; // m s^-2, standard gravity used in the Isp definition
export const DEFAULT_DT = 1 / 50;

/** Hypothetical educational lander. These are NOT parameters of any NASA vehicle. */
export const DEFAULT_VEHICLE = Object.freeze({
  name: "MoonProof Trainer (hypothetical)",
  dryMass: 1200, // kg
  fuelMass: 320, // kg, usable propellant
  maxThrust: 6000, // N
  minThrottle: 0.1, // fraction of maxThrust when the engine is lit
  isp: 311, // s
  maxTiltDeg: 35, // deg, limit of commanded thrust tilt
  tiltRateDegS: 20, // deg/s, attitude slew-rate limit
  legRadius: 2.0, // m, footpad distance from vertical axis
  legDrop: 1.6, // m, footpad below the centre of mass
  limits: Object.freeze({ // educational touchdown limits of the hypothetical vehicle
    maxVerticalSpeed: 2.0, // m/s
    maxHorizontalSpeed: 1.0, // m/s
    maxGroundSlopeDeg: 12, // deg
    maxTiltDeg: 10, // deg
    hardVerticalSpeed: 4.0, // m/s: above this a touchdown is destructive
  }),
});

const deg = Math.PI / 180;

export function createSim({ vehicle = DEFAULT_VEHICLE, pos = [0, 0, 800], vel = [0, 0, -20], fuel,
  centreDistance = MOON_R_REF, terrain = null, target = [0, 0], bounds = null, dt = DEFAULT_DT,
  mu = MOON_MU } = {}) {
  const fuelMass = fuel ?? vehicle.fuelMass;
  return {
    vehicle, terrain, target, bounds, dt, mu, centreDistance,
    t: 0,
    s: Float64Array.from([pos[0], pos[1], pos[2], vel[0], vel[1], vel[2], vehicle.dryMass + fuelMass]),
    tilt: [0, 0], // actual tilt angles (rad): east, north
    throttle: 0,
    accumulator: 0,
    outcome: null, // set once on contact or exit
    contact: null,
    fuelUsed: 0,
    trace: [], // sparse telemetry for the debrief (every 0.5 s)
    _nextTrace: 0,
  };
}

export function gravity(x, y, z, centreDistance, mu = MOON_MU) {
  const rz = z + centreDistance;
  const r2 = x * x + y * y + rz * rz;
  const k = -mu / (r2 * Math.sqrt(r2));
  return [k * x, k * y, k * rz];
}

export function thrustDirection(tiltE, tiltN) {
  const se = Math.sin(tiltE), sn = Math.sin(tiltN);
  const z2 = 1 - se * se - sn * sn;
  const z = z2 > 0 ? Math.sqrt(z2) : 0;
  const n = Math.hypot(se, sn, z) || 1;
  return [se / n, sn / n, z / n];
}

function deriv(s, thrustN, u, sim, out) {
  const veh = sim.vehicle;
  const m = s[6];
  const hasFuel = m > veh.dryMass;
  const T = hasFuel ? thrustN : 0;
  const g = gravity(s[0], s[1], s[2], sim.centreDistance, sim.mu);
  out[0] = s[3]; out[1] = s[4]; out[2] = s[5];
  out[3] = g[0] + (T / m) * u[0];
  out[4] = g[1] + (T / m) * u[1];
  out[5] = g[2] + (T / m) * u[2];
  out[6] = -T / (veh.isp * G0);
  return out;
}

const k1 = new Float64Array(7), k2 = new Float64Array(7), k3 = new Float64Array(7), k4 = new Float64Array(7), tmp = new Float64Array(7);

/** Effective thrust (N) for a throttle command, honouring min throttle and fuel. */
export function thrustFor(sim, throttleCmd) {
  const veh = sim.vehicle;
  const c = Math.min(1, Math.max(0, throttleCmd));
  if (c <= 0 || sim.s[6] <= veh.dryMass) return 0;
  return Math.max(c, veh.minThrottle) * veh.maxThrust;
}

/** One fixed RK4 step. control = { throttle: 0..1, tiltE: rad, tiltN: rad }. */
export function stepFixed(sim, control) {
  if (sim.outcome) return sim;
  const veh = sim.vehicle, dt = sim.dt;
  // rate-limited attitude kinematics (held constant within the step)
  const maxT = veh.maxTiltDeg * deg, rate = veh.tiltRateDegS * deg * dt;
  for (let i = 0; i < 2; i++) {
    const cmd = Math.max(-maxT, Math.min(maxT, i === 0 ? control.tiltE || 0 : control.tiltN || 0));
    const d = cmd - sim.tilt[i];
    sim.tilt[i] += Math.max(-rate, Math.min(rate, d));
  }
  const u = thrustDirection(sim.tilt[0], sim.tilt[1]);
  const T = thrustFor(sim, control.throttle || 0);
  sim.throttle = T / veh.maxThrust;
  const s = sim.s;
  deriv(s, T, u, sim, k1);
  for (let i = 0; i < 7; i++) tmp[i] = s[i] + 0.5 * dt * k1[i];
  deriv(tmp, T, u, sim, k2);
  for (let i = 0; i < 7; i++) tmp[i] = s[i] + 0.5 * dt * k2[i];
  deriv(tmp, T, u, sim, k3);
  for (let i = 0; i < 7; i++) tmp[i] = s[i] + dt * k3[i];
  deriv(tmp, T, u, sim, k4);
  const m0 = s[6];
  for (let i = 0; i < 7; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  if (s[6] < veh.dryMass) s[6] = veh.dryMass; // propellant cannot go negative
  sim.fuelUsed += m0 - s[6];
  sim.t += dt;
  if (sim.t >= sim._nextTrace) { sim.trace.push(telemetry(sim)); sim._nextTrace += 0.5; }
  checkContact(sim);
  return sim;
}

/** Advance by a wall-clock duration using fixed steps; returns steps taken. */
export function advance(sim, control, seconds, maxSteps = 500) {
  sim.accumulator += seconds;
  let n = 0;
  while (sim.accumulator >= sim.dt && n < maxSteps && !sim.outcome) {
    stepFixed(sim, control);
    sim.accumulator -= sim.dt;
    n++;
  }
  if (n >= maxSteps) sim.accumulator = 0; // drop backlog rather than spiral
  return n;
}

/** Footpad positions in the local frame for the current tilt. */
export function footpads(sim) {
  const veh = sim.vehicle;
  const u = thrustDirection(sim.tilt[0], sim.tilt[1]); // body "up"
  // build an orthonormal body frame with body-up = u
  let ex = [1, 0, 0];
  const d = ex[0] * u[0] + ex[1] * u[1] + ex[2] * u[2];
  ex = [ex[0] - d * u[0], ex[1] - d * u[1], ex[2] - d * u[2]];
  const nx = Math.hypot(...ex); ex = ex.map(v => v / nx);
  const ey = [u[1] * ex[2] - u[2] * ex[1], u[2] * ex[0] - u[0] * ex[2], u[0] * ex[1] - u[1] * ex[0]];
  const [x, y, z] = sim.s;
  const r = veh.legRadius, h = veh.legDrop;
  return [[r, 0], [-r, 0], [0, r], [0, -r]].map(([a, b]) => [
    x + a * ex[0] + b * ey[0] - h * u[0],
    y + a * ex[1] + b * ey[1] - h * u[1],
    z + a * ex[2] + b * ey[2] - h * u[2],
  ]);
}

export function terrainHeight(sim, x, y) {
  return sim.terrain ? sim.terrain(x, y) : -Infinity;
}

function slopeUnder(sim, pads) {
  // plane through the terrain heights below the four footpads (two orthogonal pairs)
  const pts = pads.map(p => [p[0], p[1], terrainHeight(sim, p[0], p[1])]);
  const a = pts[0], b = pts[1], c = pts[2], d = pts[3];
  const gx = (a[2] - b[2]) / ((a[0] - b[0]) || 1e-9);
  const gy = (c[2] - d[2]) / ((c[1] - d[1]) || 1e-9);
  return Math.atan(Math.hypot(gx, gy)) / deg;
}

function checkContact(sim) {
  const [x, y, z, vx, vy, vz] = sim.s;
  if (sim.bounds) {
    const [xmin, xmax, ymin, ymax] = sim.bounds;
    if (x < xmin || x > xmax || y < ymin || y > ymax) {
      sim.outcome = { result: "OUT_OF_MODELED_AREA", reasons: ["Lander left the area covered by the terrain tile."] };
      return;
    }
  }
  if (!sim.terrain) return;
  const pads = footpads(sim);
  const touching = pads.some(p => p[2] <= terrainHeight(sim, p[0], p[1]));
  const bodyHit = z <= terrainHeight(sim, x, y);
  if (!touching && !bodyHit) return;
  const L = sim.vehicle.limits;
  const vVert = -vz, vHor = Math.hypot(vx, vy);
  const slope = slopeUnder(sim, pads);
  const tilt = Math.acos(Math.max(-1, Math.min(1, thrustDirection(sim.tilt[0], sim.tilt[1])[2]))) / deg;
  const reasons = [];
  if (vVert > L.maxVerticalSpeed) reasons.push(`Vertical speed ${vVert.toFixed(1)} m/s > ${L.maxVerticalSpeed} m/s limit.`);
  if (vHor > L.maxHorizontalSpeed) reasons.push(`Horizontal speed ${vHor.toFixed(1)} m/s > ${L.maxHorizontalSpeed} m/s limit.`);
  if (slope > L.maxGroundSlopeDeg) reasons.push(`Ground slope under the legs ${slope.toFixed(1)}° > ${L.maxGroundSlopeDeg}° limit.`);
  if (tilt > L.maxTiltDeg) reasons.push(`Lander tilt ${tilt.toFixed(1)}° > ${L.maxTiltDeg}° limit.`);
  let result;
  if (bodyHit && !touching) result = "CRASH";
  else if (vVert > L.hardVerticalSpeed || slope > 2 * L.maxGroundSlopeDeg) result = "CRASH";
  else if (reasons.length) result = "HARD_LANDING";
  else result = "LANDED";
  sim.contact = { vVert, vHor, slope, tilt, x, y };
  sim.outcome = { result, reasons };
  sim.trace.push(telemetry(sim));
}

export function telemetry(sim) {
  const [x, y, z, vx, vy, vz, m] = sim.s;
  const ground = terrainHeight(sim, x, y);
  return {
    t: sim.t,
    x, y, z, vx, vy, vz,
    altitudeAGL: Number.isFinite(ground) ? z - ground - sim.vehicle.legDrop : NaN,
    hSpeed: Math.hypot(vx, vy),
    mass: m,
    fuel: m - sim.vehicle.dryMass,
    throttle: sim.throttle,
    tiltDeg: Math.acos(Math.max(-1, Math.min(1, thrustDirection(sim.tilt[0], sim.tilt[1])[2]))) / deg,
    targetDistance: Math.hypot(x - sim.target[0], y - sim.target[1]),
  };
}

/** Specific mechanical energy (J/kg) — conserved when thrust is zero. */
export function specificEnergy(sim) {
  const [x, y, z, vx, vy, vz] = sim.s;
  const rz = z + sim.centreDistance;
  return 0.5 * (vx * vx + vy * vy + vz * vz) - sim.mu / Math.sqrt(x * x + y * y + rz * rz);
}
