// FE-05: Moon HD without WebGL must end in an accessible problem state, not a loading screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectWebGL, problemModel, FALLBACK_HREF } from "../moon-hd/fallback.js";

test("detectWebGL: no context, a throwing canvas and a working context", () => {
  assert.deepEqual(detectWebGL(() => ({ getContext: () => null })), { ok: false, reason: "no-context" });
  assert.equal(detectWebGL(() => { throw new Error("boom"); }).ok, false);
  assert.equal(detectWebGL(() => null).ok, false);
  let lost = 0;
  const gl = { getExtension: n => (n === "WEBGL_lose_context" ? { loseContext: () => lost++ } : null) };
  assert.equal(detectWebGL(() => ({ getContext: t => (t === "webgl2" ? gl : null) })).ok, true);
  assert.equal(lost, 1, "probe context is released");
});

test("problemModel: alert role, a way out, never a spinner", () => {
  for (const lang of ["en", "pt"]) {
    const m = problemModel("nowebgl", lang);
    assert.equal(m.role, "alert");
    assert.ok(m.message.length > 20);
    assert.equal(m.link.href, FALLBACK_HREF);
    assert.ok(m.retry);
  }
  assert.notEqual(problemModel("nowebgl", "pt").message, problemModel("nowebgl", "en").message);
  const lost = problemModel("lost");
  assert.equal(lost.retry, null);
  assert.equal(lost.link, null);
  assert.equal(problemModel("whatever").kind, "failed");
});

test("the fallback target exists and app.js wires the guards", async () => {
  await readFile(new URL("../polar-map-demo.html", import.meta.url));
  const app = await readFile(new URL("../moon-hd/app.js", import.meta.url), "utf8");
  assert.match(app, /detectWebGL\(/);
  assert.match(app, /webglcontextlost/);
  assert.match(app, /webglcontextrestored/);
  assert.doesNotMatch(app, /^const renderer = new THREE\.WebGLRenderer/m, "renderer is no longer built at module top level");
});
