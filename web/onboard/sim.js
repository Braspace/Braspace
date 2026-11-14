// Synthetic Sun/Earth visibility generator for the onboard front end.
// Educational only: this is NOT an ephemeris and NOT terrain data.
// The shape of the model mirrors the prototype in docs/prototype/onboard-dashboard.html.
// Every output is labelled SYNTHETIC-NOT-NASA by the caller.
(function (root) {
  "use strict";

  const LUNAR_H = 29.53 * 24;   // synthetic sun cycle, hours
  const ORBIT_H = 27.32 * 24;   // synthetic Earth cycle, hours

  // Roughness only shifts the synthetic horizon. Site ids match the API examples.
  const SITE_ROUGHNESS = {
    "synthetic-demo-a": 0.0,
    "synthetic-demo-b": 1.0,
    "synthetic-demo-c": 0.5
  };

  function norm(a) { return ((a % 360) + 360) % 360; }

  function horizonAt(azDeg, rough) {
    return 1.5 * Math.sin(2 * azDeg * Math.PI / 180) + 1.5 + rough;
  }

  function bodiesAt(tHours) {
    return {
      sunEl: 3 * Math.sin(2 * Math.PI * tHours / LUNAR_H),
      sunAz: norm(360 * tHours / LUNAR_H),
      earthEl: -1 + 2 * Math.sin(2 * Math.PI * tHours / ORBIT_H + 1),
      earthAz: norm(180 * tHours / ORBIT_H + 90)
    };
  }

  // Returns [{sun_visible, earth_visible}] for `count` samples spaced `stepMinutes`.
  function generateSamples(opts) {
    const rough = SITE_ROUGHNESS[opts.siteId];
    if (rough === undefined) throw new Error("site_id sem perfil sintético: " + opts.siteId);
    const t0 = Date.parse(opts.startUtc);
    if (!Number.isFinite(t0)) throw new Error("start_utc inválido");
    const samples = [];
    for (let i = 0; i < opts.count; i++) {
      const tHours = (t0 / 3600000) + (i * opts.stepMinutes) / 60;
      const b = bodiesAt(tHours);
      samples.push({
        sun_visible: b.sunEl > horizonAt(b.sunAz, rough),
        earth_visible: b.earthEl > horizonAt(b.earthAz, rough)
      });
    }
    return samples;
  }

  const api = { generateSamples, horizonAt, bodiesAt, SITE_ROUGHNESS, LUNAR_H, ORBIT_H };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardSim = api;
})(typeof window !== "undefined" ? window : globalThis);
