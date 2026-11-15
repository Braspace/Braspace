// Shared Artemis-class lander: one model for Cockpit and Landing Lab, same physics envelope.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { plumeFor, LANDER_FOOT_Y, LANDER_ENGINE_EXIT_Y, LANDER_LABEL } from "../core/artemis.js";

const read = p => readFile(new URL("../../" + p, import.meta.url), "utf8");

test("envelope matches the Lab's previous lander, so touchdown physics and cameras are unchanged", () => {
  assert.equal(LANDER_FOOT_Y, -1.6);
  assert.equal(LANDER_ENGINE_EXIT_Y, -1.15);
});

test("plume: same formula the Lab used; throttle is clamped; NaN never lights the engine", () => {
  assert.deepEqual(plumeFor(0), { visible: false, scaleY: 0.6, y: -1.15 - 0.3 });
  const full = plumeFor(1); assert.equal(full.visible, true); assert.equal(full.scaleY, 5.6); assert.ok(Math.abs(full.y - (-1.15 - 2.8)) < 1e-12);
  assert.deepEqual(plumeFor(7), full);
  assert.equal(plumeFor(NaN).visible, false);
  assert.equal(plumeFor(-1).visible, false);
});

test("label says illustrative and not to scale in both languages (no false NASA claim)", () => {
  assert.match(LANDER_LABEL["pt-BR"], /ilustrativo/); assert.match(LANDER_LABEL["pt-BR"], /fora de escala/);
  assert.match(LANDER_LABEL.en, /illustrative/); assert.match(LANDER_LABEL.en, /not to scale/);
});

test("Landing Lab and Cockpit use the same model", async () => {
  const scene = await read("lab/scene.ts"), cockpit = await read("moonproof/screens/cockpit.tsx"), view = await read("moonproof/core/artemis-view.tsx");
  assert.match(scene, /import \{ buildArtemisLander, plumeFor.* from "\.\.\/moonproof\/core\/artemis\.js"/);
  assert.match(scene, /this\.lander = buildArtemisLander\(THREE\)/);
  assert.doesNotMatch(scene, /CylinderGeometry\(1\.15, 1\.25, 1\.5, 8\)/, "old primitive lander removed");
  assert.match(view, /buildArtemisLander\(THREE\)/);
  assert.match(cockpit, /import\("\.\.\/core\/artemis-view\.js"\)/, "three.js loads only when the lander is opened");
});

test("view lifecycle: GPU freed on close/unmount, no frames when hidden, WebGL-less fallback text", async () => {
  const view = await read("moonproof/core/artemis-view.tsx");
  assert.match(view, /componentWillUnmount\(\)[\s\S]*cancelAnimationFrame[\s\S]*removeEventListener\("visibilitychange"[\s\S]*cleanupScene/);
  assert.match(view, /renderer\.dispose\(\)/);
  assert.match(view, /document\.hidden\) return/);
  assert.match(view, /getContext\("webgl2"\)[\s\S]*unsupported/); assert.match(view, /status !== "ready" && status !== "loading"\) return null/, "no floating fallback over the panels");
  assert.match(view, /prefers-reduced-motion/);
});

test("cockpit toggle is a real button with aria-pressed and per-viewer memory that survives storage errors", async () => {
  const c = await read("moonproof/screens/cockpit.tsx");
  assert.match(c, /btn\.setAttribute\("aria-pressed", String\(open\)\)/);
  assert.match(c, /try \{ localStorage\.setItem\(KEY/);
  assert.match(c, /addEventListener\("pagehide"/);
});
