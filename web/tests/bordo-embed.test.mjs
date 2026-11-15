// #308: onboard cockpit mounted natively in the shell (#/bordo) with an explicit lifecycle.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startRouter } from "../ds/router.js";
import { scopeCockpitCSS, COCKPIT_SCRIPTS } from "../shell/views/bordo.js";

const read = p => readFile(new URL("../" + p, import.meta.url), "utf8");

function fakeEnv(hash) {
  const listeners = {};
  globalThis.location = { hash, replace(h) { this.hash = h; } };
  globalThis.history = { replaceState: (_s, _t, h) => { globalThis.location.hash = h; } };
  globalThis.addEventListener = (t, f) => { listeners[t] = f; };
  globalThis.document = { title: "" };
  globalThis.localStorage = { setItem() {}, getItem: () => null };
  const outlet = { children: 0, replaceChildren() { this.children = 0; }, setAttribute() {}, removeAttribute() {}, querySelector: () => null };
  return { outlet, nav: async h => { globalThis.location.hash = h; await listeners.hashchange(); } };
}

test("router: same-route update() keeps the view mounted; leaving disposes it exactly once", async () => {
  const env = fakeEnv("#/bordo/energia");
  const log = [];
  const bordo = { path: "/bordo", prefix: true, title: "Bordo", render: (_o, ctx) => {
    log.push("mount " + ctx.parts.join("/"));
    return { update: next => { log.push("update " + next.parts.join("/")); return next.query.site === ctx.query.site; }, dispose: () => log.push("dispose") };
  } };
  const other = { path: "/explorar", title: "Explorar", render: () => { log.push("mount explorar"); } };
  const r = startRouter({ routes: [bordo, other], outlet: env.outlet });
  await r.refresh();
  log.length = 0;
  await env.nav("#/bordo/janelas");
  await env.nav("#/bordo/janelas?site=x");   // site change: update() refuses -> remount
  await env.nav("#/explorar");
  assert.deepEqual(log, ["update bordo/janelas", "update bordo/janelas", "dispose", "mount bordo/janelas", "dispose", "mount explorar"]);
  assert.equal(document.title, "Explorar · moonproof");
});

test("router: a view that returns nothing still renders (backwards compatible)", async () => {
  const env = fakeEnv("#/a");
  let n = 0;
  const r = startRouter({ routes: [{ path: "/a", title: "A", render: () => { n++; } }], outlet: env.outlet });
  await r.refresh(); await env.nav("#/a?x=1");
  assert.equal(n, 3); // initial call + refresh + nav: no update hook, so every change re-renders
});

test("cockpit CSS is scoped to the embed wrapper; page-level rules move to :scope", () => {
  const out = scopeCockpitCSS(":root { --a: 1; }\nhtml, body { margin: 0; }\nbody { overflow-x: hidden; }\n.panel { color: red; }");
  assert.match(out, /^@scope \(\.cockpit-embed\) \{/);
  assert.doesNotMatch(out, /:root|html|body/);
  assert.equal((out.match(/:scope/g) || []).length, 3);
  assert.match(out, /\.panel \{ color: red; \}/);
});

test("embedded board uses the cockpit.html scripts in the same order (single source)", async () => {
  const html = await read("onboard/cockpit.html");
  const order = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(COCKPIT_SCRIPTS, order);
});

test("cockpit exposes mount/unmount, self-mounts only when not deferred, and disposes its timers", async () => {
  const src = await read("onboard/cockpit.ts");
  assert.match(src, /window as Dyn\)\.OnboardCockpit = \{ mount, unmount/);
  assert.match(src, /if \(!\(window as Dyn\)\.OnboardCockpitDeferred\)/);
  assert.match(src, /disposers\.push\(\(\) => clearInterval\(clock\)\)/);
  assert.doesNotMatch(src, /"\.\.\/index\.html"\s*\+/); // links go through HOME()
  for (const fn of ["loadHealth", "loadSites"]) {
    const body = src.slice(src.indexOf("async function " + fn), src.indexOf("async function " + fn) + 400);
    assert.match(body, /if \(!MOUNTED\) return;/, fn + " must ignore results after unmount");
  }
});

test("shell: #/bordo renders natively (no page change); the lab keeps its page", async () => {
  const app = await read("shell/app.tsx");
  const bordo = app.split("\n").find(l => l.includes('path: "/bordo"'));
  assert.match(bordo, /render: view\("bordo"\)/);
  assert.doesNotMatch(bordo, /location\.replace|external/);
  assert.match(app, /path: "\/terreno".*external/);
});
