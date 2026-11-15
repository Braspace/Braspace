// Moon HD: WebGL detection and the accessible problem state. Pure (no THREE, no DOM), so node can test it.
export const FALLBACK_HREF = "./polar-map-demo.html";

/** Is a WebGL 2 context available? THREE r181 needs WebGL 2. Never throws. */
export function detectWebGL(makeCanvas) {
  try {
    const canvas = makeCanvas();
    const gl = canvas?.getContext?.("webgl2");
    if (!gl) return { ok: false, reason: "no-context" };
    gl.getExtension?.("WEBGL_lose_context")?.loseContext(); // the probe must not eat a context slot
    return { ok: true, reason: "" };
  } catch (error) { return { ok: false, reason: "error:" + (error?.message || error) }; }
}

const WORDS = {
  en: { nowebgl: "This browser cannot draw the 3D Moon (WebGL is off or missing). The 2D polar map works without it.", failed: "Could not load the Moon HD data.", lost: "The graphics context was lost. Trying to recover it…", retry: "Try again", map: "Open the 2D polar map" },
  pt: { nowebgl: "Este navegador não consegue desenhar a Lua em 3D (WebGL desligado ou ausente). O mapa polar 2D funciona sem ele.", failed: "Não foi possível carregar os dados do Moon HD.", lost: "O contexto gráfico foi perdido. Tentando recuperar…", retry: "Tentar de novo", map: "Abrir o mapa polar 2D" },
};

/** What the overlay shows for a kind of problem: "nowebgl" | "failed" | "lost". Never a spinner. */
export function problemModel(kind, lang = "en") {
  const w = WORDS[lang] || WORDS.en, known = kind === "nowebgl" || kind === "failed" || kind === "lost";
  const k = known ? kind : "failed";
  return {
    kind: k, role: "alert", message: w[k],
    // a lost context may come back by itself; the other two need the user to act
    retry: k === "lost" ? null : w.retry,
    link: k === "lost" ? null : { href: FALLBACK_HREF, text: w.map },
  };
}
