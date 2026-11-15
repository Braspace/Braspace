// Fold desktop panels away to see the map / 3D Moon (owner request 2026-11-15): side panels slide to their side,
// the bottom dock and player slide down. One small glass button per panel, keyboard and screen-reader friendly
// (aria-controls / aria-expanded), state kept per page for the tab session. Phones keep their own sheet (≤ 900 px).
// Screens are untouched: core/shell.ts calls enhancePanels() once and it waits for the panels to appear.
import { register, t } from "./i18n.js";
register({
    en: { "fold.left.hide": "Hide left panel", "fold.left.show": "Show left panel", "fold.right.hide": "Hide right panel",
        "fold.right.show": "Show right panel", "fold.bottom.hide": "Hide bottom controls", "fold.bottom.show": "Show bottom controls" },
    "pt-BR": { "fold.left.hide": "Recolher painel esquerdo", "fold.left.show": "Mostrar painel esquerdo", "fold.right.hide": "Recolher painel direito",
        "fold.right.show": "Mostrar painel direito", "fold.bottom.hide": "Recolher controles de baixo", "fold.bottom.show": "Mostrar controles de baixo" },
});
/** Panels that can fold, with the side they slide to. Order = priority when several exist. */
export const FOLDABLE = [["#left", "left"], ["#right", "right"], ["#dock", "bottom"], ["#player", "bottom"]];
const ICON = { left: ["‹", "›"], right: ["›", "‹"], bottom: ["⌄", "⌃"] };
const DESKTOP = "(min-width: 901px)";
const key = (id) => "mp-fold:" + location.pathname + ":" + id;
const load = (id) => { try {
    return sessionStorage.getItem(key(id)) === "1";
}
catch {
    return false;
} };
const save = (id, v) => { try {
    sessionStorage.setItem(key(id), v ? "1" : "0");
}
catch { /* private mode */ } };
/** Where the button sits (visual px): on the panel's inner edge when open, on the screen edge when folded. */
export function buttonPlace(side, r, folded, W, H) {
    const bw = 28, bh = 44;
    if (side === "left")
        return { left: folded ? 8 : Math.min(W - bw - 8, r.right + 6), top: Math.max(76, Math.min(H - bh - 8, r.top + 13)) };
    if (side === "right")
        return { left: folded ? W - bw - 8 : Math.max(8, r.left - bw - 6), top: Math.max(76, Math.min(H - bh - 8, r.top + 13)) };
    return { left: Math.max(8, Math.min(W - 44 - 8, r.left + r.width / 2 - 22)), top: folded ? H - 28 - 8 : Math.max(76, r.top - 28 - 6) };
}
export function enhancePanels() {
    if (typeof document === "undefined" || !globalThis.matchMedia)
        return;
    const folds = [];
    // Mutations and resizes arrive in bursts while screens render: lay the buttons out once per frame,
    // not once per mutation (each pass reads getComputedStyle/getBoundingClientRect and forced layout: ~90 ms on load).
    let queued = 0;
    const place = () => { if (!queued)
        queued = requestAnimationFrame(() => { queued = 0; placeNow(); }); };
    const placeNow = () => {
        const desk = matchMedia(DESKTOP).matches, W = innerWidth, H = innerHeight;
        for (const f of folds) {
            f.btn.hidden = !desk || !f.panel.isConnected || getComputedStyle(f.panel).display === "none";
            if (f.btn.hidden)
                continue;
            const p = buttonPlace(f.side, f.panel.getBoundingClientRect(), f.folded, W, H);
            f.btn.style.left = p.left + "px";
            f.btn.style.top = p.top + "px";
        }
    };
    const apply = (f, folded, persist = true) => {
        f.folded = folded;
        f.panel.dataset.folded = String(folded);
        f.btn.setAttribute("aria-expanded", String(!folded));
        f.btn.setAttribute("aria-label", t("fold." + f.side + (folded ? ".show" : ".hide")));
        f.btn.title = f.btn.getAttribute("aria-label") || "";
        f.btn.textContent = ICON[f.side][folded ? 1 : 0];
        if (persist)
            save(f.panel.id, folded);
        // The map re-frames on resize (core/terrain freeArea): give it the new free area after the slide.
        setTimeout(() => { place(); dispatchEvent(new Event("resize")); }, 260);
    };
    const attach = () => {
        for (const [sel, side] of FOLDABLE) {
            const panel = document.querySelector(sel);
            if (!panel || panel.dataset.fold)
                continue;
            if (getComputedStyle(panel).position !== "fixed")
                continue; // only floating panels; in-flow layouts stay as designed
            panel.dataset.fold = side;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "mp-fold";
            btn.dataset.side = side;
            btn.setAttribute("aria-controls", panel.id);
            const f = { panel, side, btn, folded: false };
            btn.addEventListener("click", () => apply(f, !f.folded));
            document.body.append(btn);
            folds.push(f);
            apply(f, load(panel.id), false);
        }
        place();
    };
    const mo = new MutationObserver(() => { attach(); place(); });
    mo.observe(document.body, { childList: true });
    addEventListener("resize", place);
    if (document.readyState === "loading")
        addEventListener("DOMContentLoaded", attach, { once: true });
    else
        attach();
    setTimeout(attach, 1500); // screens render their panels after top-level awaits (sites, series)
}
