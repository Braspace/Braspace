// Synthetic mission model for the cockpit UI. EDUCATIONAL, NOT an ephemeris.
// - Sun/Earth angles come from fixed sinusoids (same shape as the prototype), not SPICE.
// - Horizon is a fixed function of azimuth plus a site roughness, not LOLA terrain.
// - Life-support and fuel values are illustrative constants.
// Every output must be shown with source "SINTÉTICO" by the UI.
(function (root) {
  "use strict";

  const LUNAR_H = 29.53 * 24;
  const ORBIT_H = 27.32 * 24;
  const LIMITS = { darkH: 30, blockH: 24, battery: 20, fuelReserveKg: 150 };

  const SITES = {
    "synthetic-demo-a": { name: "SYN-SITE-A", lat: -89.5, lon: 45.0, rough: 0.0 },
    "synthetic-demo-b": { name: "SYN-SITE-B", lat: -88.9, lon: -30.2, rough: 1.0 },
    "synthetic-demo-c": { name: "SYN-SITE-C", lat: -87.6, lon: 120.0, rough: 0.5 }
  };

  function norm(a) { return ((a % 360) + 360) % 360; }

  // opts.dh: observer height offset in degrees; opts.roughMult: DEM roughness multiplier.
  function horizonAt(azDeg, site, opts) {
    const o = opts || {};
    const dh = o.dh || 0;
    const rm = o.roughMult === undefined ? 1 : o.roughMult;
    return 1.5 * Math.sin(2 * azDeg * Math.PI / 180) + 1.5 + site.rough * rm + dh;
  }

  function bodiesAt(tHours) {
    return {
      sunEl: 3 * Math.sin(2 * Math.PI * tHours / LUNAR_H),
      sunAz: norm(360 * tHours / LUNAR_H),
      earthEl: -1 + 2 * Math.sin(2 * Math.PI * tHours / ORBIT_H + 1),
      earthAz: norm(180 * tHours / ORBIT_H + 90)
    };
  }

  // Samples for `count` steps of `stepMin` minutes from `startMs` (epoch ms), with a
  // delay in hours applied to the start. Returns per-step records with angles and flags.
  function track(opts) {
    const site = SITES[opts.siteId];
    if (!site) throw new Error("lugar desconhecido: " + opts.siteId);
    const t0H = (opts.startMs + (opts.delayH || 0) * 3600e3) / 3600e3;
    const out = [];
    for (let i = 0; i < opts.count; i++) {
      const tH = t0H + (i * opts.stepMin) / 60;
      const b = bodiesAt(tH);
      const sunUp = b.sunEl > horizonAt(b.sunAz, site, opts);
      const earthUp = b.earthEl > horizonAt(b.earthAz, site, opts);
      out.push({
        i, tH,
        sunEl: b.sunEl, sunAz: b.sunAz, earthEl: b.earthEl, earthAz: b.earthAz,
        horizonSun: horizonAt(b.sunAz, site, opts), horizonEarth: horizonAt(b.earthAz, site, opts),
        sun_visible: sunUp, earth_visible: earthUp
      });
    }
    return out;
  }

  function runLengths(track, pred) {
    let best = 0, cur = 0;
    for (const s of track) { cur = pred(s) ? cur + 1 : 0; best = Math.max(best, cur); }
    return best;
  }

  // Exact-ish transitions: the sample index where the flag changes, and the hour it happens.
  // Refinement by bisection between samples is NOT implemented (checklist 4.6 stays pending).
  function transitions(tr, key, stepMin) {
    const list = [];
    for (let i = 1; i < tr.length; i++) {
      if (tr[i][key] !== tr[i - 1][key]) list.push({ index: i, tH: tr[i].tH, to: tr[i][key], stepMin });
    }
    return list;
  }

  function summary(tr, stepMin) {
    const sunlitH = tr.filter(s => s.sun_visible).length * stepMin / 60;
    const earthH = tr.filter(s => s.earth_visible).length * stepMin / 60;
    const darkH = runLengths(tr, s => !s.sun_visible) * stepMin / 60;
    const blockH = runLengths(tr, s => !s.earth_visible) * stepMin / 60;
    return { sunlitH, earthH, darkH, blockH, durationH: tr.length * stepMin / 60 };
  }

  // Illustrative subsystems (checklist 5.4, 6.x). Constants, not validated.
  function lifeSupport(durationH, crew) {
    const people = crew || 4;
    const fuelRaw = 450 - 1.2 * durationH;          // can go negative: the shortfall is kept in the margin
    return {
      fuelRemainingKg: Math.max(0, fuelRaw),         // stock cannot be below zero
      fuelMarginKg: fuelRaw - LIMITS.fuelReserveKg,  // negative = below reserve
      foodLeftKg: Math.max(0, 500 - people * 0.62 * durationH / 24),
      o2StockKg: Math.max(0, 64 - people * 0.84 * durationH / 24),
      cabinKpa: 101.3,
      o2PartialKpa: 21.2,
      people
    };
  }

  // Replanning checks (checklist 7.2/7.3) on top of a summary.
  function violations(sum, life) {
    const v = [];
    if (sum.darkH > LIMITS.darkH) v.push({ code: "DARK", text: "escuridão de " + sum.darkH.toFixed(1) + " h acima de " + LIMITS.darkH + " h" });
    if (sum.blockH > LIMITS.blockH) v.push({ code: "BLOCK", text: "Terra bloqueada por " + sum.blockH.toFixed(1) + " h acima de " + LIMITS.blockH + " h" });
    if (life && life.fuelMarginKg < 0) v.push({ code: "FUEL", text: "combustível abaixo da reserva (ilustrativo)" });
    return v;
  }
  function verdict(v, margin) {
    if (v.length) return "NAO_VIAVEL";
    return margin !== undefined && margin < 50 ? "MARGEM_REDUZIDA" : "VIAVEL";
  }

  // Sensitivity (checklist 9.x): same track with altered parameters.
  const SENS_VARIANTS = [
    { key: "base", label: "Base", opts: {} },
    { key: "obs", label: "Altura do observador +0,5°", opts: { dh: 0.5 } },
    { key: "dem_c", label: "DEM mais grosseiro (×1,5)", opts: { roughMult: 1.5 } },
    { key: "dem_f", label: "DEM mais fino (×0,5)", opts: { roughMult: 0.5 } },
    { key: "step2", label: "Passo de 2 h", opts: { stepMul: 2 } }
  ];

  const api = {
    SITES, LIMITS, LUNAR_H, ORBIT_H, SENS_VARIANTS,
    horizonAt, bodiesAt, track, summary, transitions, runLengths,
    lifeSupport, violations, verdict
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardModel = api;
})(typeof window !== "undefined" ? window : globalThis);
