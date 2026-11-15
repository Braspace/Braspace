// Adapted original 8 tests from PR #312, 84ca9d0. See README for intentional contract corrections.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { ROUTES, DEFAULT_UPSTREAM, handleAPI, handleMoonAPI } from "./moonproof-worker.mjs";

const origin = "https://braspace-moonproof.example.workers.dev";
const assets = { ASSETS: { fetch: () => new Response("static") } };

function withFetch(impl, fn) {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return impl(url, opts); };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = original; });
}

test("allowlist mirrors api/openapi.json exactly (no drift either way)", () => {
  let fromSpec;
  try {
    const spec = JSON.parse(readFileSync(process.env.BRASPACE_OPENAPI_SPEC || new URL("../../api/openapi.json", import.meta.url), "utf8"));
    fromSpec = Object.entries(spec.paths).flatMap(([p, ops]) =>
      Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete", "head", "options"].includes(m)).map((m) => `${m.toUpperCase()} ${p}`)).sort();
  } catch (e) {
    if(process.env.BRASPACE_OPENAPI_SPEC || e.code !== "ENOENT") throw e;
    fromSpec = JSON.parse(readFileSync(new URL("./openapi-operations.json", import.meta.url), "utf8")).operations
      .map(({method,path}) => `${method} ${path}`).sort();
  }
  assert.deepEqual(ROUTES.map(([m, p]) => `${m} ${p}`).sort(), fromSpec);
});

test("non-API paths fall through to ASSETS untouched", async () => {
  assert.equal(await handleAPI(new Request(origin + "/")), null);
  assert.equal(await handleAPI(new Request(origin + "/moonproof/index.html")), null);
  assert.equal(await handleAPI(new Request(origin + "/apiary")), null);
  assert.equal(await (await worker.fetch(new Request(origin + "/"), assets)).text(), "static");
  assert.equal(handleMoonAPI, handleAPI);
});

test("unknown API path, wrong method and same-origin OPTIONS", async () => {
  assert.equal((await handleAPI(new Request(origin + "/api/secret"))).status, 404);
  assert.equal((await handleAPI(new Request(origin + "/api/sites/../admin"))).status, 404);
  const r = await handleAPI(new Request(origin + "/api/compare"));
  assert.equal(r.status, 405); assert.equal(r.headers.get("allow"), "POST");
  const o = await handleAPI(new Request(origin + "/api/compare", { method: "OPTIONS" }));
  assert.equal(o.status, 204); assert.equal(o.headers.get("access-control-allow-origin"), null);
});

test("POST bodies are bounded; JSON shape/duplicates remain Go-owned", async () => {
  await withFetch(() => Response.json({code:"INVALID_JSON"},{status:400}), async (calls) => {
    const run = (body, type = "application/json", q = "") => handleAPI(new Request(origin + "/api/compare" + q, { method: "POST", body, headers: { "Content-Type": type } }));
    assert.equal((await run("{}", "text/plain")).status, 415);
    assert.equal((await run("!invalid")).status, 400);
    assert.equal((await run("[]")).status, 400);
    assert.equal((await run("null")).status, 400);
    assert.equal((await run("x".repeat(131073))).status, 413);
    assert.equal((await run("{}", "application/json", "?x=1")).status, 400);
    assert.equal(calls.length, 3); // malformed JSON, array and null forwarded unchanged so Go owns validation
  });
});

test("upstream is pinned, credentials stripped, Go status and errors preserved", async () => {
  await withFetch(() => Response.json({ code: "OUTSIDE_COVERAGE" }, { status: 422 }), async (calls) => {
    const body = { site_ids: ["connecting-ridge"], start_utc: "2026-11-15T00:00:00Z", duration_hours: 24 };
    const r = await handleAPI(new Request(origin + "/api/compare", { method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Authorization: "Bearer t", Cookie: "a=1", Origin: origin, "CF-Connecting-IP": "1.2.3.4" } }));
    assert.equal(calls[0].url, DEFAULT_UPSTREAM + "/api/compare");
    assert.equal(calls[0].opts.redirect, "error");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(calls[0].opts.body)), body);
    for (const h of ["Authorization", "Cookie", "Origin", "CF-Connecting-IP"]) assert.equal(calls[0].opts.headers.get(h), null);
    assert.equal(r.status, 422); assert.deepEqual(await r.json(), { code: "OUTSIDE_COVERAGE" });
  });
});

test("GET routes with {id} and query reach the right upstream path", async () => {
  await withFetch(() => Response.json({ ok: true }), async (calls) => {
    assert.equal((await handleAPI(new Request(origin + "/api/sites/shackleton-rim/sky?start=2026-11-15T00:00:00Z"))).status, 200);
    assert.equal(calls[0].url, DEFAULT_UPSTREAM + "/api/sites/shackleton-rim/sky?start=2026-11-15T00:00:00Z");
    assert.equal((await handleAPI(new Request(origin + "/readyz"))).status, 200);
    assert.equal((await handleAPI(new Request(origin + "/v1/capabilities"))).status, 200);
    assert.equal((await handleAPI(new Request(origin + "/api/sites/" + "a".repeat(200)))).status, 404);
    assert.equal((await handleAPI(new Request(origin + "/api/sites?q=" + "x".repeat(3000)))).status, 400);
  });
});

test("non-JSON upstream is rejected except for layer assets", async () => {
  await withFetch(() => new Response("<html>", { headers: { "Content-Type": "text/html" } }), async () => {
    assert.equal((await handleAPI(new Request(origin + "/api/health"))).status, 502);
  });
  await withFetch(() => new Response(new Uint8Array([255, 216]), { headers: { "Content-Type": "image/jpeg" } }), async () => {
    const r = await handleAPI(new Request(origin + "/api/layers/lola-80m/asset"));
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg");
  });
});

test("network failure and timeout map to structured 502/504, never success", async () => {
  await withFetch(() => { throw new TypeError("network"); }, async () => {
    const r = await handleAPI(new Request(origin + "/api/health"));
    assert.equal(r.status, 502); assert.equal((await r.json()).code, "API_UNAVAILABLE");
  });
  await withFetch(() => { const e = new Error("t"); e.name = "TimeoutError"; throw e; }, async () => {
    assert.equal((await handleAPI(new Request(origin + "/api/health"))).status, 504);
  });
});

