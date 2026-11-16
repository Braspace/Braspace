import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cockpitEntryURL, openCockpit } from "../screens/cockpit-entry.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("canonical MoonProof entry uses the same-origin cockpit adapter, not three-mode cards", async () => {
  const html = await read("../index.html");
  assert.match(html, /<script type="module" src="screens\/cockpit-entry\.js"><\/script>/);
  assert.match(html, /id="cockpit-entry" href="\.\/cockpit\.html"/);
  assert.match(html, /href="\.\/tasks\.html"/);
  assert.match(html, /href="core\/tokens\.css"/);
  assert.match(html, /href="screens\/cockpit-entry\.css"/);
  assert.match(html, /class="mp-cockpit-entry"/);
  assert.doesNotMatch(html, /id="cards"|screens\/entry\.js|http-equiv="refresh"/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/i, "CSP: no inline JS");
  assert.doesNotMatch(html, /<[^>]+style=/i, "CSP: no inline styles");
});
test("no-JavaScript fallback remains accessible and links to Cockpit and archived tools", async () => {
  const html = await read("../index.html");
  assert.match(html, /MoonProof · Cockpit/);
  assert.match(html, /<a[^>]*id="cockpit-entry"[^>]*>Abrir cockpit/);
  assert.match(html, /Explorar, Aula e Planejar/);
});
test("three existing task flows are retained at the auxiliary tasks.html URL", async () => {
  const tasks = await read("../tasks.html");
  const taskSource = await read("../screens/entry.tsx");
  assert.match(tasks, /<script type="module" src="screens\/entry\.js"><\/script>/);
  assert.match(tasks, /id="cards"/);
  assert.match(tasks, /moon-hd\/backdrop\.js/);
  assert.match(taskSource, /explore: "explore\.html", class: "activity\.html", plan: "plan\.html"/);
});

test("entry preserves exact encoded scenario and fragment for slash, index and slashless variants", () => {
  const query = "?site=malapert-massif&lang=pt-BR&start=2026-12-01T00%3A00%3A00Z&hours=336&task=plan&layer=proof&battery=30";
  for (const entry of ["/moonproof/", "/moonproof/index.html", "/moonproof"]) {
    assert.equal(cockpitEntryURL("https://moon.test" + entry + query + "#scene"),
      "https://moon.test/moonproof/cockpit.html" + query + "#scene");
  }
  assert.equal(cockpitEntryURL("https://moon.test/demo/moonproof/?redirect=https://evil.test"),
    "https://moon.test/demo/moonproof/cockpit.html?redirect=https://evil.test");
});

test("entry adjusts no more than one history item and maintains accessible fallback", () => {
  const calls = [], fallback = { href: "" };
  const location = { href: "https://moon.test/moonproof/?lang=en&site=nobile-rim-1", replace: url => calls.push(url) };
  openCockpit(location, fallback);
  assert.deepEqual(calls, ["https://moon.test/moonproof/cockpit.html?lang=en&site=nobile-rim-1"]);
  assert.equal(fallback.href, calls[0]);
});

test("no-JS fallback is dark, compact, responsive, keyboard-visible and uses design tokens", async () => {
  const css = await read("../screens/cockpit-entry.css");
  assert.match(css,/var\(--glass\)/);
  assert.match(css,/var\(--jade\)/);
  assert.match(css,/min-height:var\(--touch\)/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
