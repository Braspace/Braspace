// Contract integrity for C and D: seal from origin only, no design numbers, no zero for missing, i18n parity, API fallback.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mapApiMetrics } from "../screens/scenario-data.js";
import { sealFor } from "../core/data.js";
const read = n => readFile(new URL("../" + n, import.meta.url), "utf8");
const FILES = ["screens/compare.tsx", "screens/recover.tsx", "screens/scenario-calc.js", "screens/scenario-data.ts", "screens/scenario.css", "compare.html", "recover.html"];

test("rule 1/3: no illustrative design number or invented name in C/D code", async () => {
  const bad = ["SR-0", "a41c9e2", "71%", "46 h", "+14 h", "68 h", "160 h", "−11", "moonproof.app", "Bateria H1", "20 m/px", "ILUSTRATIVO", "Haworth"];
  for (const f of FILES) { const s = await read(f); for (const b of bad) assert.ok(!s.includes(b), `${f} has ${b}`); }
});
test("rule 2: seals come from sealFor(origin) only; VAL never typed in the screens", async () => {
  for (const f of ["screens/compare.tsx", "screens/recover.tsx", "screens/scenario-data.ts"]) {
    const s = await read(f);
    assert.ok(!/["'`]VAL["'`]/.test(s), `${f} types VAL`);
    assert.ok(!/validated/i.test(s.replace(/sealFor|NOT_INDEPENDENTLY_VALIDATED/g, "")), `${f} mentions validated`);
  }
  assert.equal(mapApiMetrics({ longest_continuous_dark_hours: 1, longest_continuous_comm_gap_hours: 1 }, "SYNTHETIC", "x").seal, "SIM");
  assert.equal(mapApiMetrics({ longest_continuous_dark_hours: 1 }, "UNVERIFIED_INPUTS", "x").seal, "EST");
  assert.notEqual(mapApiMetrics({}, "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", "x").seal, "VAL");
  assert.equal(mapApiMetrics({}, "VALIDATED", "x").seal, sealFor("VALIDATED"));
});
test("rule 4: API missing numbers stay null, never 0", () => {
  const m = mapApiMetrics({ sun_visible_fraction: 0.5 }, "SYNTHETIC", "x");
  assert.equal(m.dark, null); assert.equal(m.blackout, null); assert.equal(m.sunPct, 50);
  assert.equal(mapApiMetrics(null, "SYNTHETIC", "x"), null);
});
test("rule 5: rules are the user's assumed limits (state), labelled; no literal 60/72 in the screens", async () => {
  for (const f of ["screens/compare.tsx", "screens/recover.tsx"]) { const s = (await read(f)).replace(/^export const DELAYS.*$/m, ""); assert.ok(!/\b(60|72)\b/.test(s), `${f} hardcodes 60/72`); assert.match(s, /assumed|assumido/); }
});
test("rule 6: no QR/share domain; links are page + query", async () => { for (const f of FILES) assert.ok(!/https?:\/\/(?!cdn)/.test(await read(f)), f); });
test("exits are never listed without a calculation", async () => { const s = await read("screens/recover.tsx"); assert.match(s, /computeExits/); assert.ok(!/slack:\s*[-+]?\d/.test(s)); });
test("i18n: C and D register identical key sets en/pt-BR", async () => {
  for (const f of ["screens/compare.tsx", "screens/recover.tsx"]) {
    const s = await read(f); const m = s.match(/register\(\{\s*en: \{([\s\S]*?)\n  \},\s*"pt-BR": \{([\s\S]*?)\n  \},\n\}\);/);
    assert.ok(m, f); const keys = x => [...x.matchAll(/"([\w.]+)":/g)].map(k => k[1]).sort().join("|");
    assert.equal(keys(m[1]), keys(m[2]), f);
  }
});
test("keys used by t() exist", async () => {
  for (const f of ["screens/compare.tsx", "screens/recover.tsx"]) {
    const s = await read(f); const defined = new Set([...s.matchAll(/"((?:cmp|rec)\.[\w.]+)":/g)].map(k => k[1]));
    for (const k of s.matchAll(/t\("((?:cmp|rec)\.[\w.]*\w)"/g)) assert.ok(defined.has(k[1]), `${f}: ${k[1]}`);
  }
});
test("pages mount the right nav item and link the sibling screen", async () => {
  assert.match(await read("screens/compare.tsx"), /screen: "compare"/); assert.match(await read("screens/recover.tsx"), /screen: "recover"/);
  assert.match(await read("screens/compare.tsx"), /recover\.html/); assert.match(await read("screens/recover.tsx"), /compare\.html/);
});

test("replan explanation covers every rule instead of reporting a false night violation", async () => {
  for (const file of ["screens/recover.tsx", "screens/recover.js"]) {
    const src = await read(file);
    assert.match(src, /ruleHeadlineKind\(jd\)/);
    for (const key of ["rec.head.break", "rec.head.blackout", "rec.head.both", "rec.head.ok", "rec.head.nd"]) {
      assert.ok(src.includes(key), file + " lacks " + key);
    }
    assert.doesNotMatch(src, /jd\.reasons\.some\(r => r\.key === "night"\) \? t\("rec.head.break"/,
      "a communications-only failure must not receive a night warning");
  }
  const ts = await read("screens/recover.tsx");
  assert.match(ts, /Visibilidade geométrica não garante contato por rádio/);
  assert.match(ts, /Geometric visibility does not guarantee radio contact/);
});

test("nearby API candidates display their own UTC evaluation time, not the delayed time by assumption", async () => {
  for (const path of ["screens/recover.tsx", "screens/recover.js"]) {
    const src = await read(path);
    assert.match(src, /rec\.nearby\.window/);
    assert.match(src, /nearbyUTC\(nb\.startUtc\)/);
    assert.doesNotMatch(src, /nearby catalog sites at the delayed start/);
    assert.doesNotMatch(src, /locais vizinhos do catálogo no início atrasado/);
  }
  for (const path of ["screens/scenario-data.ts", "screens/scenario-data.js"]) {
    const src = await read(path);
    assert.match(src, /startUtc: o\.start_utc/);
    assert.match(src, /Date\.parse\(o\.start_utc\)/);
  }
});
