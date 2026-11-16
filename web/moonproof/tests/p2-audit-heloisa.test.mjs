import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { passportHtml } from "../screens/plan-model.js";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const base = { lang: "pt-BR", version: "abc", link: "x", generatedAt: "2026-11-16T00:00:00Z", origin: "PRE", rules: [], columns: [], rows: [], limits: [] };

test("P2-12: printed report always carries a PRELIMINARY seal (repo bans that word in screens), even without the translated key", () => {
  assert.match(passportHtml({ ...base, L: { title: "T" } }), /class="seal"[^>]*>PRELIMINARY</);
  assert.match(passportHtml({ ...base, L: { title: "T", seal: "PRELIMINAR · relatório educacional" } }), /PRELIMINAR · relatório educacional/);
});

test("P2-12: the export button is named as an educational report, not a certified PDF", async () => {
  for (const p of ["screens/plan.tsx", "screens/plan.js"]) {
    const src = await read(p);
    assert.match(src, /Imprimir relatório educacional \(PDF\)/);
    assert.match(src, /Print educational report \(PDF\)/);
    assert.match(src, /plan\.pSeal/);
  }
});

test("P2-09: API neighbours show the catalog name (id kept as tooltip) and explain PRE", async () => {
  for (const p of ["screens/recover.tsx", "screens/recover.js"]) {
    const src = await read(p);
    assert.match(src, /siteOf\(nb\.siteId\)\?\.name \?\? nb\.siteId/);
    assert.match(src, /PRE = preliminar, sem revisão independente/);
    assert.match(src, /PRE = preliminary, not independently reviewed/);
  }
});
