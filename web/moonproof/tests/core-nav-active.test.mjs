// BR91: every page of web/moonproof/*.html marks as current ONLY the pill of its own screen
// (BR86: "Landing Lab" looked active on Mission because no pill was current and .is-sim had a fill).
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// Minimal DOM, enough for mountShell (no jsdom dependency).
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.style = { setProperty() {} }; this.dataset = {}; this.className = ""; this.hidden = false; this._text = ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  append(...n) { for (const c of n) this.children.push(typeof c === "string" ? { text: c } : c); }
  prepend(...n) { this.children.unshift(...n); } replaceChildren(...n) { this.children = []; this.append(...n); }
  addEventListener() {} set innerHTML(v) { this.children = []; } set textContent(v) { this.children = [{ text: String(v) }]; }
  get textContent() { return this.children.map(c => c.text ?? c.textContent ?? "").join(""); }
  all() { return this.children.flatMap(c => c instanceof El ? [c, ...c.all()] : []); }
}
const body = new El("body");
globalThis.document = { body, documentElement: new El("html"), createElement: t => new El(t),
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
globalThis.location = { search: "", hash: "" };

const { mountShell, SCREENS, currentNav } = await import("../core/shell.js");
const dir = new URL("../", import.meta.url);
const pages = (await readdir(dir)).filter(f => f.endsWith(".html"));

async function screenOf(page) {
  const html = await readFile(new URL(page, dir), "utf8");
  const src = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  if (!src) return null;
  const js = await readFile(new URL(src, dir), "utf8");
  return js.match(/mountShell\(\{\s*screen:\s*"([a-z-]+)"/)?.[1] ?? null;
}

test("there are moonproof pages to check", () => assert.ok(pages.includes("mission.html")));

for (const page of pages) test(`${page}: only its own pill is current`, async () => {
  const screen = await screenOf(page);
  if (screen == null) return; // page without the shell (index.html = task entry)
  body.replaceChildren();
  mountShell({ screen });
  const [top, , bottom] = body.children;
  const cur = top.all().filter(e => e.getAttribute("aria-current") === "page");
  assert.equal(cur.length, 1, `${page} (screen "${screen}") must have exactly one current top pill, has ${cur.length}`);
  const own = SCREENS.find(s => s.id === currentNav(screen));
  assert.ok(own, `${page}: screen "${screen}" has no nav pill`);
  assert.equal(cur[0].getAttribute("href")?.split("?")[0] ?? cur[0].href?.split("?")[0], own.page);
  // The page's own pill is the one for its file. Sub-views keep their parent's pill: mission.html is A (overview of
  // Explore), plan.html / activity.html are the v3 kits (views of Compare).
  const VIEW_OF = { "mission.html": "explore.html", "plan.html": "compare.html", "activity.html": "compare.html", "rules.html": "evidence.html" };
  assert.equal(own.page, VIEW_OF[page] ?? page, `${page} highlights ${own.page}`);
  const bcur = bottom.all().filter(e => e.getAttribute("aria-current") === "page");
  assert.ok(bcur.length <= 1, "bottom nav: at most one current");
  if (!own.sim) assert.equal(bcur.length, 1, "bottom nav marks the same screen");
});

test("Landing Lab pill has no fill unless current", async () => {
  const css = await readFile(new URL("core/components.css", dir), "utf8");
  const rule = css.match(/\.mp-pill\.is-sim\{([^}]*)\}/)?.[1] ?? "";
  assert.ok(rule, ".mp-pill.is-sim rule exists");
  assert.doesNotMatch(rule, /background/, ".is-sim must be outline only");
});
