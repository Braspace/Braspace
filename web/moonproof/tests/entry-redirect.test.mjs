import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("canonical entry is a tiny route adapter, not the retired persona UI", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<script type="module" src="screens\/entry\.js"><\/script>/);
  assert.match(html, /<a id="cockpit-entry" href="\.\/cockpit\.html">/);
  assert.doesNotMatch(html, /mp-entry-cards|backdrop\.js|id="terrain"/);
  assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*[^<]+|http-equiv="refresh"/i);
});

test("both canonical URLs preserve scenario, locale, encoding and fragment", async () => {
  const { cockpitEntryURL } = await import("../screens/entry.js");
  const query = "?site=malapert-massif&lang=pt-BR&start=2026-12-01T00%3A00%3A00Z&hours=336&task=plan&layer=proof&battery=30";
  for (const entry of ["/moonproof/", "/moonproof/index.html", "/moonproof"]) {
    const url = cockpitEntryURL("https://moon.test" + entry + query + "#scene");
    assert.equal(url, "https://moon.test/moonproof/cockpit.html" + query + "#scene");
  }
  assert.equal(cockpitEntryURL("https://moon.test/moonproof/"), "https://moon.test/moonproof/cockpit.html");
  assert.equal(cockpitEntryURL("https://moon.test/demo/moonproof/?redirect=https://evil.test"), "https://moon.test/demo/moonproof/cockpit.html?redirect=https://evil.test");
});

test("entry updates fallback link and replaces history exactly once", async () => {
  const { openCockpit } = await import("../screens/entry.js");
  const calls = [], anchor = { href: "" };
  const location = { href: "https://moon.test/moonproof/?lang=en&site=nobile-rim-1", replace: target => calls.push(target) };
  openCockpit(location, anchor);
  assert.deepEqual(calls, ["https://moon.test/moonproof/cockpit.html?lang=en&site=nobile-rim-1"]);
  assert.equal(anchor.href, calls[0]);
});
