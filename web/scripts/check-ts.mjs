// Fails if a committed .js generated from a .ts differs from a fresh `tsc` build (TS is the source of truth).
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, readdirSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(path.join(tmpdir(), "ts-check-"));
execFileSync("npx", ["-y", "-p", "typescript@5.6.3", "tsc", "-p", path.join(web, "tsconfig.json"), "--outDir", out, "--rootDir", web], {stdio: "inherit"});
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? (f === "node_modules" ? [] : walk(p)) : [p]; });
const ts = walk(web).filter(f => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".d.ts") && !f.includes(path.sep + "vendor" + path.sep));
let bad = 0;
for (const f of ts) {
  const rel = path.relative(web, f).replace(/\.tsx?$/, ".js");
  const fresh = readFileSync(path.join(out, rel), "utf-8"), committed = readFileSync(path.join(web, rel), "utf-8");
  if (fresh !== committed) { console.error("out of date: web/" + rel + " (run npm --prefix web run build:ts)"); bad++; }
}
if (!ts.length) { console.error("no .ts sources found"); process.exit(1); }
console.log(bad ? `${bad} of ${ts.length} generated files are stale` : `ok: ${ts.length} .ts sources match their generated .js`);
process.exit(bad ? 1 : 0);
