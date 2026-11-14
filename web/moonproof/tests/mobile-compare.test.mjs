// M2 · Comparar no celular (390x844): static checks of the mobile CSS block, compare.html wiring and the designer spec. No browser.
// Rendered checks (scrollWidth, touch targets, screenshot) are done by hand with Playwright, see the task report.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");
const css = await read("screens/compare-mobile.css");
const html = await read("compare.html");
const mds = await read("designer/M2-mobile-comparar.designer.mds");

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

test("mobile block: breakpoint 700 px, 390 px documented, loaded by compare.html after scenario.css", () => {
  assert.ok(/@media\s*\(max-width:\s*700px\)/.test(css), "no @media (max-width:700px)");
  assert.ok(rules.length >= 15, `expected a real mobile block, got ${rules.length} rules`);
  assert.match(css, /390/, "the css should name the 390 px design width");
  assert.ok(html.indexOf("screens/scenario.css") > 0 && html.indexOf("screens/compare-mobile.css") > html.indexOf("screens/scenario.css"),
    "compare-mobile.css must be linked after scenario.css");
  // nothing outside the media query: the desktop layout is untouched
  assert.equal(css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*\}\s*$/, "").trim(), "", "rules found outside the 700 px media block");
});

test("mobile block: touch targets are at least 44 px", () => {
  const need = ["#verdict .mp-chip", ".mp-scn", "#right .mp-foot .mp-pill", ".mp-edit select,.mp-edit input,.mp-proof input", ".mp-edit .mp-pill"];
  for (const sel of need) {
    const r = rules.find(x => x.sel === sel || x.sel.split(",").map(y => y.trim()).includes(sel.split(",")[0].trim()) && x.sel.replace(/\s/g, "") === sel.replace(/\s/g, ""));
    assert.ok(r, `no rule for ${sel}`);
    const v = px(r.decl["min-height"]); assert.ok(v !== null && v >= 44, `${sel} min-height=${r.decl["min-height"]}`);
  }
  assert.ok(px(prop("#verdict .mp-chip", "min-width")) >= 44);
  assert.ok(px(prop("#verdict .mp-actions .mp-pill", "min-height")) >= 48, "CTA is 48 px like the design");
  // no interactive rule in the block may shrink below 44 px
  for (const r of rules) if (/pill|chip|handle|button|select|input|\.mp-scn\b|\ba\b/.test(r.sel) && !/letter|badge|name/.test(r.sel)) for (const k of ["min-height", "height"]) {
    const v = px(r.decl[k]); if (v !== null && v < 44) assert.fail(`${r.sel} { ${k}:${r.decl[k]} } is below 44 px`);
  }
});

test("mobile block: nothing can widen the page past 390 px", () => {
  for (const r of rules) {
    for (const k of ["width", "min-width"]) { const v = px(r.decl[k]); if (v !== null) assert.ok(v <= 390, `${r.sel} { ${k}:${r.decl[k]} } > 390`); }
    for (const [k, v] of Object.entries(r.decl)) if (/^(width|min-width)$/.test(k) && /\d+vw/.test(v)) assert.ok(parseFloat(v) <= 100, `${r.sel} ${k}:${v}`);
    if (r.decl.position === "fixed" && r.decl.inset === undefined) {
      assert.ok(r.decl.left !== undefined && r.decl.right !== undefined, `${r.sel} fixed without left+right`);
      for (const k of ["left", "right"]) assert.ok(px(r.decl[k]) >= 0, `${r.sel} ${k}`);
    }
  }
  // the scrolling column: two-sided 12 px gutter, vertical scroll only, clear of the context bar (74+46=120) and the bottom nav (766)
  assert.equal(px(prop("#sheet", "left")), 12); assert.equal(px(prop("#sheet", "right")), 12);
  assert.ok(px(prop("#sheet", "top")) >= 120, "column must start below the context bar");
  assert.ok(px(prop("#sheet", "bottom")) >= 78, "column must end above the bottom nav");
  assert.equal(prop("#sheet", "overflow-x"), "hidden");
  assert.equal(prop("#sheet", "overflow-y"), "auto");
  // shell.js turns #right into a bottom sheet with !important geometry: the column dissolves both wrappers
  assert.equal(prop("#left", "display"), "contents");
  assert.equal(prop("#right>.mp-sheet-grip", "display"), "none!important");
  // table and proof columns are fixed so long values wrap instead of widening the card
  assert.equal(prop(".mp-diff", "table-layout"), "fixed");
  assert.equal(prop(".mp-proof", "table-layout"), "fixed");
  assert.equal(prop(".mp-edit", "grid-template-columns"), "minmax(0,1fr)");
  // the three scenario pills share one row
  assert.equal(prop(".mp-scn-list", "grid-template-columns"), "repeat(3,minmax(0,1fr))");
  // the context bar CTA and the dock are hidden (the verdict card has the CTA, the pills select the scenario)
  assert.equal(prop(".mp-context .mp-pill", "display"), "none");
  assert.equal(prop("#dock", "display"), "none");
});

test("mobile block: order follows the design and no numbers are injected by css", () => {
  const o = s => Number(prop(s, "order"));
  assert.ok(o("#verdict") < o(".mp-scn-list") && o(".mp-scn-list") < o("#right>.mp-glass") && o("#right>.mp-glass") < o("#left>.mp-glass"));
  assert.equal(prop("#right>.mp-glass", "background"), "var(--card)", "the numbers card is the black card of the design");
  assert.ok(!/content:\s*["'][^"']*\d/.test(css), "CSS must not inject numbers through content:");
  for (const n of ["68 h", "46 h", "30 h", "160 h", "61%", "63%", "34%", "ILUSTR", "B ✓"]) assert.ok(!css.includes(n), `compare-mobile.css contains "${n}"`);
});

const REGIONS = [
  ["fundo de relevo", /Fundo de relevo/],
  ["cabeçalho", /Cabeçalho em pílula/],
  ["cartão de recomendação", /Cartão de recomendação/],
  ["pílulas A/B/C", /Pílulas A \/ B ✓ \/ C/],
  ["tabela Diferenças", /Tabela "Diferenças"/],
  ["linhas de medida", /Linhas "Maior noite"/],
  ["CTA E se atrasar", /Botão "E se B atrasar\?"/],
  ["botão Pousar", /Botão "Pousar"/],
  ["barra de navegação inferior", /Barra de navegação inferior/],
];
test("designer spec: exists, names 390x844 and cites every region of the design", () => {
  assert.ok(mds.length > 2000);
  assert.match(mds, /390×844/);
  assert.match(mds, /MobileSheet\.dc\.html/);
  for (const [name, re] of REGIONS) assert.ok(re.test(mds), `designer spec does not cite: ${name}`);
  for (const h of ["Pergunta que a tela responde", "Layout", "Componentes e tokens", "Estados", "ilustrativo", "Interações"]) assert.ok(mds.includes(h), `missing section: ${h}`);
});
test("designer spec: states the integrity rules (no VAL, N/D for missing, tokens, requests)", () => {
  assert.match(mds, /`VAL` não aparece/);
  assert.match(mds, /`N\/D`/);
  for (const tk of ["Manrope", "Jade", "44 px", "vidro", "limite assumido"]) assert.ok(mds.includes(tk), `spec should mention ${tk}`);
  assert.match(mds, /Pedidos fora do arquivo de CSS/);
});
