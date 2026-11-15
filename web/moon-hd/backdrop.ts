// BRASPACE Moon HD as a page backdrop: the same Moon as the viewer (scene.js), behind the content.
// Far enough to show the whole globe; drag the empty background (mouse/pen) to turn it, wheel/pinch to zoom,
// or press "Explorar a Lua" for a full-screen explore mode (touch too). Lit by the Sun at the current time,
// or at the scenario's ?start=.
// Display only: nothing here is a landing metric (see docs/MOON_HD.md).
//
// Use:  <script type="module" src="…/moon-hd/backdrop.js" data-moon-backdrop="pole"></script>
// or    import { mountMoonBackdrop } from "…/moon-hd/backdrop.js"; mountMoonBackdrop({ view: "globe" });
//
// three.js is not imported here: it arrives with scene.js, after the page content, and only when WebGL 2 exists.
// If anything fails (no WebGL, software-only WebGL, lost context, missing asset) the canvas is removed and the
// page keeps its own background. If the GPU turns out too slow, the animation stops and one still frame stays.
import type { Three } from "../api-types.js";
import type { CapScene } from "./scene.js";
const BASE = new URL("../data/moonhd/", import.meta.url).href;

export const MAX_PIXEL_RATIO = 1.5;
export const FRAME_MS = 1000 / 30;
const PHONE_WIDTH = 720, WIDE_WIDTH = 1600, ORBIT_SECONDS = 900;

export type BackdropView = "globe" | "pole";
export interface BackdropOptions { view?: string; interactive?: boolean; lazy?: boolean; explore?: boolean; }
/** interactive defaults to true; lazy = the page keeps its own (functional) background and the Moon only opens on demand. */
export const normalizeOptions = (options: BackdropOptions = {}): { view: BackdropView; interactive: boolean; lazy: boolean } =>
  ({ view: options.view === "globe" ? "globe" : "pole", interactive: options.interactive !== false, lazy: options.lazy === true });

/** Default camera of each view: latitude (deg) and distance (Moon radii). Far enough that the whole Moon is in frame. */
export const VIEW_DEFAULTS: Record<BackdropView, { lat: number; distance: number }> = { globe: { lat: -12, distance: 7.5 }, pole: { lat: -62, distance: 4.4 } };
export const MIN_DISTANCE = 1.35, MAX_DISTANCE = 14, MAX_LAT = 88;
export const clampDistance = (d: number) => Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, Number.isFinite(d) ? d : MAX_DISTANCE));
export const clampLat = (lat: number) => Math.min(MAX_LAT, Math.max(-MAX_LAT, Number.isFinite(lat) ? lat : 0));

/** Selector of what is NOT background: a drag that starts on any of these belongs to the page, never to the Moon. */
export const INTERACTIVE_SELECTOR = "a,button,input,select,textarea,label,summary,details,option,video,audio,iframe,canvas,svg,img,[role=button],[role=link],[role=slider],[role=tab],[role=menuitem],[role=dialog],[tabindex],[contenteditable],[draggable=true],[data-no-moon-drag]";
/** Whether a pointer down on `el` may turn the Moon: empty background only (no control, no own text). */
export function isBackgroundTarget(el: Element | null): boolean {
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest(".moon-backdrop")) return true;
  if (el.closest(INTERACTIVE_SELECTOR)) return false;
  for (const n of Array.from(el.childNodes || [])) if (n.nodeType === 3 && String(n.textContent || "").trim()) return false; // text stays selectable
  return true;
}

/** What to download and how fine to draw, from the viewport width (CSS px) and the GPU's texture limit. */
export function pickAssets({ width, maxTextureSize }: { width: number; maxTextureSize: number }) {
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
export const isSoftwareRenderer = (name: unknown) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name || ""));

/** Frames slower than this, this many times in a row, end the animation and leave the last frame as a still. */
export const SLOW_FRAME_MS = 120, SLOW_FRAMES_TO_STOP = 4;
export const slowStreak = (streak: number, elapsedMs: number) => (elapsedMs > SLOW_FRAME_MS ? streak + 1 : 0);

/** A hardware WebGL 2 context on a new canvas, or null. Never throws. */
export function probeWebGL(makeCanvas: () => HTMLCanvasElement): { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext } | null {
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
export function backdropTime(search: string | null | undefined, hash: string | null | undefined, now: number): number {
  for (const query of [search, String(hash || "").split("?")[1]]) {
    const ms = Date.parse(new URLSearchParams(query || "").get("start") || "");
    if (Number.isFinite(ms)) return ms;
  }
  return now;
}

/** The loop runs only while the tab is visible, the canvas is on screen and motion is allowed. */
export const shouldAnimate = ({ hidden, onScreen, reducedMotion }: { hidden: boolean; onScreen: boolean; reducedMotion: boolean }) => !hidden && onScreen && !reducedMotion;

/** Camera position (unit Moon radius, +Y north) on a slow orbit around the polar axis. */
export function cameraPosition(view: string, angle: number, lat?: number, distance?: number): [number, number, number] {
  const d = VIEW_DEFAULTS[view === "globe" ? "globe" : "pole"];
  const la = clampLat(lat ?? d.lat), dist = clampDistance(distance ?? d.distance);
  const phi = la * Math.PI / 180, c = Math.cos(phi) * dist;
  return [c * Math.cos(angle), Math.sin(phi) * dist, -c * Math.sin(angle)];
}

function stylesheet(doc: Document): Promise<void> {
  const href = new URL("./backdrop.css", import.meta.url).href;
  return new Promise<void>((resolve, reject) => {
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
export async function mountMoonBackdrop(options?: BackdropOptions): Promise<{ dispose(): void } | null> {
  if (typeof document === "undefined") return null;
  const { view, interactive, lazy } = normalizeOptions(options);
  const probe = probeWebGL(() => document.createElement("canvas"));
  if (!probe) return null;
  const { canvas, gl } = probe, root = document.documentElement;
  const wrap = document.createElement("div");
  wrap.className = "moon-backdrop" + (lazy ? " is-lazy" : ""); wrap.setAttribute("aria-hidden", "true"); wrap.append(canvas);
  let renderer: Three = null, raf = 0, dead = false, observer: IntersectionObserver | null = null;
  const cleanups: (() => void)[] = [];
  const dispose = () => {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    for (const undo of cleanups) undo();
    observer?.disconnect();
    try { renderer?.dispose(); } catch { /* the context may already be gone */ }
    wrap.remove();
    root.classList.remove("moon-backdrop-on", "moon-explore-on");
  };
  const on = (target: EventTarget, type: string, handler: EventListener) => { target.addEventListener(type, handler); cleanups.push(() => target.removeEventListener(type, handler)); };
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
    let cap: CapScene | null = null;
    // Start on the sunlit side, a little past the sub-solar meridian, so the terminator is in view.
    const home = { angle: Math.atan2(-moon.lightDir.z, moon.lightDir.x) + 0.6, lat: VIEW_DEFAULTS[view].lat, distance: VIEW_DEFAULTS[view].distance };
    let angle = home.angle, lat = home.lat, distance = home.distance;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true, last = 0, streak = 0, still = false, idleUntil = 0, pending = 0, exploring = false;
    const frameCallbacks = new Set<(dt: number, now: number) => void>();

    // ---- Sites from the API as pins on the globe (display only: cited feature centres, not touchdown points) ----
    const pinLayer = document.createElement("div"); pinLayer.className = "moon-pins"; wrap.append(pinLayer);
    interface Pin { id: string; name: string; lat: number; lon: number; p: Three; el: HTMLButtonElement; }
    let pins: Pin[] = [], selectedId = "";
    const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
    const toScene = (lat: number, lon: number, r = 1) => new THREE.Vector3(...E.toGlobeScene(E.bodyDirection(lat, lon))).multiplyScalar(r);
    function placePins() {
      if (!pins.length) return;
      const w = innerWidth, h = innerHeight;
      camDir.copy(camera.position);
      for (const pin of pins) {
        // visible when the pin's outward normal faces the camera (horizon test on the unit sphere)
        const facing = pin.p.dot(camDir) - pin.p.lengthSq() > 0.02;
        v3.copy(pin.p).project(camera);
        const off = !facing || v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05;
        pin.el.classList.toggle("is-off", off);
        if (!off) pin.el.style.transform = `translate(${((v3.x * .5 + .5) * w).toFixed(1)}px,${((-v3.y * .5 + .5) * h).toFixed(1)}px)`;
      }
    }
    // Camera tween to a site (angle/lat/distance), used by pins and by other screens (moonBackdrop.focusSite).
    let tween: { t0: number; from: number[]; to: number[] } | null = null;
    const stepTween = (now: number) => {
      if (!tween) return;
      const k = Math.min(1, (now - tween.t0) / 900), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      [angle, lat, distance] = tween.from.map((f, i) => f + (tween!.to[i] - f) * e);
      if (k >= 1) tween = null;
    };
    const focusLatLon = (la: number, lo: number, dist = 2.4) => {
      const d = toScene(la, lo);
      let a = Math.atan2(-d.z, d.x);
      while (a - angle > Math.PI) a -= 2 * Math.PI; while (angle - a > Math.PI) a += 2 * Math.PI;
      tween = { t0: performance.now(), from: [angle, lat, distance], to: [a, clampLat(Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI), clampDistance(dist)] };
      idleUntil = performance.now() + 12000;
      const run = (t: number) => { stepTween(t); draw(); if (tween && !dead) requestAnimationFrame(run); };
      requestAnimationFrame(run);
    };
    const selectSite = (id: string, focus = true) => {
      const pin = pins.find(p => p.id === id); if (!pin) return;
      selectedId = id;
      for (const p of pins) p.el.setAttribute("aria-pressed", String(p.id === id));
      if (focus) focusLatLon(pin.lat, pin.lon);
      window.dispatchEvent(new CustomEvent("moon:site-selected", { detail: { id: pin.id, name: pin.name, lat: pin.lat, lon: pin.lon } }));
    };
    const loadPins = async () => {
      try {
        const { apiURL } = await import("../api-base.js");
        const res = await fetch(apiURL("/api/sites"), { headers: { accept: "application/json" } });
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body?.sites) ? body.sites : [];
        for (const s of list) {
          const la = Number(s?.coordinate?.latitude_deg), lo = Number(s?.coordinate?.longitude_deg);
          if (!Number.isFinite(la) || !Number.isFinite(lo) || typeof s?.id !== "string") continue;
          const el = document.createElement("button");
          el.type = "button"; el.className = "moon-pin" + (s.series_file ? " has-series" : "");
          el.setAttribute("aria-pressed", "false");
          el.title = `${s.name || s.id} · ${la.toFixed(2)}°, ${lo.toFixed(2)}°`;
          const dot = document.createElement("i"), label = document.createElement("span");
          label.textContent = String(s.name || s.id); el.append(dot, label);
          el.addEventListener("click", () => selectSite(s.id));
          pinLayer.append(el);
          pins.push({ id: s.id, name: String(s.name || s.id), lat: la, lon: lo, p: toScene(la, lo, 1.004), el });
        }
        const wanted = new URLSearchParams(location.search).get("site") || new URLSearchParams(String(location.hash).split("?")[1] || "").get("site");
        if (wanted) selectSite(wanted, false);
        requestDraw();
      } catch { /* no pins: the Moon stays a complete backdrop */ }
    };
    const draw = () => {
      camera.position.set(...cameraPosition(view, angle, lat, distance));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      stars?.position.copy(camera.position);
      if (cap) S.setPolarFrame(cap, moon.lightDir, camera);
      renderer.render(scene, camera);
      placePins();
    };
    /** One frame on demand (user input), even when auto-orbit is stopped, slow or reduced-motion. */
    const requestDraw = () => { if (!pending && !dead) pending = requestAnimationFrame(() => { pending = 0; if (!dead) draw(); }); };
    const frame = (now: number) => {
      raf = 0;
      if (dead || !shouldAnimate({ hidden: document.hidden, onScreen, reducedMotion: reduced.matches })) return;
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) return; // 30 fps target
      // A GPU that cannot keep up (weak, or software that slipped past the probe) must not hold the page back:
      // stop animating and keep what is drawn as a still background (user input still redraws on demand).
      streak = slowStreak(streak, now - last);
      if (streak >= SLOW_FRAMES_TO_STOP) { still = true; cancelAnimationFrame(raf); raf = 0; return; }
      const dt = Math.min(0.25, (now - last) / 1000);
      if (now > idleUntil && !tween) angle += dt * 2 * Math.PI / ORBIT_SECONDS;
      stepTween(now);
      for (const cb of frameCallbacks) { try { cb(dt, now); } catch { frameCallbacks.delete(cb); } }
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
      observer = new IntersectionObserver((entries: IntersectionObserverEntry[]) => { onScreen = entries[entries.length - 1].isIntersecting; kick(); });
      observer.observe(canvas);
    }

    // ---- Interaction: drag = turn, wheel / pinch / buttons = zoom. Never steals clicks from page controls. ----
    const touched = () => { idleUntil = performance.now() + 6000; requestDraw(); };
    const turn = (dx: number, dy: number) => {
      const k = 0.0055 * Math.min(1.6, Math.max(0.35, (distance - 1) / 3.4));
      angle -= dx * k; lat = clampLat(lat + dy * k * 57.3); touched();
    };
    const zoomBy = (factor: number) => { distance = clampDistance(distance * factor); touched(); };
    const reset = () => { angle = home.angle; lat = home.lat; distance = home.distance; touched(); };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0, dragging = false;
    const pinchSpan = () => { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      const target = e.target as Element | null;
      if (target?.closest?.(".moon-pin")) return; // pins are buttons: a tap selects, never drags
      const mine = exploring ? !!target?.closest?.(".moon-backdrop") : (!lazy && e.pointerType !== "touch" && isBackgroundTarget(target));
      if (!mine) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragging = true; pinch = pinchSpan();
      root.classList.add("moon-dragging");
      if (exploring) { try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ } }
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!dragging || !p) return;
      if (pointers.size >= 2) {
        p.x = e.clientX; p.y = e.clientY;
        const span = pinchSpan();
        if (pinch > 0 && span > 0) zoomBy(pinch / span);
        pinch = span; return;
      }
      turn(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId); pinch = pinchSpan();
      if (!pointers.size) { dragging = false; root.classList.remove("moon-dragging"); }
    };
    const scrollable = () => document.documentElement.scrollHeight > innerHeight + 4;
    const wheel = (e: WheelEvent) => {
      const target = e.target as Element | null;
      const mine = exploring ? !!target?.closest?.(".moon-backdrop") : (!lazy && !e.ctrlKey && isBackgroundTarget(target) && (e.altKey || !scrollable()));
      if (!mine) return;
      e.preventDefault();
      zoomBy(Math.exp(Math.max(-1, Math.min(1, e.deltaY / 400))));
    };
    if (interactive) {
      on(document, "pointerdown", down as EventListener);
      on(window, "pointermove", move as EventListener);
      on(window, "pointerup", up as EventListener);
      on(window, "pointercancel", up as EventListener);
      document.addEventListener("wheel", wheel, { passive: false }); cleanups.push(() => document.removeEventListener("wheel", wheel));
    }

    // Explore mode: the Moon comes in front of the page, without veil, with its own controls (works on touch).
    const pt = (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("pt");
    const T = pt ? { open: "Explorar a Lua", close: "Mostrar painéis", zin: "Aproximar", zout: "Afastar", reset: "Centralizar", hint: "Arraste para girar · role ou pince para zoom · toque num local para ir até ele · Esc volta aos painéis" }
                 : { open: "Explore the Moon", close: "Show panels", zin: "Zoom in", zout: "Zoom out", reset: "Reset view", hint: "Drag to turn · scroll or pinch to zoom · tap a site to fly to it · Esc returns to the panels" };
    const ui = document.createElement("div");
    ui.className = "moon-ui";
    const button = (cls: string, label: string, text: string, act: () => void) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "moon-btn " + cls;
      b.setAttribute("aria-label", label); b.title = label; b.textContent = text; b.addEventListener("click", act); return b;
    };
    const tools = document.createElement("div"); tools.className = "moon-tools";
    const hint = document.createElement("p"); hint.className = "moon-hint"; hint.textContent = T.hint;
    const setExplore = (onOff: boolean) => {
      exploring = onOff;
      wrap.classList.toggle("is-explore", onOff); ui.classList.toggle("is-explore", onOff);
      root.classList.toggle("moon-explore-on", onOff);
      wrap.setAttribute("aria-hidden", onOff ? "false" : "true");
      if (onOff) { wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", pt ? "Lua 3D interativa" : "Interactive 3D Moon"); }
      else { wrap.removeAttribute("role"); wrap.removeAttribute("aria-label"); }
      openBtn.setAttribute("aria-pressed", String(onOff));
      openBtn.textContent = onOff ? "✕ " + T.close : T.open;
      touched(); kick();
    };
    const openBtn = button("moon-open", T.open, T.open, () => setExplore(!exploring));
    openBtn.setAttribute("aria-pressed", "false");
    tools.append(button("moon-zin", T.zin, "+", () => zoomBy(0.8)), button("moon-zout", T.zout, "−", () => zoomBy(1.25)), button("moon-reset", T.reset, "⟲", reset));
    ui.append(hint, tools, openBtn);
    if (interactive) {
      document.body.append(ui);
      cleanups.push(() => ui.remove());
      on(document, "keydown", ((e: KeyboardEvent) => {
        if (!exploring) return;
        const k = e.key;
        if (k === "Escape") setExplore(false);
        else if (k === "+" || k === "=") zoomBy(0.8);
        else if (k === "-" || k === "_") zoomBy(1.25);
        else if (k === "ArrowLeft") turn(-40, 0); else if (k === "ArrowRight") turn(40, 0);
        else if (k === "ArrowUp") turn(0, -40); else if (k === "ArrowDown") turn(0, 40);
        else if (k === "0") reset();
        else return;
        e.preventDefault();
      }) as EventListener);
    }

    resize();
    if (!lazy) root.classList.add("moon-backdrop-on");
    wrap.classList.add("is-on");
    kick();
    if (options?.explore) setExplore(true);
    loadPins();

    // Shared scene hooks: other modules (e.g. the Artemis lander in the cockpit) add objects to THIS scene instead of
    // creating a second Moon. Display only; nothing here feeds a calculation.
    const api = {
      THREE, scene, camera, moon, renderer,
      requestDraw, toScene, focusLatLon, selectSite, explore: setExplore,
      onFrame(cb: (dt: number, now: number) => void) { frameCallbacks.add(cb); kick(); return () => frameCallbacks.delete(cb); },
      get pins() { return pins.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })); },
      get selectedId() { return selectedId; },
    };
    (window as unknown as { moonBackdrop?: unknown }).moonBackdrop = api;
    cleanups.push(() => { const w = window as unknown as { moonBackdrop?: unknown }; if (w.moonBackdrop === api) delete w.moonBackdrop; });
    on(window, "moon:focus-site", ((e: CustomEvent) => { if (e.detail?.id) selectSite(String(e.detail.id)); }) as EventListener);
    window.dispatchEvent(new CustomEvent("moon-backdrop:ready", { detail: api }));

    // South cap (LOLA 320 m, terrain shadows): after the first frame, never on phones.
    if (want.cap) S.createCap({ renderer, base: BASE, manifest, moon, segments: want.capSegments, steps: want.capSteps, wideOnly: true }).then(made => {
      if (dead) return;
      scene.add(made.mesh); moon.uniforms.capReady.value = 1; cap = made;
      draw();
    }).catch(() => {}); // the globe alone is a complete backdrop
    return { dispose, explore: setExplore } as { dispose(): void };
  } catch {
    dispose();
    return null;
  }
}

// Auto-mount for pages that only add the script tag. Waits for the page to finish loading first.
// data-moon-lazy: the page's own background is functional (a map); only the "Explore the Moon" button is added
// and the Moon (WebGL, textures) loads on the first click.
if (typeof document !== "undefined") {
  const tag = document.querySelector("script[data-moon-backdrop]") as HTMLElement | null;
  if (tag) {
    const view = tag.dataset.moonBackdrop, lazy = tag.hasAttribute("data-moon-lazy");
    const start = () => setTimeout(() => {
      if (!lazy) { mountMoonBackdrop({ view }); return; }
      const pt = (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("pt");
      const ui = document.createElement("div"); ui.className = "moon-ui";
      const b = document.createElement("button"); b.type = "button"; b.className = "moon-btn moon-open";
      b.textContent = (pt ? "Explorar a Lua" : "Explore the Moon");
      ui.append(b);
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = new URL("./backdrop.css", import.meta.url).href;
      document.head.append(css); document.body.append(ui);
      b.addEventListener("click", async () => {
        b.disabled = true;
        const made = await mountMoonBackdrop({ view, lazy: true, explore: true } as BackdropOptions);
        if (made) ui.remove(); else { b.disabled = false; b.textContent = pt ? "Lua 3D indisponível neste dispositivo" : "3D Moon unavailable on this device"; }
      }, { once: false });
    }, 0);
    if (document.readyState === "complete") start(); else addEventListener("load", start, { once: true });
  }
}
