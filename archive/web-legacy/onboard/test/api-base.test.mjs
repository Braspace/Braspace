// Commit 1: configurable API base (BR38 item d).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);

function load() {
  delete require.cache[require.resolve("../api.js")];
  return require("../api.js");
}
function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push(url); return { ok: true, status: 200, text: async () => "{}" }; };
  return calls;
}

test("default base is same origin (relative path)", async () => {
  delete globalThis.BRASPACE_API_BASE;
  const calls = stubFetch();
  await load().health();
  assert.deepEqual(calls, ["/api/health"]);
});

test("BRASPACE_API_BASE prefixes every call and trailing slash is dropped", async () => {
  globalThis.BRASPACE_API_BASE = "https://braspace-api.srv1898743.hstgr.cloud/";
  const calls = stubFetch();
  const api = load();
  await api.health(); await api.compare({}); await api.readyz(); await api.capabilities(); await api.sky("synthetic-demo-a", "hours=6");
  assert.deepEqual(calls, [
    "https://braspace-api.srv1898743.hstgr.cloud/api/health",
    "https://braspace-api.srv1898743.hstgr.cloud/api/compare",
    "https://braspace-api.srv1898743.hstgr.cloud/readyz",
    "https://braspace-api.srv1898743.hstgr.cloud/v1/capabilities",
    "https://braspace-api.srv1898743.hstgr.cloud/api/sites/synthetic-demo-a/sky?hours=6"
  ]);
  delete globalThis.BRASPACE_API_BASE;
});

test("no front-end script calls fetch with a bare /api path", () => {
  for (const f of ["cockpit.ts", "app.ts"]) {
    const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(!/fetch\(\s*["']\/api/.test(src), f + " bypasses the configurable base");
    assert.ok(!/fetch\(\s*API_PATH/.test(src), f + " calls fetch(API_PATH) without the base");
  }
});

test("pages load config.js before the scripts that call the API", () => {
  for (const [f, last] of [["cockpit.html", "api.js"], ["index.html", "app.js"]]) {
    const html = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(html.indexOf("config.js") > 0 && html.indexOf("config.js") < html.indexOf(last), f);
  }
});
