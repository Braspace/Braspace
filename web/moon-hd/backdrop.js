// BRASPACE Moon HD as a page backdrop: the same Moon as the viewer (scene.js), behind the content.
// No controls, no labels, no panel. Lit by the Sun at the current time, or at the scenario's ?start=.
// Display only: nothing here is a landing metric (see docs/MOON_HD.md).
//
// Use:  <script type="module" src="…/moon-hd/backdrop.js" data-moon-backdrop="pole"></script>
// or    import { mountMoonBackdrop } from "…/moon-hd/backdrop.js"; mountMoonBackdrop({ view: "globe" });
//
// three.js is not imported here: it arrives with scene.js, after the page content, and only when WebGL 2 exists.
// If anything fails (no WebGL, software-only WebGL, lost context, missing asset) the canvas is removed and the
// page keeps its own background. If the GPU turns out too slow, the animation stops and one still frame stays.
const BASE = new URL("../data/moonhd/", import.meta.url).href;

export const MAX_PIXEL_RATIO = 1.5;
export const FRAME_MS = 1000 / 30;
const PHONE_WIDTH = 720, WIDE_WIDTH = 1600, ORBIT_SECONDS = 900;

export const normalizeOptions = (options = {}) => ({ view: options.view === "globe" ? "globe" : "pole", interactive: false });

/** What to download and how fine to draw, from the viewport width (CSS px) and the GPU's texture limit. */
export function pickAssets({ width, maxTextureSize }) {
  const phone = !(width >= PHONE_WIDTH);
  const sharp = !phone && width >= WIDE_WIDTH && maxTextureSize >= 8192;
  return {
    color: sharp ? "color_8k.jpg" : "color_4k.jpg",
    cap: !phone, stars: !phone, // phones: globe only (colour, normals, height, ephemeris)
    lon: phone ? 384 : 768, lat: phone ? 192 : 384, globeSteps: 24, capSegments: 448, capSteps: 72,
  };
}

/**
 * Software rasterisers (no GPU: CI browsers, some VMs and remote desktops). Measured with SwiftShader at
 * 1440 x 900: one frame of this backdrop takes about 500 ms and keeps the page's main thread from running
 * (20 animation frames took 10 to 14 s, against 0.3 s without the backdrop).
 */
export const isSoftwareRenderer = name => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name || ""));

/** Frames slower than this, this many times in a row, end the animation and leave the last frame as a still. */
export const SLOW_FRAME_MS = 120, SLOW_FRAMES_TO_STOP = 4;
export const slowStreak = (streak, elapsedMs) => (elapsedMs > SLOW_FRAME_MS ? streak + 1 : 0);

/** A hardware WebGL 2 context on a new canvas, or null. Never throws. */
export function probeWebGL(makeCanvas) {
  try {
    const canvas = makeCanvas();
    // failIfMajorPerformanceCaveat: the browser refuses the context when it would be rendered in software.
    const gl = canvas?.getContext?.("webgl2", { antialias: true, alpha: false, powerPreference: "default", failIfMajorPerformanceCaveat: true });
    if (!gl) return null;
    // Belt and braces: some builds hand out a software context anyway, so read the renderer's name too.
    const info = gl.getExtension?.("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter?.(gl.RENDERER);
    if (isSoftwareRenderer(name)) {
      gl.getExtension?.("WEBGL_lose_context")?.loseContext();
      return null;
    }
    return { canvas, gl };
  } catch { return null; }
}

/** Clock of the backdrop: the scenario's start (?start= in the query or in a #/route?query), else now. */
export function backdropTime(search, hash, now) {
  for (const query of [search, String(hash || "").split("?")[1]]) {
    const ms = Date.parse(new URLSearchParams(query || "").get("start") || "");
    if (Number.isFinite(ms)) return ms;
  }
  return now;
}

/** The loop runs only while the tab is visible, the canvas is on screen and motion is allowed. */
export const shouldAnimate = ({ hidden, onScreen, reducedMotion }) => !hidden && onScreen && !reducedMotion;

/** Camera position (unit Moon radius, +Y north) on a slow orbit around the polar axis. */
export function cameraPosition(view, angle) {
  const [lat, distance] = view === "globe" ? [-12, 4.6] : [-84, 2.05];
  const phi = lat * Math.PI / 180, c = Math.cos(phi) * distance;
  return [c * Math.cos(angle), Math.sin(phi) * distance, -c * Math.sin(angle)];
}

function stylesheet(doc) {
  const href = new URL("./backdrop.css", import.meta.url).href;
  return new Promise((resolve, reject) => {
    if ([...doc.styleSheets].some(s => s.href === href)) return resolve();
    const link = doc.createElement("link");
    link.rel = "stylesheet"; link.href = href; link.onload = () => resolve(); link.onerror = () => reject(new Error("backdrop.css"));
    doc.head.append(link);
  });
}

/**
 * Mounts the Moon behind the page. Resolves to { dispose } or to null when the backdrop could not start;
 * it never rejects and never throws.
 */
export async function mountMoonBackdrop(options) {
  if (typeof document === "undefined") return null;
  const { view } = normalizeOptions(options);
  const probe = probeWebGL(() => document.createElement("canvas"));
  if (!probe) return null;
  const { canvas, gl } = probe, root = document.documentElement;
  const wrap = document.createElement("div");
  wrap.className = "moon-backdrop"; wrap.setAttribute("aria-hidden", "true"); wrap.append(canvas);
  let renderer = null, raf = 0, dead = false, observer = null;
  const cleanups = [];
  const dispose = () => {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    for (const undo of cleanups) undo();
    observer?.disconnect();
    try { renderer?.dispose(); } catch { /* the context may already be gone */ }
    wrap.remove();
    root.classList.remove("moon-backdrop-on");
  };
  const on = (target, type, handler) => { target.addEventListener(type, handler); cleanups.push(() => target.removeEventListener(type, handler)); };
  try {
    on(canvas, "webglcontextlost", dispose);
    await stylesheet(document);
    document.body.prepend(wrap);
    const S = await import("./scene.js");
    const { THREE } = S;
    if (dead) return null;
    renderer = new THREE.WebGLRenderer({ canvas, context: gl });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const want = pickAssets({ width: innerWidth, maxTextureSize: renderer.capabilities.maxTextureSize });
    const load = S.textureLoader(renderer, BASE);
    const manifest = await S.fetchJSON(BASE + "manifest.json");
    const [ephBuffer, colorTex, normalTex, heightTex, starTex, E] = await Promise.all([
      S.fetchBinary(BASE + manifest.ephemeris.file, manifest.ephemeris.count * 8),
      load(want.color, true), load("normal_4k.jpg", false), load("height_4k.jpg", false),
      want.stars ? load("stars_4k.jpg", true) : null, import("./ephemeris.js"),
    ]);
    if (dead) return null;
    const eph = E.decodeEphemeris(ephBuffer, manifest.ephemeris);
    const { sun, earth } = E.pointsAt(eph, E.indexAt(eph, backdropTime(location.search, location.hash, Date.now())));

    const scene = new THREE.Scene();
    const moon = S.createMoon({ manifest, colorTex, normalTex, heightTex, lon: want.lon, lat: want.lat, steps: want.globeSteps });
    moon.lightDir.set(...E.toGlobeScene(E.bodyDirection(sun.lat, sun.lon)));
    moon.earthDir.set(...E.toGlobeScene(E.bodyDirection(earth.lat, earth.lon)));
    scene.add(moon.mesh);
    const stars = starTex ? S.createStars(starTex, 90) : null;
    if (stars) scene.add(stars);
    const camera = new THREE.PerspectiveCamera(view === "globe" ? 32 : 40, 1, 0.02, 400);
    let cap = null;
    // Start on the sunlit side, a little past the sub-solar meridian, so the terminator is in view.
    let angle = Math.atan2(-moon.lightDir.z, moon.lightDir.x) + 0.6;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true, last = 0, streak = 0, still = false;
    const draw = () => {
      camera.position.set(...cameraPosition(view, angle));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      stars?.position.copy(camera.position);
      if (cap) S.setPolarFrame(cap, moon.lightDir, camera);
      renderer.render(scene, camera);
    };
    const frame = now => {
      raf = 0;
      if (dead || !shouldAnimate({ hidden: document.hidden, onScreen, reducedMotion: reduced.matches })) return;
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) return; // 30 fps target
      // A GPU that cannot keep up (weak, or software that slipped past the probe) must not hold the page back:
      // stop animating and keep what is drawn as a still background.
      streak = slowStreak(streak, now - last);
      if (streak >= SLOW_FRAMES_TO_STOP) { still = true; cancelAnimationFrame(raf); raf = 0; return; }
      angle += Math.min(0.25, (now - last) / 1000) * 2 * Math.PI / ORBIT_SECONDS;
      last = now;
      draw();
    };
    const kick = () => { if (!raf && !dead && !still) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const resize = () => {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      draw(); // also the single frame of prefers-reduced-motion
    };
    on(window, "resize", resize);
    on(document, "visibilitychange", kick);
    on(reduced, "change", kick);
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(entries => { onScreen = entries[entries.length - 1].isIntersecting; kick(); });
      observer.observe(canvas);
    }
    resize();
    root.classList.add("moon-backdrop-on");
    wrap.classList.add("is-on");
    kick();

    // South cap (LOLA 320 m, terrain shadows): after the first frame, never on phones.
    if (want.cap) S.createCap({ renderer, base: BASE, manifest, moon, segments: want.capSegments, steps: want.capSteps, wideOnly: true }).then(made => {
      if (dead) return;
      scene.add(made.mesh); moon.uniforms.capReady.value = 1; cap = made;
      draw();
    }).catch(() => {}); // the globe alone is a complete backdrop
    return { dispose };
  } catch {
    dispose();
    return null;
  }
}

// Auto-mount for pages that only add the script tag. Waits for the page to finish loading first.
if (typeof document !== "undefined") {
  const tag = document.querySelector("script[data-moon-backdrop]");
  if (tag) {
    const start = () => setTimeout(() => mountMoonBackdrop({ view: tag.dataset.moonBackdrop }), 0);
    if (document.readyState === "complete") start(); else addEventListener("load", start, { once: true });
  }
}
