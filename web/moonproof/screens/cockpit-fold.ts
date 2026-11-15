// Cockpit declutter (owner request 2026-11-15): secondary cards fold into compact accordions, closed by default.
// Pure helpers (no DOM) so the default can be tested: state is per tab session, never invented — closed unless the user opened it.
/** Mission rules always visible; the rest sit behind "+N rules". */
export const RULES_SHOWN = 3;
export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
const key = (id: string) => "mp-ck-acc:" + id;
export function sessionStore(): Store | null { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
/** Open only if the user opened it earlier in this tab session. Missing, unreadable or private-mode storage = closed. */
export function foldOpen(store: Store | null, id: string): boolean { try { return store?.getItem(key(id)) === "1"; } catch { return false; } }
export function foldSave(store: Store | null, id: string, open: boolean): void { try { store?.setItem(key(id), open ? "1" : "0"); } catch { /* private mode */ } }
/** First RULES_SHOWN rules stay in view; `more` is what the "+N rules" button reveals. */
export function splitRules<T>(list: readonly T[], shown = RULES_SHOWN): { head: T[]; more: T[] } { return { head: list.slice(0, shown), more: list.slice(shown) }; }
