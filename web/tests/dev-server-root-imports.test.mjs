// dev-server.mjs serves an explicit allowlist. A root-level module imported by another module but
// missing from that list 404s only under the dev server (Pages serves everything), which broke the
// Polar Lab backend bridge (../vector-embed.js) silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(web, "dev-server.mjs"), "utf8");

function* jsFiles(dir) {
  for (const n of readdirSync(dir)) {
    if (["node_modules", "tests", "dashboard"].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (n.endsWith(".js") || n.endsWith(".mjs")) yield p;
  }
}

test("every root-level module imported by another module is served by dev-server.mjs", () => {
  const missing = new Set();
  for (const f of jsFiles(web)) {
    if (f.endsWith("dev-server.mjs")) continue;
    for (const m of readFileSync(f, "utf8").matchAll(/(?:import|export)[^'"]*?from\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      const target = relative(web, resolve(dirname(f), m[1]));
      if (!target.includes("/") && !server.includes(`"/${target}"`)) missing.add(target);
    }
  }
  assert.deepEqual([...missing], []);
});
