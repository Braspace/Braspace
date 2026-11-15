// Pure logic for C Comparar and D Replanejar (no DOM, no fetch): rules → pass/fail, verdict, slack, exits.
// Every input is a sourced number or null; null stays null (never 0). Limits are the user's assumed limits.
export const HOUR_MS = 3600 * 1000;
const num = v => typeof v === "number" && Number.isFinite(v);

/** m = {dark, blackout} hours; rules = {night, blackout} assumed limits. status "nd" when a needed value is missing. */
export function judge(m, rules) {
  if (!m || !num(m.dark) || !num(m.blackout)) return { status: "nd", reasons: [] };
  const reasons = [];
  if (m.dark > rules.night) reasons.push({ key: "night", value: m.dark, limit: rules.night });
  if (m.blackout > rules.blackout) reasons.push({ key: "blackout", value: m.blackout, limit: rules.blackout });
  return { status: reasons.length ? "fail" : "pass", reasons };
}
/** Hours of margin to the tighter rule (negative = violated). null without data. */
export function slack(m, rules) {
  if (!m || !num(m.dark) || !num(m.blackout)) return null;
  return Math.min(rules.night - m.dark, rules.blackout - m.blackout);
}
/** Verdict as data (the screen words it): winners = indexes meeting every rule. */
export function verdictOf(judged, bothPcts = []) {
  const known = judged.map((j, i) => ({ j, i })).filter(x => x.j.status !== "nd");
  if (!known.length) return { kind: "nodata", winners: [], best: null };
  const winners = known.filter(x => x.j.status === "pass").map(x => x.i);
  if (!winners.length) return { kind: "none", winners, best: null };
  let best = winners[0];
  for (const i of winners) if ((bothPcts[i] ?? -1) > (bothPcts[best] ?? -1)) best = i;
  return { kind: winners.length === 1 ? "single" : "multi", winners, best };
}
/** Longest run of `false` in flags → {start, len} (hours). */
export function longestRun(flags, value = false) {
  let best = { start: -1, len: 0 }, cur = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === value) { cur++; if (cur > best.len) best = { start: i - cur + 1, len: cur }; } else cur = 0;
  }
  return best;
}
/** Per-day fraction of true flags; a day with no sample → null. */
export function dailyFractions(flags) {
  const out = [];
  for (let d = 0; d * 24 < flags.length; d++) {
    const day = flags.slice(d * 24, d * 24 + 24);
    const known = day.filter(v => v != null); // AUD-14: null = outside the series, not "no Sun"
    out.push(known.length ? known.filter(Boolean).length / known.length : null);
  }
  return out;
}
/**
 * Exits for a delayed landing. metricsAt(siteId, startMs, hours) → {dark, blackout, sunPct, earthPct} | null (outside series).
 * Only exits with a computed result and meeting the rules are returned, sorted by slack (largest first).
 */
export function computeExits({ metricsAt, siteId, siteIds, startMs, hours, delayH, rules, searchDays, stepH = 24 }) {
  const t1 = startMs + delayH * HOUR_MS, out = [];
  // wait: first start after the delayed one (day steps) where the same window passes
  for (let k = 0; k <= searchDays; k++) {
    const s = t1 + k * stepH * HOUR_MS, m = metricsAt(siteId, s, hours);
    if (!m) break;
    if (judge(m, rules).status === "pass") { out.push({ kind: "wait", siteId, startMs: s, hours, m, slack: slack(m, rules) }); break; }
  }
  // switch: best other site at the delayed start, same duration
  let sw = null;
  for (const id of siteIds) {
    if (id === siteId) continue;
    const m = metricsAt(id, t1, hours);
    if (!m || judge(m, rules).status !== "pass") continue;
    const c = { kind: "switch", siteId: id, startMs: t1, hours, m, slack: slack(m, rules) };
    if (!sw || c.slack > sw.slack) sw = c;
  }
  if (sw) out.push(sw);
  // shorten: longest shorter window (day steps) at the delayed start that passes
  for (let h = hours - stepH; h >= stepH; h -= stepH) {
    const m = metricsAt(siteId, t1, h);
    if (m && judge(m, rules).status === "pass") { out.push({ kind: "shorten", siteId, startMs: t1, hours: h, m, slack: slack(m, rules) }); break; }
  }
  return out.filter(e => e.slack != null).sort((a, b) => b.slack - a.slack);
}
/** Scenario list in the URL hash: `#sc=site~startIso~hours,…` (hours optional); delay `d`, exit `x`. */
export function parseHash(h) {
  const q = new URLSearchParams(String(h || "").replace(/^#/, ""));
  const sc = (q.get("sc") || "").split(",").filter(Boolean).slice(0, 3).map(p => {
    const [site, start, hours] = p.split("~"); const hv = Number(hours);
    return { site, start: start && !Number.isNaN(Date.parse(start)) ? start : null, hours: Number.isFinite(hv) && hv > 0 ? hv : null };
  }).filter(s => s.site);
  const d = Number(q.get("d"));
  return { sc, d: Number.isFinite(d) && d > 0 ? d : null, x: q.get("x") || null };
}
export function buildHash({ sc = [], d = null, x = null }) {
  const q = new URLSearchParams();
  if (sc.length) q.set("sc", sc.map(s => [s.site, s.start || "", s.hours || ""].join("~")).join(","));
  if (d != null) q.set("d", String(d));
  if (x) q.set("x", x);
  return q.toString();
}
