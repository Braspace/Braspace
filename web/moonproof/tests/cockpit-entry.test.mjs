import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cockpitEntryURL, openCockpit } from "../screens/cockpit-entry.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("canonical MoonProof entry opens cockpit with accessible no-JS fallback", async () => {
  const html = await read("../index.html");
  assert.match(html, /<script type="module" src="screens\\/cockpit-entry\\.js"><\\/script>/);
  assert.match(html, /id="cockpit-entry" href="cockpit\\.html"/);
  assert.match(html, /href="tasks\\.html"/);
  assert.match(html, /<h1>MoonProof · Cockpit<\\/h1>/);
  assert.match(html, /screens\\/entry\\.css/);
  assert.doesNotMatch(html, /screens\\/entry\\.js|http-equiv="refresh"/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/i, "fallback must not use inline JS");
  assert.doesNotMatch(html, /<[^>]+style=/i, "fallback must not use inline styles");
});

test("three functional fallback cards and entry tutorial remain at tasks.html", async () => {
  const html = await read("../tasks.html");
  for (const [task,page,layer,label] of [
    ["explore", "explore.html", "answer", "Explorar a Lua"],
    ["class", "activity.html", "why", "Dar uma aula"],
    ["plan", "plan.html", "proof", "Planejar uma missão"]
  ]) {
    assert.ok(html.includes(`data-task="${task}" href="${page}?task=${task}&amp;layer=${layer}"`));
    assert.ok(html.includes(label));
  }
  assert.equal((html.match(/class="mp-task"/g) || []).length, 3);
  assert.match(html, /data-moon-tour="entry"/);
  assert.match(html, /screens\\/tour\\.css/);
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
