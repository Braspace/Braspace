import test from "node:test";
import assert from "node:assert/strict";
import { api, apiOnline } from "../core/data.js";

test("MoonProof requests the live API on official GitHub Pages and the same-origin proxy locally", async () => {
  const originalFetch = globalThis.fetch;
  const oldLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  const oldOverride = Object.getOwnPropertyDescriptor(globalThis, "BRASPACE_API_BASE");
  const seen = [];
  try {
    delete globalThis.BRASPACE_API_BASE;
    globalThis.fetch = async (url, options) => {
      seen.push({ url: String(url), method: options.method, body: options.body });
      return new Response(JSON.stringify({ science_status: "PRELIMINARY", status: "ok" }),
        { headers: { "content-type": "application/json" } });
    };
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://braspace.github.io/moonproof/mission.html") });
    assert.equal(await apiOnline(), true);
    const outcome = await api("/api/compare", { method: "POST", body: { site_ids: ["connecting-ridge"] } });
    assert.equal(outcome.status, "PRELIMINARY");
    assert.deepEqual(seen.slice(0, 2), [
      { url: "https://braspace-api.srv1898743.hstgr.cloud/readyz", method: "GET", body: undefined },
      { url: "https://braspace-api.srv1898743.hstgr.cloud/api/compare", method: "POST", body: '{"site_ids":["connecting-ridge"]}' }
    ]);
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("http://127.0.0.1:5173/moonproof/mission.html") });
    assert.equal(await apiOnline(), true);
    assert.equal(seen.at(-1).url, "/readyz");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldLocation) Object.defineProperty(globalThis, "location", oldLocation); else delete globalThis.location;
    if (oldOverride) Object.defineProperty(globalThis, "BRASPACE_API_BASE", oldOverride); else delete globalThis.BRASPACE_API_BASE;
  }
});

test("API preserves typed errors and accepts only HTML reports", async () => {
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({code:"OUTSIDE_COVERAGE"}),{status:422,headers:{"content-type":"application/json"}});
    const bad=await api("/api/onboard/site-evaluate",{method:"POST",body:{}});
    assert.equal(bad.code,"OUTSIDE_COVERAGE"); assert.equal(bad.httpStatus,422); assert.equal(bad.offline,false);
    globalThis.fetch=async()=>new Response("not a report",{headers:{"content-type":"text/plain"}});
    assert.equal((await api("/api/onboard/report",{as:"text"})).error,"INVALID_REPORT_TYPE");
    globalThis.fetch=async()=>new Response("<!doctype html><h1>Report</h1>",{headers:{"content-type":"text/html; charset=utf-8"}});
    assert.equal((await api("/api/onboard/report",{as:"text"})).ok,true);
  } finally {globalThis.fetch=originalFetch;}
});
