declare var module: { exports: unknown } | undefined;
// Absent fields are checked at run time (isNum); the type states the API contract.
type LiveMetrics = {
  sample_count: number; step_hours: number; sun_visible_fraction: number; earth_visible_fraction: number;
  longest_continuous_dark_hours: number; longest_continuous_comm_gap_hours: number;
};
type LivePoint = { epoch_utc: string; sun_visible: boolean; earth_visible: boolean; sun_margin_deg?: number; earth_margin_deg?: number };
type LiveCompare = {
  results?: {
    data_status?: string; science_status?: string; engine_science_status?: string;
    evaluation?: { series?: LivePoint[]; metrics?: LiveMetrics };
  }[];
};
type LiveSeries = {
  points: LivePoint[]; metrics: LiveMetrics; science_status?: string; engine_science_status?: string;
  data_status?: string; stepH?: number; sampleCount?: number;
};
type LiveDelayOption = {
  delay_hours?: number; kind?: string; science_status?: string; metrics?: LiveMetrics; admissible?: boolean;
  breached?: { criterion: string; value: unknown; comparator: string; limit: unknown; unit: string }[];
  consumables?: unknown;
};
type LiveHorizonPoint = { azimuth_deg: number; elevation_deg: number };
type LiveTransition = { kind: string; hours_from_start?: number; resolution_seconds?: number; epoch_utc: string; last_unchanged_utc: string };
type LiveNextTransitions = { sun?: LiveTransition | null; earth?: LiveTransition | null; sun_null_reason?: string | null; earth_null_reason?: string | null };
type LiveSkySample = { epoch_utc: string; sun: { azimuth_deg: number; elevation_deg: number }; earth: { azimuth_deg: number; elevation_deg: number } };
type LiveSky = {
  samples?: LiveSkySample[]; terrain_horizon?: LiveHorizonPoint[]; science_status?: string; start_utc?: string; end_utc?: string;
  step_seconds?: number; next_transitions?: LiveNextTransitions | null;
};
type LiveResult = { ok: boolean; status?: number; data?: LiveSky; error?: string };
type LiveBadgeState = {
  apiUp?: boolean; readyz?: { status?: string; science_status?: string } | null;
  capabilities?: { scientifically_validated?: boolean; nasa_lola_loaded?: boolean; naif_spice_loaded?: boolean } | null;
  seriesStatus?: string | null;
};
declare var OnboardLive: OnboardLiveApi;
interface OnboardLiveApi {
  parseApiError(res: { error?: string } | null | undefined): { code: string | null; message: string };
  limitFromMessage(msg: string | null | undefined, kind: string): number | null;
  refusalText(res: { status: number; error?: string }): string;
  pickSites(selected: string[] | null | undefined, current: string, max: number): string[];
  transitionRows(nt: LiveNextTransitions | null | undefined): { label: string; text: string }[] | null;
  stepOf(tr: { ms: number }[] | null | undefined, fallbackMin: number): number;
  stamp<T extends object>(tr: T[], startMs: number, stepMin: number): (T & { i: number; ms: number })[];
  SEAL_LOCAL: string; SEAL_NOSRC: string;
  isNum(v: unknown): v is number;
  num(v: unknown, d?: number): string;
  seal(src: string, info?: { science_status?: string; rate_source?: string } | null): string;
  liveFromCompare(data: LiveCompare | null | undefined): LiveSeries | null;
  summaryFromMetrics(m: LiveMetrics | null | undefined): { sunlitH: number; earthH: number; darkH: number; blockH: number; durationH: number } | null;
  delayRow(o: LiveDelayOption): { delay_hours?: number; kind?: string; science_status?: string; darkH?: number; blockH?: number; admissible: boolean; breached: string[]; consumables: unknown };
  horizonFromSky(list?: LiveHorizonPoint[] | null): ((az: number) => number) | null;
  skyFromResponse(res: LiveResult | null | undefined): { samples: LiveSkySample[]; horizon: ((az: number) => number) | null; science_status?: string; start_utc?: string; end_utc?: string; step_seconds?: number; next_transitions: LiveNextTransitions | null } | null;
  badges(state?: LiveBadgeState | null): { kind: string; text: string }[];
}
// Pure helpers that decide where a number on screen comes from (API or browser model) and how it is
// labelled. No DOM here, so node --test can exercise it.
(function (root: Record<string, unknown>) {
  "use strict";

  const SEAL_LOCAL = "SYNTHETIC · browser model";
  const SEAL_NOSRC = "illustrative · no source";

  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  // Absent, null, NaN or non-number => "—". A real 0 stays "0".
  function num(v: unknown, d?: number) { return isNum(v) ? v.toFixed(d === undefined ? 1 : d) : "—"; }

  // Seal text for a value: API-sourced values carry the API's own science_status (+ rate_source when given).
  function seal(src: string, info?: { science_status?: string; rate_source?: string } | null) {
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
  function liveFromCompare(data: LiveCompare | null | undefined): LiveSeries | null {
    const r = data && data.results && data.results[0];
    if (!r || r.data_status !== "AVAILABLE" || !r.evaluation || !Array.isArray(r.evaluation.series) || !r.evaluation.series.length) return null;
    const m = r.evaluation.metrics || ({} as LiveMetrics);
    return {
      points: r.evaluation.series, metrics: m,
      science_status: r.science_status, engine_science_status: r.engine_science_status,
      data_status: r.data_status,
      stepH: m.step_hours, sampleCount: m.sample_count
    };
  }

  // Headline hours straight from the API metrics (same numbers a curl shows).
  function summaryFromMetrics(m: LiveMetrics | null | undefined) {
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
  function delayRow(o: LiveDelayOption) {
    const m = o.metrics || ({} as Partial<LiveMetrics>);
    return {
      delay_hours: o.delay_hours, kind: o.kind, science_status: o.science_status,
      darkH: m.longest_continuous_dark_hours, blockH: m.longest_continuous_comm_gap_hours,
      admissible: o.admissible === true,
      breached: (o.breached || []).map(b => b.criterion + " " + b.value + " " + b.comparator + " " + b.limit + " " + b.unit),
      consumables: o.consumables || null
    };
  }

  // Terrain horizon (list of {azimuth_deg, elevation_deg}) -> function(az) with wrap-around linear interpolation.
  function horizonFromSky(list?: LiveHorizonPoint[] | null): ((az: number) => number) | null {
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
  function skyFromResponse(res: LiveResult | null | undefined) {
    if (!res || !res.ok || !res.data || !Array.isArray(res.data.samples) || !res.data.samples.length) return null;
    return { samples: res.data.samples, horizon: horizonFromSky(res.data.terrain_horizon), science_status: res.data.science_status, start_utc: res.data.start_utc, end_utc: res.data.end_utc, step_seconds: res.data.step_seconds, next_transitions: res.data.next_transitions || null };
  }

  // Header badges from /readyz, /v1/capabilities and the live science_status. Always ends with the permanent no-flight chip.
  function badges(state?: LiveBadgeState | null) {
    const s = state || {};
    // Permanent honesty chips (same text as the static HTML fallback), whatever the API says.
    const out: { kind: string; text: string }[] = [{ kind: "warn", text: "PROTÓTIPO · sintético" }, { kind: "warn", text: "Não validado" }];
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
  function stepOf(tr: { ms: number }[] | null | undefined, fallbackMin: number) {
    const d = tr && tr.length > 1 ? tr[1].ms - tr[0].ms : NaN;
    return Number.isFinite(d) && d > 0 ? Math.round(d / 60000) : fallbackMin;
  }
  // Stamp each browser-model sample with its epoch ms, so every view reads the same field the API track has.
  function stamp<T extends object>(tr: T[], startMs: number, stepMin: number): (T & { i: number; ms: number })[] {
    return tr.map((s, i) => ({ ...s, i, ms: startMs + i * stepMin * 60e3 }));
  }

  // API refusal body is {"error": message, "code": CODE}. Returns { code, message } (code null if the body is not that JSON).
  function parseApiError(res: { error?: string } | null | undefined) {
    let o: { code?: string; error?: string } | null = null;
    try { o = JSON.parse((res && res.error) as string); } catch (e) { o = null; }
    if (o && typeof o === "object" && (o.code || o.error)) return { code: o.code || null, message: String(o.error || "") };
    return { code: null, message: String((res && res.error) || "sem detalhe") };
  }
  // Limit the API states in its own refusal text ("... onboard limit of 480", "... 1 to 3 sites"); null if absent.
  function limitFromMessage(msg: string | null | undefined, kind: string) {
    const m = kind === "samples" ? /limit of (\d+)/.exec(msg || "") : /1 to (\d+)/.exec(msg || "");
    return m ? Number(m[1]) : null;
  }
  // Refusal text for the panels: any non-zero status means the API answered and said no.
  function refusalText(res: { status: number; error?: string }) {
    const e = parseApiError(res);
    return "A API respondeu HTTP " + res.status + " e recusou o pedido" + (e.code ? " (" + e.code + ")" : "") + ": " + e.message;
  }
  // Up to `max` ids: the user's picks in order, deduplicated. Empty picks fall back to the current site.
  function pickSites(selected: string[] | null | undefined, current: string, max: number) {
    const out: string[] = [];
    (selected && selected.length ? selected : [current]).forEach(id => { if (id && !out.includes(id) && out.length < max) out.push(id); });
    return out;
  }
  // next_transitions of GET /api/sites/{id}/sky -> rows { label, text } (never invents a value; null => its reason).
  function transitionRows(nt: LiveNextTransitions | null | undefined) {
    if (!nt) return null;
    const one = (label: string, t: LiveTransition | null | undefined, reason: string | null | undefined, names: Record<string, string>) => {
      if (!t) return { label, text: "sem transição: " + (reason || "motivo não informado pela API") };
      const hrs = Number(t.hours_from_start);
      const res = Number(t.resolution_seconds);
      return { label, text: (names[t.kind] || t.kind) + " em " + (Number.isFinite(hrs) ? hrs.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "?") + " h (" + t.epoch_utc +
        "); resolução " + (Number.isFinite(res) ? res + " s" : "?") + ": a mudança ocorreu entre " + t.last_unchanged_utc + " e " + t.epoch_utc + ", sem interpolar" };
    };
    return [
      one("Sol", nt.sun, nt.sun_null_reason, { sunrise: "nascer do Sol", sunset: "pôr do Sol" }),
      one("Terra", nt.earth, nt.earth_null_reason, { earth_rise: "Terra nasce", earth_set: "Terra se põe" })
    ];
  }

  const api: OnboardLiveApi = { parseApiError, limitFromMessage, refusalText, pickSites, transitionRows, stepOf, stamp, SEAL_LOCAL, SEAL_NOSRC, isNum, num, seal, liveFromCompare, summaryFromMetrics, delayRow, horizonFromSky, skyFromResponse, badges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OnboardLive = api;
})((typeof window !== "undefined" ? window : globalThis) as unknown as Record<string, unknown>);
