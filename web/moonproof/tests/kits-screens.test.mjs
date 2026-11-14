import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "plan.html", "screens/plan.js", "screens/plan.css",
  "present.html", "screens/present.js", "screens/present.css",
  "activity.html", "screens/activity.js", "screens/activity.css"
];

test("K1/K2/K3 files exist and have no invented domain or design numbers", () => {
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(src.length > 0, `${f} is non-empty`);
    assert.doesNotMatch(src, /moonproof\.app/i, `${f} must not invent moonproof.app`);
    assert.doesNotMatch(src, /\bSR-0[1-5]\b/, `${f} must not use SR-0x`);
    assert.doesNotMatch(src, /\ba41c9e2\b/, `${f} must not use design hash a41c9e2`);
    assert.doesNotMatch(src, /\bVAL\b/, `${f} must not hard-code VAL seal`);
  }
});

test("K1 plan.js uses sealFor, t(\"nd\"), DEFAULT_RULES and location.href", () => {
  const src = fs.readFileSync(path.join(root, "screens/plan.js"), "utf8");
  assert.match(src, /sealFor\(/);
  assert.match(src, /t\("nd"\)/);
  assert.match(src, /DEFAULT_RULES/);
  assert.match(src, /location\.href/);
});

test("K2 present.js computes answer from metrics and has no teacher notes", () => {
  const src = fs.readFileSync(path.join(root, "screens/present.js"), "utf8");
  assert.match(src, /evaluateScenario/);
  assert.match(src, /longestDarkH\.value/);
  assert.match(src, /longestBlackoutH\.value/);
  assert.doesNotMatch(src, /act\.notesBody/);
});

test("K3 activity.js has 4 steps and links to present.html", () => {
  const src = fs.readFileSync(path.join(root, "screens/activity.js"), "utf8");
  assert.match(src, /act\.s4/);
  assert.match(src, /present\.html/);
  assert.match(src, /location\.href/);
});
