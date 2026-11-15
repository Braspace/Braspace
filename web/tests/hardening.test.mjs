import {test, after} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "../dev-server.mjs";

// Browser-facing tests do not require a running Go API, NASA assets or network.
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
after(() => new Promise((resolve) => server.close(resolve)));

test("static assets are guarded by CSP, MIME and no-store", async () => {
  for (const [pathname, mime] of [
    ["/", "text/html"],
    ["/moonproof/screens/entry.js", "text/javascript"],
    ["/lab/physics.js", "text/javascript"],
    ["/moonproof/core/tokens.css", "text/css"]
  ]) {
    const response = await fetch(base + pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type"), new RegExp(mime));
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  }
});

test("HEAD shares content length with GET without returning a body", async () => {
  const get = await fetch(base + "/moonproof/screens/entry.js");
  const head = await fetch(base + "/moonproof/screens/entry.js", {method: "HEAD"});
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), get.headers.get("content-length"));
  assert.equal((await head.text()).length, 0);
});

test("deny unknown files and all static writes", async () => {
  for (const pathname of ["/.env", "/.git/config", "/package.json", "/api/private-secret", "/__debug"]) {
    // /api/private-secret is deliberately excluded below; API routes belong to Go.
    if (pathname.startsWith("/api/")) continue;
    const response = await fetch(base + pathname);
    assert.equal(response.status, 404, pathname);
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await fetch(base + "/", {method});
    assert.equal(response.status, 405, method);
  }
});

test("proxy blocks dangerous methods before forwarding upstream", async () => {
  for (const pathname of ["/api/sites", "/api/onboard/evaluate", "/api/onboard/report"]) {
    const response = await fetch(base + pathname, {method: "PUT"});
    assert.equal(response.status, 405, pathname);
  }
});

test("printable report CSP is scoped; regular UI cannot use inline scripts", async () => {
  const ui = await fetch(base + "/");
  const uiCsp = ui.headers.get("content-security-policy");
  assert.doesNotMatch(uiCsp, /script-src 'unsafe-inline'/);
  assert.match(uiCsp, /object-src 'none'/);
  const report = await fetch(base + "/api/onboard/report", {method: "PUT"});
  assert.equal(report.status, 405);
  assert.match(report.headers.get("content-security-policy"), /style-src 'unsafe-inline'/);
  assert.match(report.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});
