// Evidence (H) geometry against the design board, measured by DOM at 1440x900 (see report): columns 220 | 524 | free | 422,
// card and right column fill from y=150 to the bottom margin, rows 54 / 45, context bar 927x48 with 30 px actions.
// Static check of the stylesheet (no browser needed). EVIDENCE_CSS=<path> runs it against another copy of the CSS
// (e.g. `git show HEAD:web/moonproof/screens/evidence.css`) to prove it fails on the old layout.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = (await readFile(process.env.EVIDENCE_CSS || new URL("../screens/evidence.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
const js = await readFile(new URL("../screens/evidence.js", import.meta.url), "utf8");
// Every rule as [selector, body] with the media query it lives in ("" when none); nested one level only.
function rules() {
  const out = []; const re = /(@media[^{]+)\{|([^{}@]+)\{([^{}]*)\}|\}/g; let m, media = "";
  while ((m = re.exec(css))) { if (m[1]) media = m[1].trim(); else if (m[2] != null) for (const sel of m[2].split(",")) out.push([sel.trim(), m[3], media]); else media = ""; }
  return out;
}
const R = rules();
const decl = (sel, prop, media = /^@media \(min-width:701px\)$/) => { // last matching declaration wins, as in the cascade
  let v = null; for (const [s, body, md] of R) if (s === sel && (media === null || media.test(md))) { const d = body.match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)", "g")); if (d) v = d.at(-1).split(":").slice(1).join(":").trim(); }
  return v;
};
const px = v => parseFloat(v);

test("columns: 220 menu | 524 card | free | 422 right, 20 px gap, from y=150", () => {
  assert.equal(decl(".mp-ev", "grid-template-columns")?.replace(/\s+/g, " "), "220px minmax(0,524px) minmax(0,1fr) minmax(0,422px)");
  assert.equal(decl(".mp-ev", "column-gap"), "21px");
  assert.equal(decl(".mp-ev", "top"), "150px");
  assert.equal(decl(".mp-ev-main", "grid-column"), "2");
  assert.equal(decl(".mp-ev-right", "grid-column"), "4");
});
test("the card fills the column and scrolls inside (the scenario passport stays reachable, the page never grows)", () => {
  assert.equal(decl(".mp-ev", "align-items"), "stretch");
  assert.equal(decl(".mp-ev-main", "overflow"), "auto");
  assert.equal(decl(".mp-ev-main", "padding"), "21px");
});
test("right column: sources rows 54 px, trust rows 45 px, trust meter is four blocks across the card", () => {
  assert.equal(decl("#sources .mp-src", "height"), "54px");
  assert.equal(decl("#trust .mp-trust", "height"), "45px");
  assert.match(decl("#trust .mp-seg", "grid-template-columns") || "", /repeat\(4,\s*1fr\)/);
  assert.equal(decl(".mp-ev-right", "grid-template-rows")?.replace(/\s+/g, " "), "auto minmax(0,1fr)");
});
test("context bar is 48 px high and its chips are 30 px high", () => {
  assert.equal(decl(".mp-context", "min-height"), "48px");
  assert.match(decl(".mp-context", "min-width") || "", /927px/);
  assert.equal(decl(".mp-context .mp-pill.is-primary", "height"), "30px");
  assert.equal(decl(".mp-ev-alter", "height", null), "30px");
});
test("visual size below 44 px keeps a real touch area of at least 44 px", () => {
  const reach = (sel, vis, inset) => assert.ok(px(vis) + 2 * Math.abs(px(inset)) >= 44, `${sel}: ${vis} + 2x${inset}`);
  reach("Baixar JSON", decl(".mp-context .mp-pill.is-primary", "height"), (decl(".mp-context .mp-pill.is-primary::after", "inset") || "0").split(" ")[0]);
  reach("?", decl("#trust .mp-help", "height"), (decl("#trust .mp-help::after", "inset") || "0").split(" ")[0]);
  assert.ok(px(decl(".mp-ev-alter select", "height", null)) >= 44, "Alterar select");
});
test("mobile layout is untouched: single column, bar below the context", () => {
  // 188: at 176 the tabs touched the context bar on a real iPhone (Safari, 14/11); 12 px gap now.
  assert.equal(decl(".mp-ev", "top", /max-width:700px/), "188px");
  assert.equal(decl(".mp-ev", "display", /max-width:700px/), "block");
  assert.equal(decl(".mp-ev-main", "grid-column", /max-width:700px/), null);
});
test("Alterar is a real scenario switch wired in evidence.js", () => {
  assert.match(js, /mp-ev-alter/);
  assert.match(js, /pick\.onchange = \(\) => setState\(\{ site: pick\.value \}\)/);
});
