// Pure helpers that decide where a number on screen comes from (API or browser model) and how it is
// labelled. No DOM here, so node --test can exercise it.
(function (root) {
  "use strict";

  const SEAL_LOCAL = "SYNTHETIC · browser model";
  const SEAL_NOSRC = "illustrative · no source";

  const isNum = v => typeof v === "number" && Number.isFinite(v);
  // Absent, null, NaN or non-number => "—". A real 0 stays "0".
  function num(v, d) { return isNum(v) ? v.toFixed(d === undefined ? 1 : d) : "—"; }

  // Seal text for a value: API-sourced values carry the API's own science_status (+ rate_source when given).
  function seal(src, info) {
    if (src === "api") {
      const i = info || {};
      const parts = ["API", i.science_status || "science_status n/a"];
      if (i.rate_source) parts.push("rate_source: " + i.rate_source);
      return parts.join(" · ");
    }
    if (src === "nosource") return SEAL_NOSRC;
    return SEAL_LOCAL;
  }

  // One result of POST /api/compare (include_series) -> { points, metrics, science_status, data_status } or null.
  function liveFromCompare(data) {
    const r = data && data.results && data.results[0];
    if (!r || r.data_status !== "AVAILABLE" || !r.evaluation || !Array.isArray(r.evaluation.series) || !r.evaluation.series.length) return null;
    const m = r.evaluation.metrics || {};
    return {
      points: r.evaluation.series, metrics: m,
      science_status: r.science_status, engine_science_status: r.engine_science_status,
      data_status: r.data_status,
      stepH: m.step_hours, sampleCount: m.sample_count
    };
  }

  // Headline hours straight from the API metrics (same numbers a curl shows).
  function summaryFromMetrics(m) {
    if (!m || !isNum(m.sample_count) || !isNum(m.step_hours)) return null;
    const durationH = m.sample_count * m.step_hours;
    return {
      sunlitH: m.sun_visible_fraction * durationH,
      earthH: m.earth_visible_fraction * durationH,
      darkH: m.longest_continuous_dark_hours,
      blockH: m.longest_continuous_comm_gap_hours,
      durationH
    };
  }

  // delay response option -> row for the replanning tables.
  function delayRow(o) {
    const m = o.metrics || {};
    return {
      delay_hours: o.delay_hours, kind: o.kind, science_status: o.science_status,
      darkH: m.longest_continuous_dark_hours, blockH: m.longest_continuous_comm_gap_hours,
      admissible: o.admissible === true,
      breached: (o.breached || []).map(b => b.criterion + " " + b.value + " " + b.comparator + " " + b.limit + " " + b.unit),
      consumables: o.consumables || null
    };
  }

  // Terrain horizon (list of {azimuth_deg, elevation_deg}) -> function(az) with wrap-around linear interpolation.
  function horizonFromSky(list) {
    const pts = (list || []).filter(p => isNum(p.azimuth_deg) && isNum(p.elevation_deg)).slice().sort((a, b) => a.azimuth_deg - b.azimuth_deg);
    if (!pts.length) return null;
    return function (az) {
      const a = ((az % 360) + 360) % 360;
      let lo = pts[pts.length - 1], hi = pts[0], loAz = lo.azimuth_deg - 360, hiAz = hi.azimuth_deg;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].azimuth_deg >= a) { hi = pts[i]; hiAz = hi.azimuth_deg; lo = i ? pts[i - 1] : pts[pts.length - 1]; loAz = i ? lo.azimuth_deg : lo.azimuth_deg - 360; break; }
        if (i === pts.length - 1) { lo = pts[i]; loAz = lo.azimuth_deg; hi = pts[0]; hiAz = hi.azimuth_deg + 360; }
      }
      const span = hiAz - loAz;
      return span === 0 ? lo.elevation_deg : lo.elevation_deg + (hi.elevation_deg - lo.elevation_deg) * (a - loAz) / span;
    };
  }

  // GET /api/sites/{id}/sky result -> { samples, horizon } or null. 404 (route or site series absent) => null => local model.
  function skyFromResponse(res) {
    if (!res || !res.ok || !res.data || !Array.isArray(res.data.samples) || !res.data.samples.length) return null;
    return { samples: res.data.samples, horizon: horizonFromSky(res.data.terrain_horizon), science_status: res.data.science_status, step_seconds: res.data.step_seconds };
  }

  // Header badges from /readyz, /v1/capabilities and the live science_status. Always ends with the permanent no-flight chip.
  function badges(state) {
    const s = state || {};
    const out = [];
    if (!s.apiUp) {
      out.push({ kind: "warn", text: "no API · browser model only (SYNTHETIC)" });
    } else {
      out.push({ kind: s.readyz && s.readyz.status === "ready" ? "ok" : "warn", text: "readyz: " + ((s.readyz && s.readyz.status) || "unknown") });
      out.push({ kind: "warn", text: "science: " + ((s.readyz && s.readyz.science_status) || "unknown") });
      if (s.capabilities) out.push({ kind: s.capabilities.scientifically_validated === true ? "ok" : "warn", text: "validated: " + String(s.capabilities.scientifically_validated) });
      if (s.capabilities) out.push({ kind: "info", text: "LOLA " + (s.capabilities.nasa_lola_loaded ? "loaded" : "not loaded") + " · SPICE " + (s.capabilities.naif_spice_loaded ? "loaded" : "not loaded") });
      if (s.seriesStatus) out.push({ kind: "info", text: "series: " + s.seriesStatus });
    }
    out.push({ kind: "bad", text: "No flight recommendation" });
    return out;
  }

  // Step in minutes of a track. A track without finite ms (the browser model before it is stamped) falls back.
  function stepOf(tr, fallbackMin) {
    const d = tr && tr.length > 1 ? tr[1].ms - tr[0].ms : NaN;
    return Number.isFinite(d) && d > 0 ? Math.round(d / 60000) : fallbackMin;
  }
  // Stamp each browser-model sample with its epoch ms, so every view reads the same field the API track has.
  function stamp(tr, startMs, stepMin) {
    return tr.map((s, i) => ({ ...s, i, ms: startMs + i * stepMin * 60e3 }));
  }

  const api = { stepOf, stamp, SEAL_LOCAL, SEAL_NOSRC, isNum, num, seal, liveFromCompare, summaryFromMetrics, delayRow, horizonFromSky, skyFromResponse, badges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardLive = api;
})(typeof window !== "undefined" ? window : globalThis);
