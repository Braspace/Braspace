// Cockpit declutter (owner request 2026-11-15): secondary cards fold into compact accordions, closed by default.
// Pure helpers (no DOM) so the default can be tested: state is per tab session, never invented — closed unless the user opened it.
/** Mission rules always visible; the rest sit behind "+N rules". */
export const RULES_SHOWN = 3;
const key = (id) => "mp-ck-acc:" + id;
export function sessionStore() { try {
    return globalThis.sessionStorage ?? null;
}
catch {
    return null;
} }
/** Open only if the user opened it earlier in this tab session. Missing, unreadable or private-mode storage = closed. */
export function foldOpen(store, id) { try {
    return store?.getItem(key(id)) === "1";
}
catch {
    return false;
} }
export function foldSave(store, id, open) { try {
    store?.setItem(key(id), open ? "1" : "0");
}
catch { /* private mode */ } }
/** First RULES_SHOWN rules stay in view; `more` is what the "+N rules" button reveals. */
export function splitRules(list, shown = RULES_SHOWN) { return { head: list.slice(0, shown), more: list.slice(shown) }; }
