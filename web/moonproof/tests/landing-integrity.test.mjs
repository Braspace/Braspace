import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sealFor } from "../core/data.js";
import { dict, register } from "../core/i18n.js";
import { TEXTS } from "../screens/landing-texts.js";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");
const FILES = ["landing.html", "debrief.html", "screens/landing.tsx", "screens/debrief.tsx", "screens/landing-model.js", "screens/landing-texts.ts", "screens/landing.css", "screens/debrief.css"];
const DESIGN = ["142", "−4,8", "-4,8", "SR-02", "SR-01", "38 m", "3,2°", "a41c9e2", "Missão 05", "Mission 05", "tentativa 3", "58%", "34%", "41 s", "22 s", "600 m", "moonproof.app", "20 m/px"];

test("rule 1/3: no number or id from the design sheet in F and G code", async () => {
  for (const f of FILES) { const s = await read(f); for (const n of DESIGN) assert.ok(!s.includes(n), `${f} contains "${n}"`); }
});
test("rule 2: the seal is never typed as VAL; it comes from the origin state", async () => {
  for (const f of FILES) { const s = await read(f); assert.ok(!/["'`]VAL["'`]/.test(s), `${f} types the VAL seal`); assert.ok(!/validated|validado/i.test(s.replace(/NOT_INDEPENDENTLY_VALIDATED/g, "")), `${f} says validated`); }
  assert.equal(sealFor("PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"), "PRE");
  assert.equal(sealFor("SYNTHETIC"), "SIM");
  assert.equal(sealFor(undefined), "N/D");
});
test("rule 2: texts never claim validation", () => {
  for (const l of Object.keys(TEXTS)) for (const [k, v] of Object.entries(TEXTS[l])) assert.ok(!/validad|validated/i.test(v), `${l} ${k}`);
});
test("rule 8: physics is imported from web/lab/physics.js, not rewritten", async () => {
  for (const f of ["screens/landing.tsx", "screens/landing-model.js"]) {
    const s = await read(f);
    assert.match(s, /from "\.\.\/\.\.\/lab\/physics\.js"/, f + " must import web/lab/physics.js");
    assert.ok(!/function (stepFixed|deriv|createSim|rk4)/i.test(s), f + " re-implements physics");
  }
  assert.match(await read("screens/landing.tsx"), /from "\.\.\/\.\.\/lab\/scene\.js"/);
});
test("educational simulation seal exists on F, in both languages, outside any layer", async () => {
  assert.equal(TEXTS["pt-BR"]["lab.sim"], "SIMULAÇÃO EDUCATIVA"); assert.equal(TEXTS.en["lab.sim"], "EDUCATIONAL SIMULATION");
  assert.match(await read("landing.html"), /id="simseal"/);
  assert.match(await read("screens/landing.css"), /\.lab-sim\{position:fixed/);
});
test("rule 5: assumed limits are labelled", () => {
  assert.match(TEXTS.en["deb.rules.note"], /assumed limit/); assert.match(TEXTS["pt-BR"]["deb.rules.note"], /assumed limit/); assert.match(TEXTS.en["lab.why.body"], /assumed limit/);
});
test("rule 6: no invented domain; G links stay relative and carry the scenario", async () => {
  const s = await read("screens/debrief.tsx");
  assert.ok(!/https?:\/\//.test(s)); assert.match(s, /hrefTo\("landing\.html"\)/); assert.match(s, /hrefTo\("explore\.html"/);
});
test("no attempt: G says so, shows N/D and links to F", async () => {
  const s = await read("screens/debrief.tsx");
  assert.match(s, /if \(!A\) return none\(\)/); assert.match(s, /deb\.none\.go/); assert.match(s, /sealEl\("N\/D"\)/);
  assert.equal(TEXTS["pt-BR"]["deb.none.title"], "Nenhuma tentativa para mostrar");
});
test("hazard of boulders < 20 m is N/D (no source)", async () => { const s = await read("screens/landing.tsx"); assert.match(s, /lab\.hazard[^;]*nd/); assert.match(s, /"N\/D"/); });
test("en and pt-BR carry the same keys, and the core accepts them", () => {
  assert.deepEqual(Object.keys(TEXTS.en).sort(), Object.keys(TEXTS["pt-BR"]).sort());
  assert.doesNotThrow(() => register(TEXTS)); assert.equal(dict.en["lab.title"], "Landing Lab");
});
test("keyboard: thrust ↑↓/WS, pause Space, restart R are bound", async () => {
  const s = await read("screens/landing.tsx");
  for (const k of ["ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space", "KeyR"]) assert.ok(s.includes(k), k);
});
