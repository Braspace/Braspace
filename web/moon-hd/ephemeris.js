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

/** Longitude as -180..180 for display. */
export const signedLon = lon => ((lon + 180) % 360 + 360) % 360 - 180;

/** Elevation (degrees) of a distant body above the horizontal plane at the south pole of the reference sphere. */
export const elevationAtSouthPole = subLat => -subLat;
