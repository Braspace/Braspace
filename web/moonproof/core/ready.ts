// First-paint gate. Screens build their panels from JS, so the first frame used to show empty
// containers that then grew (measured CLS 0.34-0.87 on phones). components.css keeps the page
// hidden (visibility, which layout-shift ignores) until the screen's first render has run; this
// adds .mp-ready on the next frame, before that frame paints.
// A screen that awaits data before its first draw calls holdReady() at the top of its module
// and markReady() after that draw. The timeouts cover hidden tabs (rAF never fires) and a hung
// fetch; the CSS animation in components.css covers a script that throws.
let held = 0;
const root = (): HTMLElement | null => (typeof document === "undefined" ? null : document.documentElement);
const go = () => { if (!held) root()?.classList?.add("mp-ready"); };
export function holdReady(): void { held = 1; setTimeout(markReady, 1800); }
export function markReady(): void { held = 0; go(); }
if (root()) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
  setTimeout(go, 250);
}
