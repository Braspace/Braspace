// gzip for NASA-derived binary grids served as assets (Cloudflare leaves application/octet-stream uncompressed).
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compressDataAsset, wantsGzip, COMPRESSIBLE_DATA} from "./moonproof-assets.mjs";
import worker from "./moonproof-worker.mjs";

const req = (path, ae = "gzip, deflate, br") => new Request("https://w.example" + path, {headers: ae == null ? {} : {"accept-encoding": ae}});
const asset = (status = 200, headers = {"content-type": "application/octet-stream", "content-length": "4", "cache-control": "public, max-age=86400"}) => new Response(status === 200 ? new Uint8Array([1, 2, 3, 4]) : null, {status, headers});

test("Accept-Encoding parsing: gzip, *, q=0 refused", () => {
  assert.ok(wantsGzip(req("/", "gzip")));
  assert.ok(wantsGzip(req("/", "br, gzip;q=0.5")));
  assert.ok(wantsGzip(req("/", "*")));
  assert.ok(!wantsGzip(req("/", "gzip;q=0")));
  assert.ok(!wantsGzip(req("/", "br")));
  assert.ok(!wantsGzip(req("/", null)));
});

test("/data/*.bin is gzip-encoded by the runtime: header set, length dropped, Vary, bytes untouched", async () => {
  const r = compressDataAsset(req("/data/region/pgda_sun_400m.bin"), asset());
  assert.equal(r.headers.get("content-encoding"), "gzip");
  assert.equal(r.headers.get("content-length"), null);
  assert.match(r.headers.get("vary"), /Accept-Encoding/);
  assert.equal(r.headers.get("cache-control"), "public, max-age=86400");
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3, 4]);
});

test("everything else is passed through unchanged", () => {
  for (const [path, a, res] of [["/data/sites.json", "gzip", asset()], ["/moonproof/", "gzip", asset()],
      ["/data/region/x.bin", "br", asset()], ["/data/region/x.bin", "gzip", asset(404)],
      ["/data/region/x.bin", "gzip", asset(200, {"content-encoding": "br"})], ["/data/../x.bin", "gzip", asset()]]) {
    assert.equal(compressDataAsset(req(path, a), res), res, path + " " + a);
  }
  assert.ok(COMPRESSIBLE_DATA.test("/data/sites/mons-mouton-im2.bin"));
});

test("the Worker routes /data/* through itself and still answers assets from ASSETS", async () => {
  assert.match(readFileSync(new URL("./wrangler.toml.example", import.meta.url), "utf8"), /run_worker_first = \[[^\]]*"\/data\/\*"/);
  const env = {ASSETS: {fetch: async () => asset()}};
  const r = await worker.fetch(req("/data/region/south_pole_400m.bin"), env);
  assert.equal(r.headers.get("content-encoding"), "gzip");
  const plain = await worker.fetch(req("/moonproof/core/tokens.css"), {ASSETS: {fetch: async () => new Response("x", {headers: {"content-type": "text/css"}})}});
  assert.equal(plain.headers.get("content-encoding"), null);
});

test("the versioned wrangler.toml (used by every deploy) keeps /data/* through the Worker", () => {
  const live = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(live, /run_worker_first = \[[^\]]*"\/data\/\*"/);
  assert.match(live, /^main = "moonproof-worker\.mjs"$/m);
  assert.match(live, /^compatibility_date = "2026-11-01"$/m);
});
