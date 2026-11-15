// No-WebGL poster of Joel's Moon HD: picks a real GPU capture per viewport and is served same-origin.
import test, {after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pickPoster, POSTERS, CREDIT} from "../moon-hd/poster-fallback.js";
import {createServer} from "../dev-server.mjs";

const server = createServer();
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
after(() => new Promise(r => server.close(r)));

test("viewport picks the matching GPU capture", () => {
  assert.equal(pickPoster(1920, 1080), "desktop");
  assert.equal(pickPoster(1440, 900), "desktop");
  assert.equal(pickPoster(1280, 800), "tablet");
  assert.equal(pickPoster(768, 1024), "portrait");
  assert.equal(pickPoster(390, 844), "portrait");
  assert.equal(pickPoster(0, 0), "preview");
  assert.equal(pickPoster(NaN, 800), "preview");
});

test("every poster is a published capture listed in the render manifest", () => {
  const m = JSON.parse(readFileSync(new URL("../moon-hd/renders/manifest.json", import.meta.url), "utf8"));
  for (const k of ["desktop", "tablet", "portrait"]) assert.equal(m.variants[k].file, "web/moon-hd/" + POSTERS[k]);
  assert.equal(POSTERS.preview, "pole-preview.webp");
  for (const lang of ["pt", "en"]) { assert.match(CREDIT[lang], /LOLA/); assert.match(CREDIT[lang], /Joel/); }
});

test("posters are served same-origin as WebP; nothing else under renders/", async () => {
  for (const f of ["desktop", "tablet", "portrait"]) {
    const r = await fetch(origin + "/moon-hd/renders/pole-gpu-" + f + ".webp");
    assert.equal(r.status, 200, f); assert.equal(r.headers.get("content-type"), "image/webp");
    assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  }
  for (const p of ["/moon-hd/renders/manifest.json", "/moon-hd/renders/x.webp", "/moon-hd/renders/pole-gpu-desktop.png"])
    assert.equal((await fetch(origin + p)).status, 404, p);
});

test("no inline style attribute or script: CSSOM only (CSP style-src 'self')", () => {
  const src = readFileSync(new URL("../moon-hd/poster-fallback.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /setAttribute\("style"|innerHTML|cssText/);
  assert.match(src, /aria-hidden/);
});
