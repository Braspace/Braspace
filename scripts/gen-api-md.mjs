#!/usr/bin/env node
// Generates the reference part of docs/API.md from api/openapi.json (the source of truth), so the doc cannot drift:
// every operation, its parameters, request body and every documented status with its description / error code.
// Hand-written sections (live examples, notes) live after END_MARK and are preserved verbatim.
//
//   node scripts/gen-api-md.mjs           rewrite docs/API.md
//   node scripts/gen-api-md.mjs --check   exit 1 if docs/API.md is not what the spec generates (used by ci-local)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "api/openapi.json"), docPath = join(root, "docs/API.md");
const BEGIN_MARK = "<!-- BEGIN GENERATED: scripts/gen-api-md.mjs from api/openapi.json — do not edit by hand -->";
const END_MARK = "<!-- END GENERATED -->";
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const METHODS = ["get", "post", "put", "patch", "delete"];
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
const refName = (schema) => (schema?.$ref ? "`" + schema.$ref.split("/").pop() + "`" : schema?.type ? "`" + schema.type + "`" : "—");
const anchor = (m, p) => (m + "-" + p).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function param(p) {
  const s = p.schema || {}, bits = [];
  if (s.type) bits.push(s.type + (s.format ? `/${s.format}` : ""));
  if (s.pattern) bits.push("`" + s.pattern + "`");
  if (s.minimum != null || s.maximum != null) bits.push(`${s.minimum ?? ""}..${s.maximum ?? ""}`);
  if (s.default != null) bits.push(`default ${JSON.stringify(s.default)}`);
  return `| \`${p.name}\` | ${p.in} | ${p.required ? "yes" : "no"} | ${cell(bits.join(", "))} | ${cell(p.description)} |`;
}

const ops = [];
for (const [path, item] of Object.entries(spec.paths || {}))
  for (const m of METHODS) if (item[m]) ops.push({ method: m.toUpperCase(), path, op: item[m], shared: item.parameters || [] });

const out = [];
out.push(BEGIN_MARK, "");
out.push(`Spec: \`${spec.info?.title}\` \`${spec.info?.version}\` (OpenAPI ${spec.openapi}). **${ops.length} operations.**`, "");
if (spec.info?.description) out.push(cell(spec.info.description), "");
out.push("Every 4xx/5xx body is JSON with a stable `code` (see each operation). Science fields (`science_status`,",
  "`scientifically_validated`, provenance) must be shown as they come: no response is flight-validated.", "");
out.push("## Endpoints", "", "| Method | Path | Summary | Statuses |", "|---|---|---|---|");
for (const o of ops) out.push(`| \`${o.method}\` | [\`${o.path}\`](#${anchor(o.method, o.path)}) | ${cell(o.op.summary)} | ${Object.keys(o.op.responses || {}).join(", ")} |`);
out.push("");
for (const o of ops) {
  out.push(`### ${o.method} ${o.path}`, "");
  if (o.op.summary) out.push(cell(o.op.summary), "");
  if (o.op.description) out.push(cell(o.op.description), "");
  if (o.op.operationId) out.push(`operationId: \`${o.op.operationId}\``, "");
  const params = [...o.shared, ...(o.op.parameters || [])];
  if (params.length) out.push("| Parameter | In | Required | Schema | Description |", "|---|---|---|---|---|", ...params.map(param), "");
  const body = o.op.requestBody;
  if (body) {
    const types = Object.entries(body.content || {}).map(([t, c]) => `\`${t}\` ${refName(c.schema)}`).join(", ");
    out.push(`Request body${body.required ? " (required)" : ""}: ${types}${body.description ? " — " + cell(body.description) : ""}`, "");
  }
  out.push("| Status | Content | Meaning |", "|---|---|---|");
  for (const [code, r] of Object.entries(o.op.responses || {})) {
    const types = Object.entries(r.content || {}).map(([t, c]) => `\`${t}\` ${refName(c.schema)}`).join(", ") || "—";
    out.push(`| ${code} | ${types} | ${cell(r.description)} |`);
  }
  out.push("");
}
out.push(END_MARK);
const generated = out.join("\n");

const current = (() => { try { return readFileSync(docPath, "utf8"); } catch { return ""; } })();
let next;
if (current.includes(BEGIN_MARK) && current.includes(END_MARK)) {
  next = current.slice(0, current.indexOf(BEGIN_MARK)) + generated + current.slice(current.indexOf(END_MARK) + END_MARK.length);
} else {
  // First run: keep the title/base URL header and everything from the first hand-written "## Live" section on.
  const live = current.indexOf("\n## Live");
  const head = "# BRASPACE API Reference\n\n**Public Base URL:** `https://braspace-api.srv1898743.hstgr.cloud` (same origin through the Worker: `https://braspace-moonproof.almeida-me.workers.dev`).\n\n";
  next = head + generated + "\n" + (live >= 0 ? current.slice(live) : "\n");
}
if (process.argv.includes("--check")) {
  if (next !== current) { console.error(`docs/API.md is stale: run node scripts/gen-api-md.mjs (spec has ${ops.length} operations)`); process.exit(1); }
  console.log(`docs/API.md in sync with api/openapi.json (${ops.length} operations)`);
} else { writeFileSync(docPath, next); console.log(`docs/API.md written (${ops.length} operations)`); }
