// Kit Planejamento: pure model for the reproducible link (rules= + version). No DOM, no network.
// mast/slope/sunMode/step are editable defaults (assumed limits); night/blackout/battery come from core/state.js.
import { DEFAULT_RULES } from "../core/state.js";

export const PLAN_DEFAULTS = Object.freeze({ ...DEFAULT_RULES, mast: 2, slope: 8, sunMode: "center", step: 1 });
/** Order of the numbers inside `rules=`. */
export const RULE_KEYS = Object.freeze(["night", "blackout", "battery", "mast", "slope"]);
const SUN_MODES = ["center", "limb"];
const STEPS = [1, 3];

/** Rules from a query string: `rules=a,b,c,d,e` wins, then the single params, then the defaults. */
export function parseRules(search = "") {
  const q = new URLSearchParams(search);
  const out = { ...PLAN_DEFAULTS };
  const num = v => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  for (const k of RULE_KEYS) { const v = num(q.get(k)); if (v != null) out[k] = v; }
  const list = (q.get("rules") || "").split(",");
  if (list.length === RULE_KEYS.length && list.every(v => num(v) != null)) RULE_KEYS.forEach((k, i) => { out[k] = Number(list[i]); });
  if (SUN_MODES.includes(q.get("sunMode"))) out.sunMode = q.get("sunMode");
  if (STEPS.includes(Number(q.get("step")))) out.step = Number(q.get("step"));
  return out;
}

/** Git-style short id for a hex commit; any other version string is kept as is. */
export function shortVersion(v) { return /^[0-9a-f]{40}$/i.test(String(v || "")) ? String(v).slice(0, 7) : v ? String(v) : null; }

/** Same page, same scenario, plus `rules=` and (only when the deployment publishes one) `v=`. */
export function shareUrl(href, rules, version) {
  const u = new URL(href);
  const p = u.searchParams;
  p.set("rules", RULE_KEYS.map(k => rules[k]).join(","));
  for (const k of ["sunMode", "step"]) rules[k] === PLAN_DEFAULTS[k] ? p.delete(k) : p.set(k, String(rules[k]));
  const v = shortVersion(version);
  v ? p.set("v", v) : p.delete("v");
  u.search = p.toString().replace(/%2C/gi, ",");
  return u.toString();
}
