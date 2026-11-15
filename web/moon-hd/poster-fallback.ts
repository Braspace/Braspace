// Poster of Joel's Moon HD south pole for browsers without (hardware) WebGL, a lost context or reduced data.
// Images are real GPU captures of web/moon-hd.html?view=pole (2025-03-06 12:00 UTC, renders/manifest.json,
// status CANDIDATE_PENDING_FIDELITY_APPROVAL) with the offline LOLA preview as the last fallback.
// Visual only: not a registered map, not a live SPICE prediction. No inline script or style attribute
// (CSP style-src 'self'): styling goes through CSSOM.

export type PosterView = "pole" | "globe";
export interface PosterOptions { view?: PosterView; lang?: "pt" | "en"; credit?: boolean }
export interface MoonPoster { el: HTMLElement; dispose(): void }

const BASE = new URL("./", import.meta.url).href;
export const POSTERS = {
  desktop: "renders/pole-gpu-desktop.webp",   // 1920×1080
  tablet: "renders/pole-gpu-tablet.webp",     // 1366×1024
  portrait: "renders/pole-gpu-portrait.webp", // 900×1600
  preview: "pole-preview.webp",               // 1200×800 offline LOLA heightfield (canonical fallback)
} as const;

/** Which capture fits a viewport best: portrait screens get the tall frame, mid widths the 4:3 frame. */
export function pickPoster(width: number, height: number): keyof typeof POSTERS {
  if (!(width > 0) || !(height > 0)) return "preview";
  if (height / width >= 1.2) return "portrait";
  if (width <= 1366) return "tablet";
  return "desktop";
}

export const CREDIT = {
  pt: "Lua: modelo Moon HD do Joel (BRASPACE), relevo NASA LRO/LOLA. Imagem ilustrativa do polo sul, não é mapa nem previsão.",
  en: "Moon: Joel's Moon HD model (BRASPACE), NASA LRO/LOLA relief. Illustrative south-pole image, not a map or prediction.",
} as const;

export function mountMoonPoster(host: HTMLElement, { view = "pole", lang = "pt", credit = true }: PosterOptions = {}): MoonPoster {
  const fig = document.createElement("figure");
  fig.className = "moon-poster"; fig.dataset.view = view;
  Object.assign(fig.style, { position: "absolute", inset: "0", margin: "0", overflow: "hidden", pointerEvents: "none", background: "#05070a" });
  const img = document.createElement("img");
  img.alt = ""; img.setAttribute("aria-hidden", "true"); img.decoding = "async"; img.draggable = false;
  Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
  let current = "", cap: HTMLElement | null = null;
  const choose = () => {
    // Phones: MoonProof's bottom navigation covers the last ~90 px, so the credit sits above it.
    if (cap) cap.style.bottom = (host.clientWidth || innerWidth) <= 700 ? "calc(96px + env(safe-area-inset-bottom, 0px))" : "8px";
    const key = pickPoster(host.clientWidth || innerWidth, host.clientHeight || innerHeight);
    if (key === current) return; current = key; fig.dataset.poster = key; img.src = BASE + POSTERS[key];
  };
  // A missing capture falls back to the canonical offline preview, once.
  img.addEventListener("error", () => { if (current !== "preview") { current = "preview"; fig.dataset.poster = "preview"; img.src = BASE + POSTERS.preview; } });
  fig.append(img);
  if (credit) {
    cap = document.createElement("figcaption");
    cap.textContent = CREDIT[lang];
    Object.assign(cap.style, { position: "absolute", left: "13px", bottom: "8px", maxWidth: "min(560px, calc(100% - 26px))", font: "500 11px/15px system-ui, sans-serif", color: "rgba(242,244,245,.72)", textShadow: "0 1px 2px #000" });
    fig.append(cap);
  }
  choose();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(choose) : null;
  ro?.observe(host);
  host.append(fig);
  return { el: fig, dispose() { ro?.disconnect(); fig.remove(); } };
}
