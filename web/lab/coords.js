// Lunar coordinate conventions used by MoonProof (mirrors science/lola_horizon.py).
//
// * Latitude: planetocentric, degrees, -90..90.
// * Longitude: east-positive, degrees, normalised to (-180, 180].
// * Body-fixed frame: Mean Earth / Polar Axis (MOON_ME, DE421 for LOLA products).
//   +X toward 0°E on the equator, +Z toward the north pole.
// * Reference sphere radius: 1,737,400 m (LOLA). Heights are relative to it.
// * South polar stereographic (PDS DSMAP_POLAR.CAT, spherical, true scale at pole):
//     rho = 2 R tan((lat + 90°) / 2);  x = rho sin(lon);  y = rho cos(lon)
//   Zero-indexed pixel-centre coordinates (PR #86 convention):
//     col = SAMPLE_PROJECTION_OFFSET + x / MAP_SCALE;  row = LINE_PROJECTION_OFFSET - y / MAP_SCALE
// * Local frame: East-North-Up at a site; azimuth clockwise from north.

export const R_REF = 1737400;
const d2r = Math.PI / 180, r2d = 180 / Math.PI;

export function normalizeLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return l;
}

export function latLonToBodyFixed(lat, lon, r = R_REF) {
  const la = lat * d2r, lo = lon * d2r;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
}

export function bodyFixedToLatLon([x, y, z]) {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(z / r) * r2d, lon: normalizeLon(Math.atan2(y, x) * r2d), r };
}

export function southStereoForward(lat, lon, R = R_REF) {
  const rho = 2 * R * Math.tan(((lat + 90) * d2r) / 2);
  return [rho * Math.sin(lon * d2r), rho * Math.cos(lon * d2r)];
}

export function southStereoInverse(x, y, R = R_REF) {
  const rho = Math.hypot(x, y);
  const lat = 2 * Math.atan(rho / (2 * R)) * r2d - 90;
  const lon = rho === 0 ? 0 : normalizeLon(Math.atan2(x, y) * r2d);
  return { lat, lon };
}

export function stereoToPixel(x, y, grid) {
  return [grid.sampleOffset + x / grid.mapScale, grid.lineOffset - y / grid.mapScale];
}

export function enuBasis(lat, lon) {
  const la = lat * d2r, lo = lon * d2r;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  return { east, north, up };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Body-fixed vector -> local ENU components at (lat, lon). */
export function bodyToEnu(v, lat, lon) {
  const { east, north, up } = enuBasis(lat, lon);
  return [dot(v, east), dot(v, north), dot(v, up)];
}

/** Local ENU components -> body-fixed vector. */
export function enuToBody([e, n, u], lat, lon) {
  const b = enuBasis(lat, lon);
  return [0, 1, 2].map(i => e * b.east[i] + n * b.north[i] + u * b.up[i]);
}

/** Direction (az clockwise from north, el above local horizontal) -> unit ENU vector. */
export function azElToEnu(azDeg, elDeg) {
  const az = azDeg * d2r, el = elDeg * d2r;
  return [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)];
}

export function enuToAzEl([e, n, u]) {
  return { az: ((Math.atan2(e, n) * r2d) % 360 + 360) % 360, el: Math.atan2(u, Math.hypot(e, n)) * r2d };
}

/** Great-circle surface distance (m) on the reference sphere. */
export function surfaceDistance(lat1, lon1, lat2, lon2, R = R_REF) {
  const a = latLonToBodyFixed(lat1, lon1, 1), b = latLonToBodyFixed(lat2, lon2, 1);
  return R * Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), dot(a, b));
}
