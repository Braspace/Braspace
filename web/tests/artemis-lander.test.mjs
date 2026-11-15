import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildArtemisLander, hoverPose, plumeLength, scaleForSpan, globeUp, ARTEMIS_NAME, ARTEMIS_SPAN_M, NOZZLE_EXIT_Y } from "../moon-hd/artemis.js";
import { focusTarget, COCKPIT_SPAN, SOUTH_POLE } from "../moon-hd/artemis-cockpit.js";

const read = p => readFile(new URL("../" + p, import.meta.url), "utf8");

// Minimal three.js stand-in: enough surface for buildArtemisLander (offline, no WebGL).
class V { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(s) { return this.set(s, s, s); }
  copy(v) { return this.set(v.x, v.y, v.z); } clone() { return new V(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; } sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; } length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { return this.multiplyScalar(1 / (this.length() || 1)); } distanceTo(v) { return this.clone().sub(v).length(); }
  lerp(v, k) { this.x += (v.x - this.x) * k; this.y += (v.y - this.y) * k; this.z += (v.z - this.z) * k; return this; } }
let disposed = 0;
class Obj { constructor() { this.children = []; this.parent = null; this.position = new V(); this.scale = new V(1, 1, 1); this.rotation = new V();
  this.quaternion = { setFromUnitVectors() { return this; } }; this.visible = true; }
  add(...o) { for (const c of o) { c.parent = this; this.children.push(c); } return this; }
  remove(c) { this.children = this.children.filter(x => x !== c); c.parent = null; }
  traverse(f) { f(this); for (const c of this.children) c.traverse(f); } }
class Mesh extends Obj { constructor(geometry, material) { super(); this.isMesh = true; this.geometry = geometry; this.material = material; } }
class Res { constructor(...a) { this.args = a; } dispose() { disposed++; } }
const THREE = { Group: Obj, Mesh, Vector3: V, Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
  MeshStandardMaterial: Res, MeshBasicMaterial: Res, CylinderGeometry: Res, BoxGeometry: Res, ConeGeometry: Res, LatheGeometry: Res,
  DoubleSide: 2, AdditiveBlending: 2 };

test("one named lander group, plume follows the lab's throttle law, scale option, dispose", () => {
  const L = buildArtemisLander(THREE);
  assert.equal(L.group.name, ARTEMIS_NAME);
  assert.ok(L.group.children.length > 30, "built from many primitives");
  assert.equal(L.flame.parent, L.group);
  assert.equal(L.flame.visible, false, "engine off until throttled");
  L.setThrottle(0.5);
  assert.equal(L.flame.visible, true);
  assert.equal(L.flame.scale.y, plumeLength(0.5));
  assert.ok(Math.abs(L.flame.position.y - (NOZZLE_EXIT_Y - plumeLength(0.5) / 2)) < 1e-12, "plume hangs from the nozzle exit");
  L.setThrottle(9); assert.equal(L.flame.scale.y, plumeLength(1));
  let shadowed = 0; L.group.traverse(o => { if (o.isMesh && o.castShadow) shadowed++; if (o === L.flame || o.parent === L.flame) assert.ok(!o.castShadow); });
  assert.ok(shadowed > 20);
  // footpads span the lab's 4 m
  const pads = []; L.group.traverse(o => { if (o.isMesh && o.geometry.args[0] === 0.3 && o.geometry.args[1] === 0.34) pads.push(o.position); });
  assert.equal(pads.length, 4);
  for (const p of pads) assert.ok(Math.abs(Math.hypot(p.x, p.z) * 2 - ARTEMIS_SPAN_M) < 1e-9);
  const parent = new Obj(); parent.add(L.group); disposed = 0; L.dispose();
  assert.equal(L.group.parent, null); assert.ok(disposed > 20);
  const small = buildArtemisLander(THREE, { scale: scaleForSpan(COCKPIT_SPAN), shadows: false });
  assert.ok(Math.abs(small.group.scale.x * ARTEMIS_SPAN_M - COCKPIT_SPAN) < 1e-12);
  small.group.traverse(o => assert.ok(!o.castShadow));
});

test("hover loop stays at an exaggerated altitude; reduced motion is one still pose", () => {
  let lo = 9, hi = 0;
  for (let t = 0; t < 30; t += 0.05) { const p = hoverPose(t); lo = Math.min(lo, p.r); hi = Math.max(hi, p.r); assert.ok(p.throttle >= 0 && p.throttle <= 1); }
  assert.ok(lo >= 1.03 - 1e-9 && hi <= 1.06 + 1e-9 && hi - lo > 0.02);
  assert.deepEqual(hoverPose(3, { reducedMotion: true }), hoverPose(17, { reducedMotion: true }));
  assert.ok(hoverPose(0, { reducedMotion: true }).r > 1.03);
});

test("local up is the surface normal in the globe scene frame; camera stands off equatorward", () => {
  const u = globeUp(-90, 0); assert.ok(Math.abs(u[1] + 1) < 1e-12, "south pole is -Y");
  const e = globeUp(0, 90); assert.ok(Math.abs(e[2] + 1) < 1e-12, "body +Y maps to scene -Z");
  assert.ok(Math.abs(Math.hypot(...globeUp(-84.8, 29.1)) - 1) < 1e-12);
  assert.deepEqual(focusTarget(SOUTH_POLE.lat, 0), { lat: -86.5, lon: 0 }, "inside the 88° camera cap: equatorward");
  assert.deepEqual(focusTarget(-70, 30), { lat: -73, lon: 30 }, "poleward on the same meridian");
  assert.ok(Math.abs(focusTarget(-84.78, 29).lat + 87.78) < 1e-9);
  assert.ok(focusTarget(40, 5).lat > 40);
});

test("lab and cockpit share the lander; cockpit mounts only the regional scene, honest label", async () => {
  const lab = await read("lab/scene.ts"), ck = await read("moonproof/screens/cockpit.tsx"), mod = await read("moonproof/screens/cockpit-3d.tsx"), art = await read("moon-hd/artemis.ts");
  assert.match(lab, /buildArtemisLander\(THREE/);
  assert.match(ck, /mountCockpit3D\(/);
  assert.doesNotMatch(ck, /mountArtemisCockpit\(/, "no competing backdrop renderer");
  assert.match(mod, /buildArtemisLander\(T,/);
  assert.doesNotMatch(art, /createMoon|WebGLRenderer|^\s*import .*https?:/m, "model creates no renderer");
  assert.doesNotMatch(mod + art, /cssText|setAttribute\("style"|style=/);
  assert.doesNotMatch(art + mod, /NASA logo|meatball|insignia\(/i);
  assert.match(mod, /nave Artemis ilustrativa/);
  assert.match(mod, /illustrative Artemis lander/);
});
