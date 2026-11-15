// B · Explorar desktop geometry. Values are the Heloisa board measured by DOM at 1440x900 (Explorer.dc.html),
// compared with scratchpad audit-geom.mjs (mean IoU 0.40 -> 0.85). Static checks of explore.css / explore.js, no browser.
// EXPLORE_CSS=<file> points the test at another copy of the stylesheet (used to prove it fails on the old values).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = f => readFile(f.startsWith("/") ? f : new URL("../" + f, import.meta.url), "utf8");
const css = (await read(process.env.EXPLORE_CSS || "screens/explore.css")).replace(/\/\*[\s\S]*?\*\//g, "");
const js = await read("screens/explore.tsx");

// All `selector { decls }` pairs outside @media-less nesting problems: nested @media bodies are flattened (breakpoints are checked by name below).
const rules = [];
for (const r of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
  const decl = {};
  for (const d of r[2].split(/;(?![^(]*\))/)) { const k = d.indexOf(":"); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/!important$/, "").trim(); }
  for (const sel of r[1].split(",")) rules.push({ sel: sel.trim().replace(/\s+/g, " "), decl });
}
const prop = (sel, p) => rules.filter(r => r.sel === sel && p in r.decl).map(r => r.decl[p]).at(-1);
const num = v => (v == null ? null : parseFloat(v));

test("left column: no container box, tabs 30 px high, rows 46 px pills with 8 px pitch", () => {
  assert.equal(prop(".ex-left", "background"), "none");
  assert.equal(prop(".ex-left", "border"), "0");
  assert.equal(num(prop(".ex-left", "gap")), 13);
  assert.equal(num(prop(".ex-tabs .mp-pill", "height")), 30);
  assert.equal(num(prop(".ex-tabs", "gap")), 5);
  assert.equal(num(prop(".ex-radio", "min-height")), 46);
  assert.equal(prop(".ex-radio", "border-radius"), "999px");
  assert.equal(num(prop(".ex-list", "gap")), 8);
  assert.equal(num(prop(".ex-swatch", "width")), 40);
  assert.equal(num(prop(".ex-swatch", "height")), 10);
  assert.equal(prop(".ex-legend", "border-radius"), undefined, "legend keeps the card radius (26 px)");
});

test("tabs draw 30 px but the touch area stays >= 44 px (::after, like .mp-chip)", () => {
  const inset = prop(".ex-tabs .mp-pill::after", "inset");
  assert.ok(inset, "no ::after touch area on the tabs");
  const [vy] = inset.split(/\s+/).map(num);
  assert.ok(vy < 0, "inset must be negative");
  // padding box = 30 - 2 (border); each side grows by |inset|
  assert.ok(30 - 2 + 2 * Math.abs(vy) >= 44, `touch height ${30 - 2 + 2 * Math.abs(vy)} < 44`);
});

test("1301+ px: columns at y=150, right column 352 px, ends 6 px above the bottom bar", () => {
  assert.match(css, /@media \(min-width:1301px\)\{\.ex-left,\.ex-right\{top:150px\}\.ex-left\{width:300px\}\.ex-right\{width:352px\}\}/);
  assert.match(css, /@media \(min-width:1301px\)\{\.ex-right\{bottom:84px\}\}/);
  assert.equal(num(prop(".ex-right", "gap")), 5);
  assert.equal(num(prop(".ex-right #card-site", "padding")), 21);
});

test("'What you see from here': chart, sentence, actions, then the 1-2-3 chips; width 348; Compare 44 / Land >= 113 wide", () => {
  assert.equal(prop(".ex-right #card-horizon", "width"), "calc(100% - 4px)");
  assert.equal(prop(".ex-right #card-horizon", "flex-direction"), "column");
  const ord = s => num(prop(s, "order"));
  assert.ok(ord("#card-horizon>section:nth-of-type(1)") < ord("#card-horizon>.mp-layer-answer"), "chart must come before the sentence");
  assert.ok(ord("#card-horizon>.mp-layer-answer") < ord("#card-horizon>.ex-actions"));
  assert.ok(ord("#card-horizon>.ex-actions") < ord("#card-horizon>.mp-chips"));
  assert.equal(num(prop("#card-horizon .ex-actions .is-sim", "min-width")), 113);
  assert.equal(num(prop("#card-horizon .ex-actions .is-primary", "min-height")), 44);
  assert.equal(prop("#card-horizon .ex-horizon", "border-radius"), "16px");
  // the "Why" section title is hidden visually, not removed
  assert.equal(prop("#card-horizon>section h4", "clip"), "rect(0 0 0 0)");
  assert.match(js, /const DESK_HORIZON(: \[number, number\])? = \[310, 70\]/, "desktop chart is a 310 x 88 strip");
});

test("bottom bar: one row [scale 152, prev, next, site 173, zoom -, zoom +, coordinates 172], bottom 28 px, tap hint 14 px above", () => {
  assert.equal(num(prop(".mc-dock", "bottom")), 28);
  assert.equal(num(prop(".mc-dock", "gap")), 13);
  assert.equal(num(prop(".ex-scalebar", "width")), 152);
  assert.equal(num(prop(".ex-scalebar", "min-height")), 50);
  assert.equal(num(prop(".ex-sel", "width")), 173);
  assert.equal(num(prop(".ex-sel", "min-height")), 48);
  assert.equal(num(prop(".ex-coord", "width")), 172);
  assert.equal(num(prop(".ex-coord", "min-height")), 50);
  assert.equal(prop(".ex-dock-row .ex-round", "width"), "var(--touch)", "round buttons stay 44 px");
  assert.equal(num(prop(".mc-dock .mc-hint", "min-height")), 36);
  assert.doesNotMatch(css, /ex-readout/, "the second dock row is gone");
  // JS: scale first, then prev/next/select/zoom, coordinates last; the coordinate pill is also the typing field
  const row = js.slice(js.indexOf("function dock("), js.indexOf("function chips()"));
  assert.ok(row.indexOf("ex-scalebar") < row.indexOf('"‹"') && row.indexOf('"‹"') < row.indexOf('"›"') && row.indexOf('"›"') < row.indexOf("<select") && row.indexOf("<select") < row.indexOf('"−"') && row.indexOf('"−"') < row.indexOf('"+"') && row.indexOf('"+"') < row.indexOf("<form"));
  assert.match(row, /<form class="ex-coord"/);
  assert.match(row, /enterkeyhint/);
});
