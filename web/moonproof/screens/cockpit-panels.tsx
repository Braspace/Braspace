// Cockpit panel controller. The telemetry and scene remain mounted; only visibility changes.
import { h, render } from "../../vendor/preact/preact.module.js";

export const PANEL_IDS = ["battery", "visibility", "illumination", "rules", "alerts", "faults", "crew", "timeline", "report"] as const;
export type PanelId = typeof PANEL_IDS[number];
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

export function layoutState(hidden: ReadonlySet<PanelId>) {
  const left = PANEL_IDS.slice(0, 3).every(id => hidden.has(id));
  const right = PANEL_IDS.slice(3, 7).every(id => hidden.has(id));
  return { left, right, sheet: left && right, timeline: hidden.has("timeline"), report: hidden.has("report") };
}

/** Uses the existing lazy Three.js Moon button; never creates another WebGL renderer. */
export function requestSharedMoon(isStillWanted: () => boolean = () => true): boolean {
  if (typeof document === "undefined" || !isStillWanted()) return false;
  const open = () => {
    // A lazy backdrop must not open after the user has already restored panels.
    if (!isStillWanted()) return false;
    const btn = document.querySelector<HTMLButtonElement>(".moon-ui .moon-open");
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  };
  if (open()) return true;
  // The lazy backdrop creates its control after load, not at script evaluation.
  if (document.readyState !== "complete") {
    addEventListener("load", () => { setTimeout(open, 100); }, { once: true });
    return true;
  }
  setTimeout(open, 100);
  return false;
}

export function mountCockpitPanels(host: HTMLElement): () => void {
  let hidden = new Set<PanelId>();
  let previous = new Set<PanelId>();
  let moonRequestRevision = 0; // invalidate callbacks across Moon-only -> restore -> Moon-only
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
    root.dataset.ckHidden = PANEL_IDS.filter(id => hidden.has(id)).join(" ");
    const state = layoutState(hidden);
    for (const [key, value] of Object.entries(state)) root.toggleAttribute(`data-ck-hide-${key}`, value);
  };
  const paint = () => {
    sync();
    const l = language(), pt = l === "pt-BR", clear = hidden.size === PANEL_IDS.length;
    const change = (id: PanelId) => { hidden = togglePanel(hidden, id); paint(); };
    render(<div class="ck-panel-toolbar" role="group" aria-label={pt ? "Visibilidade dos painéis do cockpit" : "Cockpit panel visibility"}>
      <button type="button" class="mp-pill ck-panel-focus" aria-pressed={clear} onClick={() => { const request = ++moonRequestRevision; if (clear) hidden = new Set(previous); else { previous = new Set(hidden); hidden = new Set(PANEL_IDS); requestSharedMoon(() => request === moonRequestRevision && hidden.size === PANEL_IDS.length); } paint(); }}>
        {clear ? (pt ? "Restaurar painéis" : "Restore panels") : (pt ? "Só a Lua" : "Moon only")}
      </button>
      <details class="ck-panel-menu" onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
        <summary class="mp-pill">{pt ? "Painéis" : "Panels"} · {PANEL_IDS.length - hidden.size}/{PANEL_IDS.length}</summary>
        <div class="ck-panel-options">
          {PANEL_IDS.map(id => <button key={id} data-panel={id} type="button" class="mp-pill" aria-pressed={!hidden.has(id)} onClick={() => change(id)}><span aria-hidden="true">{hidden.has(id) ? "+" : "−"}</span>{LABELS[l][id]}</button>)}
          <button type="button" class="mp-pill" onClick={() => { hidden = new Set(); paint(); }}>{pt ? "Abrir todos" : "Open all"}</button>
        </div>
      </details>
    </div>, host);
    align();
  };
  const observer = new MutationObserver(observeContext);
  observer.observe(root, { childList: true });
  const langObserver = new MutationObserver(paint);
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  resize.observe(host);
  observeContext(); paint();
  return () => { observer.disconnect(); langObserver.disconnect(); resize.disconnect(); render(null, host); delete root.dataset.ckHidden; for (const key of Object.keys(layoutState(hidden))) root.removeAttribute(`data-ck-hide-${key}`); root.style.removeProperty("--ck-panels-top"); };
}

const host = typeof document !== "undefined" ? document.getElementById("ck-panel-controls") : null;
if (host) mountCockpitPanels(host);
