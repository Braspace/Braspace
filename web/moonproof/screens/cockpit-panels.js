// Cockpit panel controller. The telemetry and scene remain mounted; only visibility changes.
import { h, render } from "../../vendor/preact/preact.module.js";
export const PANEL_IDS = ["battery", "visibility", "illumination", "rules", "alerts", "faults", "crew", "timeline", "report"];
const LABELS = {
    en: { battery: "Battery", visibility: "Sun & Earth", illumination: "Illumination", rules: "Mission rules", alerts: "Alerts", faults: "Fault simulator", crew: "Crew & energy", timeline: "Timeline", report: "Report" },
    "pt-BR": { battery: "Bateria", visibility: "Sol e Terra", illumination: "Iluminação", rules: "Regras da missão", alerts: "Alertas", faults: "Simular falhas", crew: "Tripulação e energia", timeline: "Linha do tempo", report: "Relatório" },
};
export function togglePanel(hidden, id) {
    const next = new Set(hidden);
    if (next.has(id))
        next.delete(id);
    else
        next.add(id);
    return next;
}
export function layoutState(hidden) {
    const left = PANEL_IDS.slice(0, 3).every(id => hidden.has(id));
    const right = PANEL_IDS.slice(3, 7).every(id => hidden.has(id));
    return { left, right, sheet: left && right, timeline: hidden.has("timeline"), report: hidden.has("report") };
}
/** Uses the existing lazy Three.js Moon button; never creates another WebGL renderer. */
export function requestSharedMoon() {
    if (typeof document === "undefined")
        return false;
    const open = () => {
        const btn = document.querySelector(".moon-ui .moon-open");
        if (!btn || btn.disabled)
            return false;
        btn.click();
        return true;
    };
    if (open())
        return true;
    // The lazy backdrop creates its control after load, not at script evaluation.
    if (document.readyState !== "complete") {
        addEventListener("load", () => { setTimeout(open, 100); }, { once: true });
        return true;
    }
    setTimeout(open, 100);
    return false;
}

export function mountCockpitPanels(host) {
    let hidden = new Set();
    let previous = new Set();
    let context = null;
    const root = document.body;
    const language = () => document.documentElement.lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
    const align = () => {
        const bottom = context?.getBoundingClientRect().bottom;
        if (bottom && bottom > 0)
            host.style.setProperty("--ck-context-end", `${Math.ceil(bottom + 8)}px`);
        const toolbarEnd = Math.ceil(host.getBoundingClientRect().top + (host.querySelector(".ck-panel-toolbar")?.getBoundingClientRect().height || 44) + 8);
        root.style.setProperty("--ck-panels-top", `${toolbarEnd}px`);
    };
    const resize = new ResizeObserver(align);
    const observeContext = () => {
        const next = document.querySelector(".mp-context");
        if (next !== context) {
            if (context)
                resize.unobserve(context);
            context = next;
            if (context)
                resize.observe(context);
        }
        align();
    };
    const sync = () => {
        root.dataset.ckHidden = PANEL_IDS.filter(id => hidden.has(id)).join(" ");
        const state = layoutState(hidden);
        for (const [key, value] of Object.entries(state))
            root.toggleAttribute(`data-ck-hide-${key}`, value);
    };
    const paint = () => {
        sync();
        const l = language(), pt = l === "pt-BR", clear = hidden.size === PANEL_IDS.length;
        const change = (id) => { hidden = togglePanel(hidden, id); paint(); };
        render(h("div", { class: "ck-panel-toolbar", role: "group", "aria-label": pt ? "Visibilidade dos painéis do cockpit" : "Cockpit panel visibility" },
            h("button", { type: "button", class: "mp-pill ck-panel-focus", "aria-pressed": clear, onClick: () => { if (clear)
                    hidden = new Set(previous);
                else {
                    previous = new Set(hidden);
                    hidden = new Set(PANEL_IDS);
                    requestSharedMoon();
                } paint(); } }, clear ? (pt ? "Restaurar painéis" : "Restore panels") : (pt ? "Só a Lua" : "Moon only")),
            h("details", { class: "ck-panel-menu", onKeyDown: e => { if (e.key === "Escape") {
                    e.currentTarget.open = false;
                    e.currentTarget.querySelector("summary")?.focus();
                } } },
                h("summary", { class: "mp-pill" },
                    pt ? "Painéis" : "Panels",
                    " \u00B7 ",
                    PANEL_IDS.length - hidden.size,
                    "/",
                    PANEL_IDS.length),
                h("div", { class: "ck-panel-options" },
                    PANEL_IDS.map(id => h("button", { key: id, type: "button", class: "mp-pill", "aria-pressed": !hidden.has(id), onClick: () => change(id) },
                        h("span", { "aria-hidden": "true" }, hidden.has(id) ? "+" : "−"),
                        LABELS[l][id])),
                    h("button", { type: "button", class: "mp-pill", onClick: () => { hidden = new Set(); paint(); } }, pt ? "Abrir todos" : "Open all")))), host);
        align();
    };
    const observer = new MutationObserver(observeContext);
    observer.observe(root, { childList: true });
    const langObserver = new MutationObserver(paint);
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    resize.observe(host);
    observeContext();
    paint();
    return () => { observer.disconnect(); langObserver.disconnect(); resize.disconnect(); render(null, host); delete root.dataset.ckHidden; for (const key of Object.keys(layoutState(hidden)))
        root.removeAttribute(`data-ck-hide-${key}`); root.style.removeProperty("--ck-panels-top"); };
}
const host = typeof document !== "undefined" ? document.getElementById("ck-panel-controls") : null;
if (host)
    mountCockpitPanels(host);
