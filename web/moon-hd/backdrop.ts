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
/** Lighter LOLA cap for phones, loaded only on demand in explore mode (desktop: 448 segments / 72 shadow steps). */
export const PHONE_CAP = { segments: 256, steps: 40 } as const;
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

/** A label box on screen (CSS px) with a priority: higher wins when two boxes overlap. */
export interface LabelBox { id: string; x: number; y: number; w: number; h: number; priority: number; }
/**
 * Greedy label decluttering: boxes are placed from the highest priority down (ties: left to right) and any box that
 * overlaps one already placed is hidden. Returns the ids whose label must be hidden (their dot stays visible).
 */
export function declutterLabels(boxes: LabelBox[], pad = 3): Set<string> {
  const order = [...boxes].filter(b => [b.x, b.y, b.w, b.h].every(Number.isFinite)).sort((a, b) => b.priority - a.priority || a.x - b.x || a.y - b.y);
  const placed: LabelBox[] = [], hidden = new Set<string>();
  for (const b of order) {
    const hit = placed.some(o => b.x < o.x + o.w + pad && o.x < b.x + b.w + pad && b.y < o.y + o.h + pad && o.y < b.y + b.h + pad);
    if (hit) hidden.add(b.id); else placed.push(b);
  }
  for (const b of boxes) if (!order.includes(b)) hidden.add(b.id);
  return hidden;
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

// ---- Explore camera: orbit around a target on the surface (pure, NaN-safe; plain [x, y, z] arrays) ----
export type Vec3 = [number, number, number];
/** The camera never comes closer than this to the Moon's centre (radii): above the highest polar relief. */
export const MIN_CAMERA_RADIUS = 1.02;
/** Distance to the target (radii) in explore mode, pitch above the local horizon (deg), and the default fly-to. */
export const MIN_RANGE = 0.06, MAX_RANGE = 2.5, MIN_PITCH = 8, MAX_PITCH = 85;
export const FOCUS_RANGE = 0.45, FOCUS_PITCH = 42;
/** Camera azimuth = the Sun's azimuth at the site plus this (rad): from the lit side, light raking across the relief. */
export const FOCUS_SUN_OFFSET = 50 * Math.PI / 180;
const DEG = Math.PI / 180;
const fin = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const sane = (v: ArrayLike<number> | null | undefined): Vec3 => [fin(v?.[0], 0), fin(v?.[1], 0), fin(v?.[2], 0)];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3, d: Vec3 = [0, 1, 0]): Vec3 => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : d; };
export const clampRange = (r: number) => Math.min(MAX_RANGE, Math.max(MIN_RANGE, fin(r, FOCUS_RANGE)));
export const clampPitch = (p: number) => Math.min(MAX_PITCH, Math.max(MIN_PITCH, fin(p, FOCUS_PITCH)));
const isOrigin = (t: Vec3) => !(len(t) > 1e-9);

/**
 * Local frame at a target: up = surface normal, north = world +Y on the tangent plane (world +X at the poles),
 * east = up x north. The origin gets the global frame of cameraPosition (up +Y, north +X, east -Z).
 */
export function orbitFrame(target: ArrayLike<number>): { up: Vec3; north: Vec3; east: Vec3 } {
  const t = sane(target);
  if (isOrigin(t)) return { up: [0, 1, 0], north: [1, 0, 0], east: [0, 0, -1] };
  const up = unit(t);
  let north = add([0, 1, 0], scale(up, -up[1]));
  if (len(north) < 1e-6) north = add([1, 0, 0], scale(up, -up[0]));
  north = unit(north, [1, 0, 0]);
  return { up, north, east: cross(up, north) };
}

/** Pushes a position out to MIN_CAMERA_RADIUS when it would be inside (or on) the Moon. */
export function outsideMoon(p: ArrayLike<number>, fallbackUp: Vec3 = [0, 1, 0]): Vec3 {
  const v = sane(p), r = len(v);
  return r >= MIN_CAMERA_RADIUS ? v : scale(r > 1e-9 ? scale(v, 1 / r) : unit(fallbackUp), MIN_CAMERA_RADIUS);
}

/**
 * Camera position orbiting `target`: yaw (rad) around the local up from north toward east, pitch (deg) above the
 * local horizon, dist = distance to the target. Target at the origin = the global view (same as cameraPosition,
 * pitch = latitude, dist = distance from the centre). Never inside the Moon, never NaN.
 */
export function orbitCamera(target: ArrayLike<number>, yaw: number, pitch: number, dist: number): Vec3 {
  const t = sane(target), global = isOrigin(t), f = orbitFrame(t);
  const p = (global ? clampLat(pitch) : clampPitch(pitch)) * DEG, d = global ? clampDistance(dist) : clampRange(dist), y = fin(yaw, 0);
  const h = add(scale(f.north, Math.cos(y)), scale(f.east, Math.sin(y)));
  return outsideMoon(add(t, scale(add(scale(h, Math.cos(p)), scale(f.up, Math.sin(p))), d)), f.up);
}

/** Yaw (rad, as in orbitCamera) of a direction seen from `target`, projected on the local horizon. */
export function yawToward(target: ArrayLike<number>, dir: ArrayLike<number>): number {
  const f = orbitFrame(target), d = sane(dir);
  const n = dot(d, f.north), e = dot(d, f.east);
  return Math.abs(n) + Math.abs(e) > 1e-12 ? Math.atan2(e, n) : 0;
}

/** Spherical interpolation of two directions; antiparallel ones turn around `axis` (e.g. the view direction). */
export function slerpUnit(a: ArrayLike<number>, b: ArrayLike<number>, t: number, axis?: ArrayLike<number>): Vec3 {
  const u = unit(sane(a)), v = unit(sane(b)), k = Math.min(1, Math.max(0, fin(t, 1)));
  const c = Math.min(1, Math.max(-1, dot(u, v)));
  if (c > 0.99999) return unit(add(scale(u, 1 - k), scale(v, k)), v);
  let ax = cross(u, v);
  if (len(ax) < 1e-6) { // antiparallel: any axis perpendicular to u, preferably the hint
    const hint = sane(axis);
    ax = add(hint, scale(u, -dot(hint, u)));
    if (len(ax) < 1e-6) ax = cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  }
  ax = unit(ax);
  const th = Math.acos(c) * k, cs = Math.cos(th), sn = Math.sin(th); // Rodrigues
  return unit(add(add(scale(u, cs), scale(cross(ax, u), sn)), scale(ax, dot(ax, u) * (1 - cs))), v);
}

export interface CameraPose { position: Vec3; target: Vec3; up: Vec3; }
/** Pose between two poses (e in 0..1): target on a straight line, camera on a great circle, never inside the Moon. */
export function tweenPose(from: CameraPose, to: CameraPose, e: number): CameraPose {
  const k = Math.min(1, Math.max(0, fin(e, 1)));
  const p0 = sane(from.position), p1 = sane(to.position), t0 = sane(from.target), t1 = sane(to.target);
  const target = add(scale(t0, 1 - k), scale(t1, k));
  const dir = slerpUnit(p0, p1, k), r = len(p0) * (1 - k) + len(p1) * k;
  const position = outsideMoon(scale(dir, r), dir);
  const forward = add(target, scale(position, -1));
  return { position, target, up: slerpUnit(from.up, to.up, k, forward) };
}

/** Near plane for a camera at `position`: a fraction of its height above the surface, so close-ups never clip. */
/** Portrait screens see less sideways: the fly-to distance grows by 1/sqrt(aspect) (at most x1.6) to keep the framing. */
export const portraitRange = (dist: number, aspect: number) => clampRange(fin(dist, FOCUS_RANGE) * (fin(aspect, 1) > 0 && fin(aspect, 1) < 1 ? Math.min(1.6, 1 / Math.sqrt(fin(aspect, 1))) : 1));
export const nearPlane = (position: ArrayLike<number>) => Math.min(0.02, Math.max(0.0005, 0.2 * (len(sane(position)) - 1)));

/** Whether a surface point `p` faces the camera: the camera-to-pin vector against the point's outward normal
 * (elevation of the camera seen from the pin, as a sine). Works for any camera position, not only far ones. */
export function facesCamera(p: ArrayLike<number>, camera: ArrayLike<number>, minSine = 0.004): boolean {
  const v = sane(p), c = sane(camera), toCam = add(c, scale(v, -1)), d = len(toCam);
  return d > 1e-9 && dot(toCam, unit(v)) / d > minSine;
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
    // Explore: orbit around a point of the surface (target); target at the origin = the global view above.
    let target: Vec3 = [0, 0, 0], yaw = 0, pitch = FOCUS_PITCH, range = FOCUS_RANGE;
    const isLocal = () => !(Math.hypot(...target) < 1e-9);
    const currentPose = (): CameraPose => isLocal()
      ? { position: orbitCamera(target, yaw, pitch, range), target: [...target] as Vec3, up: orbitFrame(target).up }
      : { position: cameraPosition(view, angle, lat, distance), target: [0, 0, 0], up: [0, 1, 0] };

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true, last = 0, streak = 0, still = false, idleUntil = 0, pending = 0, exploring = false;
    const frameCallbacks = new Set<(dt: number, now: number) => void>();

    // ---- Sites from the API as pins on the globe (display only: cited feature centres, not touchdown points) ----
    const pinLayer = document.createElement("div"); pinLayer.className = "moon-pins"; wrap.append(pinLayer);
    interface Pin { id: string; name: string; lat: number; lon: number; p: Three; el: HTMLButtonElement; lw?: number; lh?: number; }
    let pins: Pin[] = [], selectedId = "";
    const v3 = new THREE.Vector3();
    const toScene = (lat: number, lon: number, r = 1) => new THREE.Vector3(...E.toGlobeScene(E.bodyDirection(lat, lon))).multiplyScalar(r);
    function placePins() {
      if (!pins.length) return;
      const w = innerWidth, h = innerHeight;
      const cam = camera.position.toArray();
      const boxes: LabelBox[] = [];
      for (const pin of pins) {
        // horizon test: the camera-to-pin vector against the pin's outward normal (any camera position)
        const facing = facesCamera(pin.p.toArray(), cam);
        v3.copy(pin.p).project(camera);
        const off = !facing || v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05;
        pin.el.classList.toggle("is-off", off);
        if (off) continue;
        const sx = (v3.x * .5 + .5) * w, sy = (-v3.y * .5 + .5) * h;
        pin.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
        // label size, measured once while labels are shown (explore mode); dots-only mode skips decluttering
        if (exploring) {
          if (!pin.lw) { const span = pin.el.lastElementChild as HTMLElement | null; const r = span?.getBoundingClientRect(); if (r && r.width) { pin.lw = r.width; pin.lh = r.height; } }
          if (pin.lw) boxes.push({ id: pin.id, x: sx + 6, y: sy - (pin.lh || 22) / 2, w: pin.lw, h: pin.lh || 22, priority: (pin.id === selectedId ? 3 : 0) + (pin.el.classList.contains("has-series") ? 1 : 0) });
        }
      }
      // overlapping labels: keep the selected / with-series ones, the others show their name on hover or focus
      const quiet = exploring ? declutterLabels(boxes) : new Set<string>();
      for (const pin of pins) pin.el.classList.toggle("is-quiet", quiet.has(pin.id));
    }
    // Camera tween between two poses (position, target, up), used by pins, explore, reset and other screens.
    // The end state (global angle/lat/distance or local target/yaw/pitch/range) is applied when it lands.
    let tween: { t0: number; from: CameraPose; to: CameraPose; land: () => void } | null = null, shown: CameraPose | null = null;
    const stepTween = (now: number) => {
      if (!tween) return;
      const k = Math.min(1, (now - tween.t0) / 1100), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      shown = tweenPose(tween.from, tween.to, e);
      if (k >= 1) { tween.land(); tween = null; shown = null; }
    };
    /** Lands a running tween at once (user input takes over from where the flight was going). */
    const settle = () => { if (tween) { tween.land(); tween = null; shown = null; } };
    const flyTo = (land: () => void) => {
      const from = shown || currentPose();
      settle();
      const save = { target, yaw, pitch, range, angle, lat, distance };
      land(); const to = currentPose();
      ({ target, yaw, pitch, range, angle, lat, distance } = save);
      idleUntil = performance.now() + 12000;
      if (reduced.matches) { land(); requestDraw(); return; } // prefers-reduced-motion: straight there
      tween = { t0: performance.now(), from, to, land };
      const run = (t: number) => { stepTween(t); draw(); if (tween && !dead) requestAnimationFrame(run); };
      requestAnimationFrame(run);
    };
    /**
     * Flies to a site. dist = camera distance from the site (Moon radii). Explore mode: orbit around the surface
     * point, tilted FOCUS_PITCH above its horizon, from the sunlit side. Behind the panels: the global view
     * turned toward the site (centre distance 1 + dist), as before.
     */
    const focusLatLon = (la: number, lo: number, dist?: number) => {
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
      const d = toScene(la, lo);
      if (exploring) {
        const t = d.toArray() as Vec3, sunYaw = yawToward(t, moon.lightDir.toArray());
        flyTo(() => { target = t; yaw = sunYaw + FOCUS_SUN_OFFSET; pitch = FOCUS_PITCH; range = portraitRange(dist ?? FOCUS_RANGE, innerWidth / innerHeight); });
        return;
      }
      let a = Math.atan2(-d.z, d.x);
      while (a - angle > Math.PI) a -= 2 * Math.PI; while (angle - a > Math.PI) a += 2 * Math.PI;
      const la2 = clampLat(Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI), dist2 = clampDistance(1 + (dist ?? 1.4));
      flyTo(() => { target = [0, 0, 0]; angle = a; lat = la2; distance = dist2; });
    };
    /** Back to the global view (target at the origin): the home framing, turned to where the camera now is. */
    const goGlobal = (keepAzimuth: boolean) => {
      const p = (shown || currentPose()).position;
      let a = keepAzimuth ? Math.atan2(-p[2], p[0]) : home.angle;
      while (a - angle > Math.PI) a -= 2 * Math.PI; while (angle - a > Math.PI) a += 2 * Math.PI;
      flyTo(() => { target = [0, 0, 0]; angle = a; lat = home.lat; distance = home.distance; });
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
        // explore was opened before the catalogue arrived: fly now so the pins spread out
        if (exploring && !tween && pins.length) { const sel = pins.find(p => p.id === selectedId); if (sel) focusLatLon(sel.lat, sel.lon); else focusLatLon(-88.6, 20); }
        requestDraw();
      } catch { /* no pins: the Moon stays a complete backdrop */ }
    };
    const draw = () => {
      const pose = shown || currentPose();
      camera.position.set(...pose.position);
      camera.up.set(...pose.up); // explore: the local up, so the horizon stays at the top of the screen
      camera.lookAt(...pose.target);
      const near = nearPlane(pose.position);
      if (Math.abs(camera.near - near) > 1e-6) { camera.near = near; camera.updateProjectionMatrix(); }
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
      if (now > idleUntil && !tween && !isLocal()) angle += dt * 2 * Math.PI / ORBIT_SECONDS; // slow orbit: global view only
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
      settle();
      if (isLocal()) { // yaw/pitch around the target
        const k = 0.006 * Math.min(1.4, Math.max(0.6, range / FOCUS_RANGE));
        yaw -= dx * k; pitch = clampPitch(pitch + dy * 0.25); touched(); return;
      }
      const k = 0.0055 * Math.min(1.6, Math.max(0.35, (distance - 1) / 3.4));
      angle -= dx * k; lat = clampLat(lat + dy * k * 57.3); touched();
    };
    const zoomBy = (factor: number) => {
      settle();
      if (isLocal()) range = clampRange(range * factor); else distance = clampDistance(distance * factor);
      touched();
    };
    const reset = () => { if (isLocal() || tween) goGlobal(false); else { angle = home.angle; lat = home.lat; distance = home.distance; } touched(); };
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
    let loadCap: (light: boolean) => void = () => {};
    const setExplore = (onOff: boolean) => {
      if (onOff) loadCap(true);
      exploring = onOff;
      wrap.classList.toggle("is-explore", onOff); ui.classList.toggle("is-explore", onOff);
      root.classList.toggle("moon-explore-on", onOff);
      wrap.setAttribute("aria-hidden", onOff ? "false" : "true");
      if (onOff) { wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", pt ? "Lua 3D interativa" : "Interactive 3D Moon"); }
      else { wrap.removeAttribute("role"); wrap.removeAttribute("aria-label"); }
      openBtn.setAttribute("aria-pressed", String(onOff));
      openBtn.textContent = onOff ? T.close : T.open;
      openBtn.setAttribute("aria-label", onOff ? T.close : T.open); openBtn.title = onOff ? T.close : T.open;
      // The south-pole sites sit within a few degrees of each other: from the far default view they stack on one
      // point. Opening explore flies close to the selected site (or the pole) so the pins spread out.
      if (onOff && !tween) {
        const sel = pins.find(p => p.id === selectedId);
        if (sel) focusLatLon(sel.lat, sel.lon); else if (pins.length) focusLatLon(-88.6, 20);
      }
      // Back behind the panels: the far global view and its slow orbit.
      if (!onOff && (isLocal() || tween)) goGlobal(true);
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

    // South cap (LOLA 320 m, terrain shadows): after the first frame on wide screens. Phones skip it behind the
    // panels, but load a lighter cap the first time the user opens "Explore the Moon" (close-ups of the pole were
    // only the blurred 4k globe texture there).
    let capLoading = false;
    loadCap = (light: boolean) => {
      if (cap || capLoading || dead) return;
      capLoading = true;
      S.createCap({ renderer, base: BASE, manifest, moon, segments: light ? PHONE_CAP.segments : want.capSegments, steps: light ? PHONE_CAP.steps : want.capSteps, wideOnly: true }).then(made => {
        if (dead) return;
        scene.add(made.mesh); moon.uniforms.capReady.value = 1; cap = made;
        draw();
      }).catch(() => { capLoading = false; }); // the globe alone is a complete backdrop
    };
    if (want.cap) loadCap(false);
    else if (exploring) loadCap(true);
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
      if (!lazy) {
        // No hardware WebGL (or the scene failed): Joel's real GPU poster instead of an empty background.
        mountMoonBackdrop({ view }).then(async made => {
          if (made) return;
          try {
            const { mountMoonPoster } = await import("./poster-fallback.js");
            const wrap = document.createElement("div");
            wrap.className = "moon-backdrop is-on is-poster"; wrap.setAttribute("aria-hidden", "true");
            document.body.prepend(wrap);
            const css = document.createElement("link"); css.rel = "stylesheet"; css.href = new URL("./backdrop.css", import.meta.url).href;
            document.head.append(css);
            mountMoonPoster(wrap, { view: view === "globe" ? "globe" : "pole", lang: (document.documentElement.lang || "pt").startsWith("en") ? "en" : "pt" });
            document.documentElement.classList.add("moon-backdrop-on");
          } catch { /* the page keeps its own background */ }
        });
        return;
      }
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
