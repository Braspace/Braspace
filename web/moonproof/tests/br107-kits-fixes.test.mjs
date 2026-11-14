import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

test("BR107-1: plan.js has no hardcoded ±1 or ±0.3 uncertainty", () => {
  const src = readFileSync(resolve(root, "screens/plan.js"), "utf8");
  assert.equal(/["']±1["']/.test(src), false, "plan.js must not hardcode ±1");
  assert.equal(/["']±0\.3["']/.test(src), false, "plan.js must not hardcode ±0.3");
});

test("BR107-2: plan.js uses real /api/compare and /api/onboard/site-evaluate contracts", () => {
  const src = readFileSync(resolve(root, "screens/plan.js"), "utf8");
  assert.match(src, /site_ids/, "plan.js must send site_ids to /api/compare");
  assert.match(src, /start_utc/, "plan.js must send start_utc");
  assert.match(src, /duration_hours/, "plan.js must send duration_hours");
  assert.match(src, /candidates/, "plan.js must send candidates to /api/onboard/site-evaluate");
  assert.equal(/online:\s*live\.ok/.test(src), false, "plan.js must not mark API offline on 4xx");
});

test("BR107-3: activity.js checks /readyz via apiOnline instead of hardcoded online: true", () => {
  const src = readFileSync(resolve(root, "screens/activity.js"), "utf8");
  assert.equal(/online:\s*true/.test(src), false, "activity.js must not hardcode online: true");
  assert.match(src, /apiOnline/, "activity.js must call apiOnline()");
});

test("BR107-4: plan.js renames Margem B to Margem do cenário 2", () => {
  const src = readFileSync(resolve(root, "screens/plan.js"), "utf8");
  assert.equal(src.includes("Margem B"), false, "plan.js must not say Margem B");
  assert.match(src, /Margem do cen[áa]rio 2/, "plan.js must label Margem do cenário 2");
});
