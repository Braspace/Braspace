// Sub-solar and sub-Earth points of the Moon HD viewer (data/moonhd/ephemeris.bin, NAIF SPICE, hourly).
// Pure functions: no DOM, no three.js, so they run under node --test.
//
// Frames. Body-fixed MOON_ME: +X toward 0°E on the equator, +Z toward the north pole.
//   globe scene = (bx, bz, -by)      unit sphere, +Y north
//   polar scene = (bx, -bz, by)      local frame at the south pole, +Y up (same as web/lab/scene.js "region")

const D2R = Math.PI / 180;

/** Decode ephemeris.bin: int16 sun_lat*100 | uint16 sun_lon*100 | int16 earth_lat*100 | uint16 earth_lon*100. */
export function decodeEphemeris(buffer, meta) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== meta.count * 8) throw new Error("ephemeris: unexpected byte length");
  const startMs = Date.parse(meta.start_utc);
  if (!Number.isFinite(startMs) || !(meta.step_seconds > 0)) throw new Error("ephemeris: invalid time base");
  return { view: new DataView(buffer), count: meta.count, startMs, stepMs: meta.step_seconds * 1000 };
}

function sample(eph, i) {
  const o = i * 8, v = eph.view;
  return [v.getInt16(o, true) / 100, v.getUint16(o + 2, true) / 100, v.getInt16(o + 4, true) / 100, v.getUint16(o + 6, true) / 100];
}

const lerpLon = (a, b, f) => { const d = ((b - a + 540) % 360) - 180; return (a + d * f + 360) % 360; };

/** Fractional sample index of a time (ms since epoch), clamped to the series. */
export function indexAt(eph, ms) {
  return Math.min(eph.count - 1, Math.max(0, (ms - eph.startMs) / eph.stepMs));
}
export const timeAt = (eph, index) => eph.startMs + index * eph.stepMs;

/** Linear interpolation between the two hourly samples around a fractional index. */
export function pointsAt(eph, index) {
  const x = Math.min(eph.count - 1, Math.max(0, index)), i = Math.min(eph.count - 2, Math.floor(x)), f = x - i;
  const a = sample(eph, i), b = sample(eph, i + 1);
  return {
    sun: { lat: a[0] + (b[0] - a[0]) * f, lon: lerpLon(a[1], b[1], f) },
    earth: { lat: a[2] + (b[2] - a[2]) * f, lon: lerpLon(a[3], b[3], f) },
  };
}

/** Unit vector of (lat, lon) in the body-fixed frame. */
export function bodyDirection(lat, lon) {
  const la = lat * D2R, lo = lon * D2R, c = Math.cos(la);
  return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
}
export const toGlobeScene = ([x, y, z]) => [x, z, -y];
export const toPolarScene = ([x, y, z]) => [x, -z, y];

/** Decode earth_orientation.bin: int16 x, y, z, w (times 32767), rotation IAU_EARTH -> Moon mean-Earth frame. */
export function decodeOrientation(buffer, meta) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== meta.count * 8) throw new Error("orientation: unexpected byte length");
  return { view: new DataView(buffer), count: meta.count };
}

/** Unit quaternion [x, y, z, w] at a fractional index (normalised linear interpolation between hourly samples). */
export function orientationAt(orientation, index) {
  const x = Math.min(orientation.count - 1, Math.max(0, index)), i = Math.min(orientation.count - 2, Math.floor(x)), f = x - i, v = orientation.view;
  const q = [0, 1, 2, 3].map(k => v.getInt16(i * 8 + k * 2, true) * (1 - f) + v.getInt16((i + 1) * 8 + k * 2, true) * f);
  const n = Math.hypot(...q);
  return q.map(c => c / n);
}

/** Rotate a vector by a unit quaternion [x, y, z, w]. */
export function rotate([x, y, z, w], [vx, vy, vz]) {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

/** Site series (web/data/sites/<id>.bin): four planar arrays of `count` values, angles times 100. */
export function decodeSiteSeries(buffer, meta) {
  const n = meta.series.count;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== n * 8 || meta.terrain_horizon.length !== 360) throw new Error("site series: unexpected shape");
  return { view: new DataView(buffer), count: n, startMs: Date.parse(meta.series.start_utc), stepMs: meta.series.step_seconds * 1000,
    horizon: meta.terrain_horizon.map(h => h.el), status: meta.science_status };
}

/** Sun and Earth centre at one stored sample: elevation, terrain horizon at that azimuth, and the margin between them (deg). */
export function siteSkyAt(series, sample) {
  const i = Math.min(series.count - 1, Math.max(0, Math.round(sample))), n = series.count, v = series.view;
  const horizonAt = az => { const k = Math.floor(az) % 360, f = az - Math.floor(az); return series.horizon[k] * (1 - f) + series.horizon[(k + 1) % 360] * f; };
  const body = (azOffset, elOffset) => {
    const az = v.getUint16((azOffset * n + i) * 2, true) / 100, el = v.getInt16((elOffset * n + i) * 2, true) / 100, horizon = horizonAt(az);
    return { az, el, horizon, margin: el - horizon };
  };
  return { sun: body(0, 1), earth: body(2, 3) };
}

/** Longitude as -180..180 for display. */
export const signedLon = lon => ((lon + 180) % 360 + 360) % 360 - 180;

/** Elevation (degrees) of a distant body above the horizontal plane at the south pole of the reference sphere. */
export const elevationAtSouthPole = subLat => -subLat;
