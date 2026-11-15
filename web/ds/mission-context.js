// Mission context shared by the SPA, the Polar Lab, Moon HD and the multipage MoonProof:
// { siteId, t (UTC ms, whole hour), durationH, layer, lang, origin }.
// parseMission() validates; an unsupported value is reported in `warnings` (and the default is used),
// never dropped silently. The serialized form is the same flat key set everywhere: site, t, d (days), layer, lang, from.
export const DURATIONS_H = [168, 336, 672, 1344]; // 7, 14, 28, 56 days
export const DEFAULT_DURATION_H = 672;
export const LAYERS = ["answer", "why", "proof"];
export const LANGS = ["pt", "en"];
export const ORIGINS = ["shell", "lab", "moon-hd", "moonproof"];
const HOUR_MS = 3600e3;
const KEYS = ["site", "t", "d", "layer", "lang", "from"];

const get = (q, k) => (q instanceof URLSearchParams ? q.get(k) : q?.[k]) ?? "";
const iso = ms => new Date(ms).toISOString().slice(0, 13) + ":00Z";

/** ISO date ("2027-01-12") or hour ("2027-01-12T06:00[Z]") as UTC ms, NaN otherwise. */
export function parseUtc(raw) {
  const s = String(raw || "");
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}(:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return NaN;
  const full = s.length === 10 ? s + "T00:00Z" : /Z|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + (s.length === 13 ? ":00Z" : "Z");
  return Date.parse(full);
}

/**
 * query: URLSearchParams or plain object. opts: { siteIds?, window?: {start,end}, defaults?: {t, durationH} }.
 * Returns { ctx, warnings: [{ key, value, reason }] }; ctx fields are always valid (default or the given value).
 */
export function parseMission(query, { siteIds, window, defaults = {} } = {}) {
  const warnings = [], warn = (key, value, reason) => warnings.push({ key, value, reason });
  const ctx = { siteId: null, t: defaults.t ?? null, durationH: defaults.durationH ?? DEFAULT_DURATION_H, layer: null, lang: null, origin: null };

  const site = get(query, "site");
  if (site) {
    if (siteIds ? siteIds.includes(site) : /^[a-z0-9-]{1,64}$/.test(site)) ctx.siteId = site; else warn("site", site, "unknown-site");
  }
  const rawT = get(query, "t") || get(query, "start");
  if (rawT) {
    const ms = parseUtc(rawT);
    if (!Number.isFinite(ms)) warn("t", rawT, "invalid-time");
    else if (window && (ms < window.start || ms > window.end)) warn("t", rawT, "outside-coverage");
    else ctx.t = Math.floor(ms / HOUR_MS) * HOUR_MS;
  }
  const rawD = get(query, "d");
  if (rawD) {
    const h = /^\d{1,4}$/.test(rawD) ? Number(rawD) * 24 : NaN;
    if (DURATIONS_H.includes(h)) ctx.durationH = h; else warn("d", rawD, "unsupported-duration");
  }
  for (const [key, field, allowed] of [["layer", "layer", LAYERS], ["lang", "lang", LANGS], ["from", "origin", ORIGINS]]) {
    const v = get(query, key);
    if (v) { if (allowed.includes(v)) ctx[field] = v; else warn(key, v, "unsupported-" + key); }
  }
  return { ctx, warnings };
}

/** Flat record for URLs: only set fields; t as ISO hour, duration as days. */
export function serializeMission(ctx) {
  const o = {};
  if (ctx.siteId) o.site = ctx.siteId;
  if (Number.isFinite(ctx.t)) o.t = iso(ctx.t);
  if (DURATIONS_H.includes(ctx.durationH)) o.d = String(ctx.durationH / 24);
  if (LAYERS.includes(ctx.layer)) o.layer = ctx.layer;
  if (LANGS.includes(ctx.lang)) o.lang = ctx.lang;
  if (ORIGINS.includes(ctx.origin)) o.from = ctx.origin;
  return o;
}

/** The mission-relevant keys of a query, for links that must not lose the scenario. */
export const pickMissionKeys = q => Object.fromEntries(KEYS.map(k => [k, get(q, k)]).filter(([, v]) => v));

/** Multipage MoonProof state ({ site, start, hours, layer, lang }) as a mission context; unsupported values are warned. */
export function missionFromMultipage(st = {}) {
  const q = { site: st.site, t: st.start, layer: st.layer, lang: st.lang === "pt-BR" ? "pt" : st.lang };
  if (st.hours) q.d = String(Number(st.hours) / 24);
  return parseMission(q);
}

/** Polar Lab entry: lab.html#site=&t=&d=. */
export function labHref(ctx, base = "lab.html") {
  const { site, t, d } = serializeMission(ctx);
  const q = new URLSearchParams(Object.entries({ site, t, d }).filter(([, v]) => v));
  return base + (q.size ? "#" + q : "");
}

/** Moon HD entry: moon-hd.html?view=pole&lang=&start=&site=&d= (its clock reads `start`). */
export function moonHdHref(ctx, base = "moon-hd.html") {
  const s = serializeMission(ctx), q = new URLSearchParams({ view: "pole" });
  if (s.lang) q.set("lang", s.lang);
  if (s.t) q.set("start", s.t);
  if (s.site) q.set("site", s.site);
  if (s.d) q.set("d", s.d);
  return base + "?" + q;
}

const REASONS = {
  "unknown-site": "local desconhecido", "invalid-time": "data inválida", "outside-coverage": "fora da cobertura calculada",
  "unsupported-duration": "duração não suportada (use 7, 14, 28 ou 56 dias)", "unsupported-layer": "camada desconhecida",
  "unsupported-lang": "idioma desconhecido", "unsupported-from": "origem desconhecida", "window-end": "ajustado para caber na série calculada",
};
/** Human sentence (pt-BR) for the visible notice. */
export const warningText = w => `${w.key}=${w.value}: ${REASONS[w.reason] || w.reason}. Usando o padrão.`;
