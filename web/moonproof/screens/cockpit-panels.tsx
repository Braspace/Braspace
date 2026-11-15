// Cockpit panel controller. The telemetry and scene remain mounted; only visibility changes.
import { h, render } from "../../vendor/preact/preact.module.js";

export const PANEL_IDS = ["battery", "visibility", "illumination", "rules", "alerts", "faults", "crew", "timeline", "report"] as const;
export type PanelId = typeof PANEL_IDS[number];
export interface PanelLayout { hidden: Set<PanelId>; previous: Set<PanelId>; }
const WIDE_VISIBLE = new Set<PanelId>(["battery", "rules", "timeline"]);
const NARROW_VISIBLE = new Set<PanelId>(["timeline"]);
type Language = "en" | "pt-BR";
const LABELS: Record<Language, Record<PanelId, string>> = {
  en: { battery: "Battery", visibility: "Sun & Earth", illumination: "Illumination", rules: "Mission rules", alerts: "Alerts", faults: "Fault simulator", crew: "Crew & energy", timeline: "Timeline", report: "Report" },
  "pt-BR": { battery: "Bateria", visibility: "Sol e Terra", illumination: "Iluminação", rules: "Regras da missão", alerts: "Alertas", faults: "Simular falhas", crew: "Tripulação e energia", timeline: "Linha do tempo", report: "Relatório" },
};

export function togglePanel(hidden: ReadonlySet<PanelId>, id: PanelId): Set<PanelId> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** Keep the map central on first visit; every hidden panel remains available in the menu. */
export function compactLayout(narrow: boolean): PanelLayout {
  const visible = narrow ? NARROW_VISIBLE : WIDE_VISIBLE;
  const hidden = new Set(PANEL_IDS.filter(id => !visible.has(id)));
  return { hidden, previous: new Set(hidden) };
}

/** Storage contains visibility only, never mission data. Corrupt/old versions use safe defaults. */
export function parsePanelLayout(raw: string | null, narrow: boolean): PanelLayout {
  if (!raw) return compactLayout(narrow);
  const valid = (v: unknown): v is PanelId[] => Array.isArray(v) && v.every(id => PANEL_IDS.includes(id)) && new Set(v).size === v.length;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || !("version" in v) || v.version !== 1 || !("hidden" in v) || !("previous" in v) || !valid(v.hidden) || !valid(v.previous) || v.previous.length === PANEL_IDS.length) return compactLayout(narrow);
    return { hidden: new Set(v.hidden), previous: new Set(v.previous) };
  } catch { return compactLayout(narrow); }
}

export function nextPanelLayout(layout: PanelLayout, hidden: Set<PanelId>): PanelLayout {
  const previous = hidden.size === PANEL_IDS.length ? (layout.hidden.size === PANEL_IDS.length ? layout.previous : layout.hidden) : hidden;
  return { hidden: new Set(hidden), previous: new Set(previous) };
}

export function toggleMoonFocus(layout: PanelLayout): PanelLayout {
  return nextPanelLayout(layout, layout.hidden.size === PANEL_IDS.length ? layout.previous : new Set(PANEL_IDS));
}

export function layoutState(hidden: ReadonlySet<PanelId>) {
  const left = PANEL_IDS.slice(0, 3).every(id => hidden.has(id));
  const right = PANEL_IDS.slice(3, 7).every(id => hidden.has(id));
  return { left, right, sheet: left && right, timeline: hidden.has("timeline"), report: hidden.has("report") };
}

export function mountCockpitPanels(host: HTMLElement): () => void {
  const viewport = matchMedia("(max-width: 900px)");
  const storageKey = () => `moonproof:cockpit-panels:v1:${viewport.matches ? "narrow" : "wide"}`;
  const read = () => { try { return parsePanelLayout(localStorage.getItem(storageKey()), viewport.matches); } catch { return compactLayout(viewport.matches); } };
  let layout = read();
  let context: Element | null = null;
  const root = document.body;
  const language = (): Language => document.documentElement.lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  const align = () => {
    const bottom = context?.getBoundingClientRect().bottom;
    if (bottom && bottom > 0) host.style.setProperty("--ck-context-end", `${Math.ceil(bottom + 8)}px`);
    const toolbarEnd = Math.ceil(host.getBoundingClientRect().top + (host.querySelector(".ck-panel-toolbar")?.getBoundingClientRect().height || 44) + 8);
    root.style.setProperty("--ck-panels-top", `${toolbarEnd}px`);
  };
  const resize = new ResizeObserver(align);
  const observeContext = () => {
    const next = document.querySelector(".mp-context");
    if (next !== context) { if (context) resize.unobserve(context); context = next; if (context) resize.observe(context); }
    align();
  };
  const sync = () => {
    const { hidden } = layout;
    root.dataset.ckHidden = PANEL_IDS.filter(id => hidden.has(id)).join(" ");
    const state = layoutState(hidden);
    for (const [key, value] of Object.entries(state)) root.toggleAttribute(`data-ck-hide-${key}`, value);
  };
  const closeMenu = (focus = false) => {
    const menu = host.querySelector<HTMLDetailsElement>(".ck-panel-menu");
    if (!menu?.open) return;
    menu.open = false;
    if (focus) menu.querySelector("summary")?.focus();
  };
  const persist = () => { try { localStorage.setItem(storageKey(), JSON.stringify({ version: 1, hidden: [...layout.hidden], previous: [...layout.previous] })); } catch { /* blocked storage must not block the cockpit */ } };
  const commit = (next: PanelLayout, close = false) => { layout = next; persist(); paint(); if (close) closeMenu(true); };
  const paint = () => {
    sync();
    const { hidden } = layout;
    const l = language(), pt = l === "pt-BR", clear = hidden.size === PANEL_IDS.length;
    const change = (id: PanelId) => commit(nextPanelLayout(layout, togglePanel(hidden, id)));
    render(<div class="ck-panel-toolbar" role="group" aria-label={pt ? "Visibilidade dos painéis do cockpit" : "Cockpit panel visibility"}>
      <button type="button" class="mp-pill ck-panel-focus" aria-pressed={clear} onClick={() => { commit(toggleMoonFocus(layout)); closeMenu(); }}>
        {clear ? (pt ? "Restaurar painéis" : "Restore panels") : (pt ? "Só a Lua" : "Moon only")}
      </button>
      <details class="ck-panel-menu" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); closeMenu(true); } }}>
        <summary class="mp-pill">{pt ? "Painéis" : "Panels"} · {PANEL_IDS.length - hidden.size}/{PANEL_IDS.length}</summary>
        <div class="ck-panel-options">
          {PANEL_IDS.map(id => <button key={id} type="button" class="mp-pill" aria-pressed={!hidden.has(id)} onClick={() => change(id)}><span aria-hidden="true">{hidden.has(id) ? "+" : "−"}</span>{LABELS[l][id]}</button>)}
          <button type="button" class="mp-pill" onClick={() => commit(compactLayout(viewport.matches), true)}>{pt ? "Modo compacto" : "Compact mode"}</button>
          <button type="button" class="mp-pill" onClick={() => commit(nextPanelLayout(layout, new Set()), true)}>{pt ? "Abrir todos" : "Open all"}</button>
        </div>
      </details>
    </div>, host);
    align();
  };
  const observer = new MutationObserver(observeContext);
  observer.observe(root, { childList: true });
  const langObserver = new MutationObserver(paint);
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  const onViewport = () => { layout = read(); paint(); closeMenu(); };
  viewport.addEventListener("change", onViewport);
  const onOutside = (event: PointerEvent) => { if (event.target instanceof Node && !host.contains(event.target)) closeMenu(); };
  document.addEventListener("pointerdown", onOutside);
  resize.observe(host);
  observeContext(); paint();
  return () => { observer.disconnect(); langObserver.disconnect(); resize.disconnect(); viewport.removeEventListener("change", onViewport); document.removeEventListener("pointerdown", onOutside); render(null, host); delete root.dataset.ckHidden; for (const key of Object.keys(layoutState(layout.hidden))) root.removeAttribute(`data-ck-hide-${key}`); root.style.removeProperty("--ck-panels-top"); };
}

const host = typeof document !== "undefined" ? document.getElementById("ck-panel-controls") : null;
if (host) mountCockpitPanels(host);
