import test from "node:test";
import assert from "node:assert/strict";
import { startRouter } from "../ds/router.js";

// Minimal DOM/BOM fakes: just what startRouter touches.
function el(id) {
  const e = { id, children: [], attrs: {}, focused: 0,
    replaceChildren(...n) { e.children = n; }, append(...n) { e.children.push(...n); },
    get childNodes() { return e.children; },
    setAttribute(k, v) { e.attrs[k] = v; }, removeAttribute(k) { delete e.attrs[k]; },
    querySelector() { return null; }, focus() { e.focused++; } };
  return e;
}
function setup(initialHash, routes) {
  const outlet = el("view"); const after = []; let listener;
  globalThis.location = { hash: initialHash, replace() {} };
  globalThis.history = { replaceState(_s, _t, url) { globalThis.location.hash = url; } };
  globalThis.document = { title: "", createElement: () => el(), getElementById: id => (id === "view" ? outlet : null) };
  globalThis.addEventListener = (_t, fn) => { listener = fn; };
  globalThis.localStorage = { setItem() {} };
  startRouter({ routes, outlet, onAfter: ctx => after.push(ctx.path) });
  const nav = h => { globalThis.location.hash = h; return listener(); };
  return { outlet, after, nav };
}
const defer = () => { let res; const p = new Promise(r => { res = r; }); return { p, res }; };
const tick = () => new Promise(r => setImmediate(r));

test("A then B then late A: only B is in the DOM and onAfter runs once", async () => {
  const a = defer();
  const routes = [
    { path: "/a", title: "A", render: async out => { await a.p; out.append("A"); } },
    { path: "/b", title: "B", render: async out => { out.append("B"); } },
  ];
  const { outlet, after, nav } = setup("#/a", routes); // initial handle() = A, still pending
  await nav("#/b");
  a.res(); await tick(); // stale A resolves last
  assert.deepEqual(outlet.children, ["B"]);
  assert.deepEqual(after, ["/b"]);
  assert.equal(outlet.attrs["aria-busy"], undefined);
});

test("same route re-entered while the first render is pending renders once", async () => {
  const first = defer(); let n = 0;
  const routes = [{ path: "/a", title: "A", render: async out => { const k = ++n; if (k === 1) await first.p; out.append("A" + k); } }];
  const { outlet, after, nav } = setup("#/a", routes);
  await nav("#/a");
  first.res(); await tick();
  assert.deepEqual(outlet.children, ["A2"]);
  assert.deepEqual(after, ["/a"]);
});

test("skip link #view is an in-page anchor: focuses main, keeps the route, no 404", async () => {
  const routes = [
    { path: "/a", title: "A", render: async out => { out.append("A"); } },
    { path: "*", notFound: true, title: "404", render: async out => { out.append("404"); } },
  ];
  const { outlet, after, nav } = setup("#/a", routes);
  await tick();
  const before = outlet.focused;
  await nav("#view");
  assert.deepEqual(outlet.children, ["A"]);
  assert.equal(outlet.focused, before + 1);
  assert.equal(outlet.attrs.tabindex, "-1");
  assert.equal(globalThis.location.hash, "#/a");
  assert.deepEqual(after, ["/a"]);
});
