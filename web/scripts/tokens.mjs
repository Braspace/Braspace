// Generates docs/design/DESIGN_TOKENS.json from web/ds/tokens.css, the single source of truth.
// `node web/scripts/tokens.mjs`         writes the JSON
// `node web/scripts/tokens.mjs --check` fails if the committed JSON drifted from the CSS
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const CSS = root + "web/ds/tokens.css";
const OUT = root + "docs/design/DESIGN_TOKENS.json";

export function parseTokens(css) {
  const body = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const tokens = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

export function build(css) {
  return {
    $schema: "braspace-design-tokens/v1",
    source: "web/ds/tokens.css",
    note: "Generated. Edit web/ds/tokens.css and run `node web/scripts/tokens.mjs`.",
    spacingScale: [4, 8, 13, 21, 34, 55],
    breakpoints: { mobile: 390, tablet: 768, notebook: 1440, pc: 1920, stress: 320 },
    tokens: parseTokens(css),
  };
}

// WCAG 2.x relative luminance / contrast for #RRGGBB
export function contrast(a, b) {
  const lum = hex => {
    const c = hex.replace("#", "").match(/../g).map(x => parseInt(x, 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = JSON.stringify(build(readFileSync(CSS, "utf8")), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== json) { console.error("DESIGN_TOKENS.json is stale: run node web/scripts/tokens.mjs"); process.exit(1); }
    console.log("DESIGN_TOKENS.json matches web/ds/tokens.css");
  } else { writeFileSync(OUT, json); console.log("wrote " + OUT); }
}
