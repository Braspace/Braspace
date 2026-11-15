// Regression for the 15/11 outage: every /api call on braspace-moonproof.*.workers.dev answered
// 502 API_UNAVAILABLE while the Go API was healthy. The Workers runtime (workerd) throws
//   TypeError: Invalid redirect value, must be one of "follow" or "manual"
// for redirect:"error"; the proxy caught it as a network failure. Node's fetch accepts "error",
// so the existing suites passed. This stub reproduces the workerd rule.
import {test} from "node:test";
import assert from "node:assert/strict";
import {handleAPI} from "./moonproof-worker.mjs";

function workerdFetch(respond) {
  return async (url, init = {}) => {
    if (init.redirect !== undefined && !["follow", "manual"].includes(init.redirect)) {
      throw new TypeError(`Invalid redirect value, must be one of "follow" or "manual" ("${init.redirect}" won't be implemented since it does not make sense at the edge)`);
    }
    return respond(url, init);
  };
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", ...headers}});

test("workerd: a healthy upstream is proxied (no API_UNAVAILABLE from an invalid fetch option)", async () => {
  const res = await handleAPI(new Request("https://braspace-moonproof.example.workers.dev/api/health"),
    workerdFetch(() => json(200, {status: "ok", data_source: "postgres"})));
  assert.equal(res.status, 200, "proxy must not fail before reaching the upstream");
  assert.equal((await res.json()).data_source, "postgres");
});

test("workerd: upstream redirects stay blocked with redirect manual (3xx -> 502, never followed)", async () => {
  let calls = 0;
  const res = await handleAPI(new Request("https://braspace-moonproof.example.workers.dev/api/sites"),
    workerdFetch((url, init) => { calls++; assert.equal(init.redirect, "manual"); return new Response(null, {status: 302, headers: {location: "https://evil.example/"}}); }));
  assert.equal(calls, 1, "exactly one upstream request: the redirect is not followed");
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, "INVALID_UPSTREAM_RESPONSE");
});

test("workerd: POST is proxied too", async () => {
  const res = await handleAPI(new Request("https://braspace-moonproof.example.workers.dev/api/compare",
    {method: "POST", headers: {"content-type": "application/json"}, body: "{}"}),
    workerdFetch(() => json(422, {code: "INVALID_REQUEST", error: "x"})));
  assert.equal(res.status, 422, "Go status passes through unchanged");
});
