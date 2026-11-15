// Scenario state lives in the query string, so a URL reproduces the screen.
// Keys: site, start (ISO UTC), hours, layer (answer|why|proof), task (explore|class|plan),
// lang, night, blackout, battery (assumed limits, editable by the user).
export const LAYERS = ["answer", "why", "proof"];
export const TASKS = { explore: "answer", class: "why", plan: "proof" };
// Assumed limits declared by the user; these are only editable defaults (contract rule 5).
export const DEFAULT_RULES = Object.freeze({ night: 60, blackout: 72, battery: 30 });
const NUM = ["hours", "night", "blackout", "battery"];

export function parseState(search = globalThis.location?.search || "") {
  const q = new URLSearchParams(search);
  const s = { site: q.get("site") || null, start: q.get("start") || null, hours: null,
    layer: null, task: q.get("task") || null, lang: q.get("lang") || null, ...DEFAULT_RULES };
  for (const k of NUM) if (q.has(k)) { const v = Number(q.get(k)); if (Number.isFinite(v) && v > 0) s[k] = k === "hours" ? Math.max(1, Math.round(v)) : v; }
  if (s.start && Number.isNaN(Date.parse(s.start))) s.start = null;
  // AUD-15: series are hourly; a fractional window or a start off the hour would count samples that do not
  // match the declared duration. Accept whole hours only, and start on the hour (UTC), like the Go API grid.
  if (s.hours != null && !Number.isInteger(s.hours)) s.hours = null;
  if (s.start && Date.parse(s.start) % 3600000 !== 0) s.start = null;
  if (!(s.task in TASKS)) s.task = null;
  const l = q.get("layer");
  s.layer = LAYERS.includes(l) ? l : (s.task ? TASKS[s.task] : "answer");
  return s;
}

export function toQuery(state) {
  const q = new URLSearchParams();
  for (const k of ["site", "start", "hours", "layer", "task", "lang"]) if (state[k] != null) q.set(k, String(state[k]));
  for (const k of Object.keys(DEFAULT_RULES)) if (state[k] != null && state[k] !== DEFAULT_RULES[k]) q.set(k, String(state[k]));
  return q.toString();
}

let listeners = [];
let cur = null;
export function getState() { return cur || (cur = parseState()); }
/** Merge a patch, write it to the URL (replaceState, no reload) and notify listeners. */
export function setState(patch) {
  cur = { ...getState(), ...patch };
  if (globalThis.history) history.replaceState(null, "", "?" + toQuery(cur) + location.hash);
  for (const fn of listeners) fn(cur);
  return cur;
}
export function onState(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; }
/** Link to another screen carrying the current scenario. */
export function hrefTo(page, state = getState()) { const q = toQuery(state); return page + (q ? "?" + q : ""); }
