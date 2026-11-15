// Mobile layout regression (15/11): on ≤900 px the activity and plan layouts switched from
// `position: fixed; z-index: 15` to `position: static`. Static drops z-index, so the fixed #terrain
// canvas painted over the permission/rule labels (elementFromPoint returned the canvas); and a bare
// `1fr` track grew to the content's min width (504 px panels at 320-390 px viewports).
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../screens");
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");
// Top-level rules and the body of every `@media (max-width: 900px)` block.
function mobileBlocks(css) {
  const out = []; const re = /@media\s*\(max-width:\s*900px\)\s*\{/g; let m;
  while ((m = re.exec(css))) { let depth = 1, i = re.lastIndex; while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; } out.push(css.slice(re.lastIndex, i - 1)); }
  return out;
}
const rule = (css, sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(css); return m ? m[1] : null; };

const overlays = [];
for (const f of readdirSync(dir).filter(f => f.endsWith(".css"))) {
  const css = strip(readFileSync(path.join(dir, f), "utf-8"));
  for (const m of css.matchAll(/(\.mp-[a-z-]+-layout)\s*\{([^}]*)\}/g)) {
    if (/position:\s*fixed/.test(m[2]) && /z-index:\s*\d+/.test(m[2])) overlays.push({f, sel: m[1], css});
  }
}

test("found the fixed screen layouts that sit above the terrain", () => {
  const names = overlays.map(o => o.f + " " + o.sel);
  assert.ok(names.includes("activity.css .mp-act-layout"), names.join(", "));
  assert.ok(names.includes("plan.css .mp-plan-layout"), names.join(", "));
});

for (const o of overlays) {
  test(`${o.f} ${o.sel}: mobile layout keeps its stacking context and cannot overflow`, () => {
    for (const block of mobileBlocks(o.css)) {
      const body = rule(block, o.sel); if (!body) continue;
      assert.doesNotMatch(body, /position:\s*static/, "static drops z-index: the fixed #terrain would cover the panels");
      if (/position:\s*relative/.test(body)) assert.match(body, /inset:\s*auto/, "relative must reset the desktop inset offsets");
      const cols = /grid-template-columns:\s*([^;]+);/.exec(body);
      if (cols) assert.doesNotMatch(cols[1].trim(), /^1fr$/, "a bare 1fr track grows to its content's min width");
    }
  });
}
