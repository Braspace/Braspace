// tokens.css: "--c-sim: RESERVED for simulation". A violet that shows up on generic UI teaches
// readers that ordinary actions are simulated data. Only provenance/simulation selectors may use it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ALLOWED = [/\.prov\.sim\b/, /\.navp\.lab\b/, /\.sw-sim\b/, /\.tag\.(SINT|ESQ)\b/, /^\s*:root\b/, /\.is-sim\b/];

for (const file of ["../ds/components.css", "../onboard/cockpit.css"]) {
  test(`--c-sim only in simulation/provenance rules: ${file}`, () => {
    const css = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = m;
      if (!/--c-sim\b/.test(body)) continue;
      if (/--ai(-bg|-line)?\s*:/.test(body)) continue; // cockpit AI/assumption vars, used only by SIM tags
      if (!ALLOWED.some(r => r.test(sel))) offenders.push(sel.trim());
    }
    assert.deepEqual(offenders, [], `violet used by non-simulation selectors: ${offenders.join(" | ")}`);
  });
}
