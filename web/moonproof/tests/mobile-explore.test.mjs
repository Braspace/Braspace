// M1 · Explorar no celular (390x844): static checks of the mobile CSS block and the designer spec. No browser.
// Rendered checks (scrollWidth, touch targets, screenshot) are done by hand with Playwright, see the task report.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");
const css = await read("screens/explore.css");
const mds = await read("designer/M1-mobile-explorar.designer.mds");

// Minimal CSS reader: returns the rules found inside every `@media (max-width:700px)` block.
function mobileRules(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const re = /@media\s*\(max-width:\s*700px\)\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    let i = re.lastIndex, depth = 1, start = i;
    while (i < s.length && depth) { if (s[i] === "{") depth++; else if (s[i] === "}") depth--; i++; }
    const body = s.slice(start, i - 1);
    for (const r of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decl = {};
      for (const d of r[2].split(";")) { const k = d.indexOf(":"); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
      rules.push({ sel: r[1].trim().replace(/\s+/g, " "), decl });
    }
  }
  return rules;
}
const rules = mobileRules(css);
const px = v => (v && /^-?\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : null);
const find = sel => rules.filter(r => r.sel.split(",").map(x => x.trim()).includes(sel));
const prop = (sel, p) => find(sel).map(r => r.decl[p]).filter(Boolean).at(-1);

test("mobile block: breakpoint 700 px exists and the 390 px target is documented", () => {
  assert.ok(/@media\s*\(max-width:\s*700px\)/.test(css), "no @media (max-width:700px)");
  assert.ok(rules.length >= 15, `expected a real mobile block, got ${rules.length} rules`);
  assert.match(css, /390/, "explore.css should name the 390 px design width");
  // the old desktop/tablet breakpoints are untouched
  assert.match(css, /@media \(max-width:1180px\)/);
  assert.match(css, /@media \(min-width:701px\)/);
});

test("mobile block: touch targets are at least 44 px", () => {
  const need = [".ex-chips .mp-pill", ".ex-sheet .mc-handle", "#sheet-body .mp-chip", "#sheet-body #card-horizon .ex-actions .mp-pill"];
  for (const sel of need) { const v = px(prop(sel, "min-height")); assert.ok(v !== null && v >= 44, `${sel} min-height=${v}`); }
  assert.ok(px(prop(".ex-chips .mp-pill", "min-width")) >= 44);
  assert.ok(px(prop("#sheet-body .mp-chip", "min-width")) >= 44);
  // no interactive rule in the block may shrink below 44 px
  for (const r of rules) if (/pill|chip|handle|button|marker|\ba\b/.test(r.sel)) for (const k of ["min-height", "height"]) {
    const v = px(r.decl[k]); if (v !== null && v < 44) assert.fail(`${r.sel} { ${k}:${r.decl[k]} } is below 44 px`);
  }
  // selected marker only grows (48) and keeps its centre (margin = -24)
  assert.equal(px(prop('.mp-marker[aria-pressed="true"]', "width")), 48);
  assert.equal(px(prop('.mp-marker[aria-pressed="true"]', "height")), 48);
});

test("mobile block: nothing can widen the page past 390 px", () => {
  for (const r of rules) {
    for (const k of ["width", "min-width"]) { const v = px(r.decl[k]); if (v !== null) assert.ok(v <= 390, `${r.sel} { ${k}:${r.decl[k]} } > 390`); }
    for (const [k, v] of Object.entries(r.decl)) if (/^(width|min-width)$/.test(k) && /\d+vw/.test(v)) assert.ok(parseFloat(v) <= 100, `${r.sel} ${k}:${v}`);
    // fixed boxes are anchored by both sides, with a non-negative gutter
    if (r.decl.position === "fixed") { assert.ok(r.decl.left !== undefined && r.decl.right !== undefined, `${r.sel} fixed without left+right`); for (const k of ["left", "right"]) assert.ok(px(r.decl[k]) >= 0, `${r.sel} ${k}`); }
  }
  // the only sideways scroller is the layer strip, contained by its own box
  assert.equal(prop(".ex-chips", "overflow-x"), "auto");
  assert.match(prop(".ex-chips", "max-width") || "", /calc\(100vw - 24px\)/);
  assert.equal(prop(".ex-chips", "box-sizing"), "border-box");
  // sheet: two-sided gutter, 12 px above the 66 px bottom nav (nav top = 844 - 12 - 66), top stays below half the screen
  assert.equal(px(prop(".ex-sheet", "left")), 12); assert.equal(px(prop(".ex-sheet", "right")), 12);
  assert.ok(px(prop(".ex-sheet", "bottom")) >= 78, "sheet must clear the bottom nav");
  const h = parseFloat(prop(".ex-sheet", "height")); assert.ok(h > 0 && h <= 39, `sheet height ${h}vh keeps core/terrain.js counting it as a bottom overlay`);
  // the long CTA of the context bar is hidden on phones (the sheet carries "Comparar")
  assert.equal(prop(".mp-context .mp-pill", "display"), "none");
});

test("mobile block: the three numbers become tiles and use real data, never fixed numbers", () => {
  assert.equal(prop("#m-card-site .ex-rows tbody", "grid-template-columns"), "repeat(3,minmax(0,1fr))");
  assert.equal(prop("#m-card-site .ex-rows tr", "flex-direction"), "column-reverse");
  assert.ok(!/content:\s*["'][^"']*\d/.test(css), "CSS must not inject numbers through content:");
  for (const n of ["SR-0", "71%", "46 h", "+14 h", "1.832", "a41c9e2", "Bateria H1"]) assert.ok(!css.includes(n), `explore.css contains "${n}"`);
});

const REGIONS = [
  ["fundo de relevo", /Fundo de relevo/],
  ["cabeçalho", /Cabeçalho/],
  ["pílulas de camada", /Pílulas de camada/],
  ["marcadores numerados", /Marcadores numerados/],
  ["rótulo do sítio selecionado", /Rótulo do sítio selecionado/],
  ["alça da folha", /Folha: alça/],
  ["ficha do sítio", /Folha: número do sítio/],
  ["trio de números", /Trio Sol \/ Terra \/ maior noite/],
  ["pílula de bateria", /Bateria H1/],
  ["botões Comparar e Pouso", /Botões "Comparar"/],
  ["barra de navegação inferior", /Barra de navegação inferior/],
];
test("designer spec: exists, names 390x844 and cites every region of the design", () => {
  assert.ok(mds.length > 2000);
  assert.match(mds, /390×844/);
  assert.match(mds, /Mobile\.dc\.html/);
  for (const [name, re] of REGIONS) assert.ok(re.test(mds), `designer spec does not cite: ${name}`);
  for (const h of ["Pergunta que a tela responde", "Layout", "Componentes e tokens", "Estados", "ilustrativo", "Interações"]) assert.ok(mds.includes(h), `missing section: ${h}`);
});
test("designer spec: states the integrity rules (no VAL, N/D for missing, tokens)", () => {
  assert.match(mds, /`VAL` não aparece/);
  assert.match(mds, /`N\/D`/);
  for (const tk of ["Manrope", "Jade", "44 px", "vidro"]) assert.ok(mds.includes(tk), `spec should mention ${tk}`);
  assert.match(mds, /Pedidos fora do arquivo de CSS/);
});
