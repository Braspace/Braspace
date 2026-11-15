// Production (Worker) serves web/ as-is: /config.js and /favicon.ico must be real files, and the local
// preview must not mask their absence (it used to answer 204 / a synthetic config.js).
import test, {after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createServer} from "../dev-server.mjs";
import {parseConfigCommit} from "../moonproof/screens/evidence-model.js";

const server = createServer();
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
after(() => new Promise(r => server.close(r)));

test("config.js is a real same-origin file the smoke script can read; no stale commit pinned", async () => {
  const r = await fetch(origin + "/config.js");
  assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /text\/javascript/);
  const body = await r.text();
  assert.equal(body, readFileSync(new URL("../config.js", import.meta.url), "utf8"));
  // scripts/smoke-publico.sh: sed -n 's/.*const API = "\([^"]*\)".*/\1/p'
  assert.equal(/const API = "([^"]*)"/.exec(body)?.[1], "https://braspace-moonproof.almeida-me.workers.dev");
  assert.equal(parseConfigCommit(body), null, "a committed BRASPACE_COMMIT would go stale; deploy writes it");
});

test("favicon.ico is a real icon (no 404 in the console of any page)", async () => {
  const r = await fetch(origin + "/favicon.ico");
  assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/x-icon");
  const b = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...b.subarray(0, 4)], [0, 0, 1, 0]); // ICO header
  assert.match(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /<link rel="icon" href="favicon.ico">/);
});
