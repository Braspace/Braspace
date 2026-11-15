// Shared hypothetical "Artemis / HLS style" lunar lander, built from three.js primitives.
// Original design: tall crew stage on a gold-foil descent stage, four splayed legs, solar wings, radiator fins,
// one engine bell and an additive plume. No mission insignia, logos or trademarks. Display only: not telemetry.
//
// One lander for every 3D view: the Landing Lab (web/lab/scene.ts addLander) and the cockpit's 3D Moon
// (web/moon-hd/artemis-cockpit.ts) both call buildArtemisLander. three.js is passed in (no import here), so this
// module stays free of remote imports and its pure helpers run under node --test.
//
// Model frame (scale 1 = metres, same as the lab): +Y up, origin at the lab's reference point, footpads at
// y = -1.6 on a 4 m leg span, nozzle exit at y = -1.15.
import type { Three } from "../api-types.js";

export const ARTEMIS_NAME = "artemis-lander";
/** Leg span (footpad centre to footpad centre) at scale 1, in metres. */
export const ARTEMIS_SPAN_M = 4;
export const NOZZLE_EXIT_Y = -1.15, FOOT_Y = -1.6;

export interface ArtemisOptions { scale?: number; name?: string; shadows?: boolean; }
export interface ArtemisLander { group: Three; flame: Three; setThrottle(throttle: number): void; dispose(): void; }

/** Plume length (model units) for a throttle 0..1; the same law the lab always used. */
export const plumeLength = (throttle: number) => 0.6 + 5 * clamp01(throttle);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/** Scale that gives a wanted leg span (scene units). */
export const scaleForSpan = (span: number) => span / ARTEMIS_SPAN_M;

/** Unit vector of selenographic lat/lon in the globe scene frame of moon-hd (body (x, y, z) -> scene (x, z, -y)). */
export function globeUp(latDeg: number, lonDeg: number): [number, number, number] {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180, c = Math.cos(la);
  return [c * Math.cos(lo), Math.sin(la), -c * Math.sin(lo)];
}

/**
 * Hover / descent loop of the illustrative lander (display only). `t` in seconds.
 * Returns the radius (Moon radius = 1) and the throttle. Reduced motion: one fixed pose.
 */
export function hoverPose(t: number, { reducedMotion = false, low = 1.03, high = 1.06, period = 14 } = {}): { r: number; throttle: number } {
  if (reducedMotion || !Number.isFinite(t)) return { r: (low + high) / 2, throttle: 0.45 };
  const ph = ((t % period) + period) % period / period;          // 0..1
  const k = 0.5 + 0.5 * Math.cos(2 * Math.PI * ph);              // 1 at the top, 0 at the bottom
  const r = low + (high - low) * k;
  // more thrust near the bottom of the loop (braking), plus a small flicker
  const brake = 1 - k, flicker = 0.06 * Math.sin(t * 23) + 0.04 * Math.sin(t * 37 + 1.3);
  return { r, throttle: clamp01(0.32 + 0.38 * brake + flicker) };
}

export function buildArtemisLander(THREE: Three, opts: ArtemisOptions = {}): ArtemisLander {
  const g = new THREE.Group();
  g.name = opts.name || ARTEMIS_NAME;
  const geoms: Three[] = [], mats: Three[] = [];
  const mat = (p: Record<string, unknown>) => { const m = new THREE.MeshStandardMaterial(p); mats.push(m); return m; };
  const add = (geo: Three, m: Three, x = 0, y = 0, z = 0, parent: Three = g) => {
    geoms.push(geo); const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const gold = mat({ color: 0xd2a63c, roughness: 0.34, metalness: 0.55, emissive: 0x2a1d04, emissiveIntensity: 0.35 });
  const white = mat({ color: 0xe9ecef, roughness: 0.42, metalness: 0.18 });
  const silver = mat({ color: 0xa9b1ba, roughness: 0.32, metalness: 0.6 });
  const dark = mat({ color: 0x2b3038, roughness: 0.3, metalness: 0.75 });
  const glass = mat({ color: 0x0b1220, roughness: 0.08, metalness: 0.9, emissive: 0x0e2a3c, emissiveIntensity: 0.6 });
  const cells = mat({ color: 0x1c3a66, roughness: 0.28, metalness: 0.45, emissive: 0x06142c, emissiveIntensity: 0.8 });
  const accent = mat({ color: 0x2ec4a0, roughness: 0.4, metalness: 0.2, emissive: 0x0b3a30, emissiveIntensity: 0.5 });

  // descent stage (octagonal, gold MLI) and its top deck
  add(new THREE.CylinderGeometry(1.2, 1.3, 0.9, 8), gold, 0, -0.1, 0);
  add(new THREE.CylinderGeometry(1.26, 1.26, 0.08, 8), silver, 0, 0.39, 0);
  add(new THREE.CylinderGeometry(1.31, 1.31, 0.06, 8), dark, 0, -0.52, 0);
  // crew stage: tall white cylinder, accent ring, windows, tapered top and docking ring
  add(new THREE.CylinderGeometry(0.72, 0.8, 1.45, 28), white, 0, 1.1, 0);
  add(new THREE.CylinderGeometry(0.815, 0.815, 0.06, 28), accent, 0, 0.62, 0);
  add(new THREE.CylinderGeometry(0.76, 0.76, 0.04, 28), silver, 0, 1.78, 0);
  for (const x of [-0.17, 0.17]) { const w = add(new THREE.BoxGeometry(0.2, 0.15, 0.04), glass, x, 1.52, 0.735); w.rotation.y = x * 0.9; }
  add(new THREE.CylinderGeometry(0.32, 0.72, 0.32, 28), white, 0, 1.985, 0);
  add(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 20), silver, 0, 2.195, 0);
  // RCS pods at the shoulders
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const pod = add(new THREE.BoxGeometry(0.16, 0.16, 0.16), silver, Math.cos(a) * 0.76, 1.66, Math.sin(a) * 0.76); pod.rotation.y = -a;
  }
  // radiator fins (±Z) and solar wings (±X) on booms
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.9, 0.55), white, 0, 1.1, s * 1.05);
  for (const s of [-1, 1]) {
    const boom = add(new THREE.CylinderGeometry(0.035, 0.035, 0.55), silver, s * 0.98, 1.25, 0); boom.rotation.z = Math.PI / 2;
    add(new THREE.BoxGeometry(1.5, 0.74, 0.03), cells, s * 2.0, 1.25, 0);
    add(new THREE.BoxGeometry(1.54, 0.04, 0.045), silver, s * 2.0, 1.63, 0);
    add(new THREE.BoxGeometry(1.54, 0.04, 0.045), silver, s * 2.0, 0.87, 0);
    for (const dx of [-0.25, 0.25]) add(new THREE.BoxGeometry(0.02, 0.74, 0.04), silver, s * 2.0 + dx, 1.25, 0);
  }
  // antenna mast and dish (kept clear of the lab's pilot camera at (0, 2.4, 0.5))
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.55), silver, -0.5, 2.05, -0.42);
  const dish = add(new THREE.CylinderGeometry(0.24, 0.05, 0.08, 20, 1, true), silver, -0.5, 2.36, -0.42); dish.rotation.x = -0.7;
  dish.material = mat({ color: 0xdfe3e8, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide });
  // legs: primary strut, secondary strut, footpad
  const up = new THREE.Vector3(0, 1, 0);
  const strut = (a: Three, b: Three, r: number) => {
    const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10), silver);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); return m;
  };
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    const top = new THREE.Vector3(c * 0.95, -0.3, s * 0.95), foot = new THREE.Vector3(c * ARTEMIS_SPAN_M / 2, FOOT_Y, s * ARTEMIS_SPAN_M / 2);
    strut(top, foot, 0.055);
    const knee = top.clone().lerp(foot, 0.6);
    strut(new THREE.Vector3(c * 1.18, 0.2, s * 1.18), knee, 0.035);
    add(new THREE.CylinderGeometry(0.3, 0.34, 0.07, 20), silver, foot.x, foot.y, foot.z);
  }
  // engine: powerhead + lathe bell (open, both sides visible), exit at NOZZLE_EXIT_Y
  add(new THREE.CylinderGeometry(0.24, 0.18, 0.16, 20), dark, 0, -0.5, 0);
  const prof = []; for (let k = 0; k <= 12; k++) { const u = k / 12; prof.push(new THREE.Vector2(0.15 + 0.25 * Math.pow(u, 1.6), 0.3 - 0.6 * u)); }
  const bell = add(new THREE.LatheGeometry(prof, 28), mat({ color: 0x4a4f57, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }), 0, -0.85, 0);
  bell.name = "artemis-bell";
  // plume: outer cone + bright core, additive, never casts shadows
  const plume = (color: number, opacity: number) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); mats.push(m); return m; };
  const flameGeo = new THREE.ConeGeometry(0.34, 1, 24, 1, true); geoms.push(flameGeo);
  const flame = new THREE.Mesh(flameGeo, plume(0xffa040, 0.8)); flame.name = "artemis-flame"; flame.rotation.x = Math.PI; g.add(flame);
  add(new THREE.ConeGeometry(0.18, 0.6, 20, 1, true), plume(0xfff0c8, 0.9), 0, 0.2, 0, flame);

  const shadows = opts.shadows !== false;
  g.traverse((o: Three) => { if (o.isMesh) o.castShadow = shadows && o !== flame && o.parent !== flame; });
  if (opts.scale && opts.scale !== 1) g.scale.setScalar(opts.scale);

  const setThrottle = (throttle: number) => {
    const th = clamp01(throttle), len = plumeLength(th);
    flame.visible = th > 0.01;
    flame.scale.set(1, len, 1); flame.position.y = NOZZLE_EXIT_Y - len / 2;
  };
  setThrottle(0);
  const dispose = () => {
    g.parent?.remove(g);
    for (const x of geoms) x.dispose?.();
    for (const x of mats) x.dispose?.();
  };
  return { group: g, flame, setThrottle, dispose };
}
