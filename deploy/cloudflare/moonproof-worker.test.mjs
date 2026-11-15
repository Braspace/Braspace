import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./moonproof-worker.mjs";
import * as entry from "./moonproof-worker.mjs";
import { ROUTES, KIND_TYPES, DEFAULT_UPSTREAM, handleAPI, handleMoonAPI } from "./moonproof-proxy.mjs";

test("entry module exports only the default handler (workerd rejects non-handler named exports)", () => {
  assert.deepEqual(Object.keys(entry), ["default"]);
  assert.equal(typeof worker.fetch, "function");
});

const origin = "https://braspace-moonproof.example.workers.dev";
const assets = { ASSETS: { fetch: () => new Response("static") } };

function withFetch(impl, fn) {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return impl(url, opts); };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = original; });
}

test("allowlist mirrors api/openapi.json exactly (no drift either way)", () => {
  const spec = JSON.parse(readFileSync(new URL("../../api/openapi.json", import.meta.url), "utf8"));
  const fromSpec = Object.entries(spec.paths).flatMap(([p, ops]) =>
    Object.keys(ops).filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).map((m) => `${m.toUpperCase()} ${p}`)).sort();
  assert.deepEqual(ROUTES.map(([m, p]) => `${m} ${p}`).sort(), fromSpec);
});

test("every success media type the OpenAPI declares is allowed for that route", () => {
  const spec = JSON.parse(readFileSync(new URL("../../api/openapi.json", import.meta.url), "utf8"));
  for (const [method, path, kind] of ROUTES) {
    const op = spec.paths[path][method.toLowerCase()];
    for (const [code, r] of Object.entries(op.responses || {})) {
      if (!/^2/.test(code)) continue;
      for (const ct of Object.keys(r.content || {})) assert.ok(KIND_TYPES[kind].includes(ct), `${method} ${path} ${code} ${ct} not allowed for kind ${kind}`);
    }
  }
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

test("POST bodies are bounded JSON objects before upstream is consulted", async () => {
  await withFetch(() => { throw new Error("must not be called"); }, async (calls) => {
    const run = (body, type = "application/json", q = "") => handleAPI(new Request(origin + "/api/compare" + q, { method: "POST", body, headers: { "Content-Type": type } }));
    assert.equal((await run("{}", "text/plain")).status, 415);
    assert.equal((await run("!invalid")).status, 400);
    assert.equal((await run("[]")).status, 400);
    assert.equal((await run("null")).status, 400);
    assert.equal((await run("x".repeat(131073))).status, 413);
    assert.equal((await run("{}", "application/json", "?x=1")).status, 400);
    assert.equal(calls.length, 0);
  });
});

test("upstream is pinned, credentials stripped, Go status and errors preserved", async () => {
  await withFetch(() => Response.json({ code: "OUTSIDE_COVERAGE" }, { status: 422 }), async (calls) => {
    const body = { site_ids: ["connecting-ridge"], start_utc: "2026-11-15T00:00:00Z", duration_hours: 24 };
    const r = await handleAPI(new Request(origin + "/api/compare", { method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Authorization: "Bearer t", Cookie: "a=1", Origin: origin, "CF-Connecting-IP": "1.2.3.4" } }));
    assert.equal(calls[0].url, DEFAULT_UPSTREAM + "/api/compare");
    assert.equal(calls[0].opts.redirect, "manual", "workerd rejects redirect: \"error\"");
    assert.deepEqual(JSON.parse(calls[0].opts.body), body);
    for (const h of ["Authorization", "Cookie", "Origin", "CF-Connecting-IP"]) assert.equal(calls[0].opts.headers.get(h), null);
    assert.equal(r.status, 422); assert.deepEqual(await r.json(), { code: "OUTSIDE_COVERAGE" });
  });
});

test("GET routes with {id} and query reach the right upstream path", async () => {
  await withFetch(() => Response.json({ ok: true }), async (calls) => {
    assert.equal((await handleAPI(new Request(origin + "/api/sites/shackleton-rim/sky?at=2026-11-15T00:00:00Z"))).status, 200);
    assert.equal(calls[0].url, DEFAULT_UPSTREAM + "/api/sites/shackleton-rim/sky?at=2026-11-15T00:00:00Z");
    assert.equal((await handleAPI(new Request(origin + "/readyz"))).status, 200);
    assert.equal((await handleAPI(new Request(origin + "/v1/capabilities"))).status, 200);
    assert.equal((await handleAPI(new Request(origin + "/api/sites/" + "a".repeat(200)))).status, 404);
    assert.equal((await handleAPI(new Request(origin + "/api/sites?q=" + "x".repeat(3000)))).status, 414);
  });
});

test("non-JSON upstream is rejected except for layer assets", async () => {
  await withFetch(() => new Response("<html>", { headers: { "Content-Type": "text/html" } }), async () => {
    assert.equal((await handleAPI(new Request(origin + "/api/health"))).status, 502);
  });
  await withFetch(() => new Response(new Uint8Array([137, 80]), { headers: { "Content-Type": "image/png" } }), async () => {
    const r = await handleAPI(new Request(origin + "/api/layers/lola-80m/asset"));
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/png");
  });
});

test("text/plain upstream errors keep their status as structured JSON (missing route stays 404)", async () => {
  await withFetch(() => new Response("404 page not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }), async () => {
    const r = await handleAPI(new Request(origin + "/api/onboard/navigation", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { code: "UPSTREAM_ROUTE_NOT_FOUND", error: "404 page not found", upstream_status: 404 });
  });
  await withFetch(() => new Response("invalid mission scenario", { status: 422, headers: { "Content-Type": "text/plain" } }), async () => {
    const r = await handleAPI(new Request(origin + "/api/onboard/report", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
    assert.equal(r.status, 422); assert.equal((await r.json()).code, "UPSTREAM_ERROR");
  });
  await withFetch(() => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } }), async () => {
    assert.equal((await handleAPI(new Request(origin + "/api/health"))).status, 502); // a non-JSON 200 is never a success
  });
});

test("HTML reports pass through with the upstream CSP", async () => {
  await withFetch(() => new Response("<h1>r</h1>", { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'" } }), async () => {
    const r = await handleAPI(new Request(origin + "/api/onboard/report", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-security-policy"), "default-src 'none'");
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

test("an upstream redirect is never followed: 502 UPSTREAM_REDIRECT", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } });
  try {
    const res = await handleAPI(new Request("https://w.example/api/health"));
    assert.equal(res.status, 502);
    assert.equal((await res.json()).code, "UPSTREAM_REDIRECT");
  } finally { globalThis.fetch = saved; }
});
