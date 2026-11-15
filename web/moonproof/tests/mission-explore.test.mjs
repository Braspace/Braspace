// A (mission) and B (explore): integrity rules of docs/design/FRONT-NOVO-CONTRATO.md that apply to these screens.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runs, dayOf, fmtVal, coordText, parseCoord, skyNext, batteryMargin, mapDir, pxToStereo, stereoToPx, pgdaAt, elRange } from "../screens/mission-calc.js";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");
const FILES = ["mission.html", "explore.html", "screens/mission.tsx", "screens/explore.tsx", "screens/mission-calc.js", "screens/mission-i18n.ts", "screens/mission.css", "screens/explore.css"];
const fmt = (v, d) => v.toFixed(d);

test("rule 1: no illustrative number of the A/B design sheets in the code", async () => {
  const bad = ["63%", "38 h", "38h", "4,6°", "4.6°", "89,450", "89.450", "222,800", "222.800", "89,412", "218,060", "6 h 12", "351°", "1,8°", "4,2°", "+1.832", "60 h", "SR-0", "Crista Shackleton", "14 mar 2027", "DE440 ·", "2 km"];
  for (const f of FILES) { const s = await read(f); for (const n of bad) assert.ok(!s.includes(n), `${f} contains "${n}"`); }
});
test("rule 1: battery H1 has no default numbers (inputs are declared by the user)", async () => {
  const s = await read("screens/mission.tsx");
  assert.doesNotMatch(s, /_(wh|w)\s*:\s*\d/, "default battery numbers in mission.js");
  assert.equal(batteryMargin(null, 40), null); assert.equal(batteryMargin(0, 40), null); assert.equal(batteryMargin(60, null), null);
  assert.equal(batteryMargin(50, 20), 30);
});
test("rule 1: missing value is '—', never 0", () => {
  assert.equal(fmtVal(null, fmt, "—"), "—"); assert.equal(fmtVal(NaN, fmt, "—"), "—"); assert.equal(fmtVal(undefined, fmt, "—", 0, " h"), "—");
  assert.equal(fmtVal(0, fmt, "—"), "0");
  assert.equal(runs(new Float32Array(10), 5, 10), null, "window outside the series → null (N/D)");
  assert.equal(coordText(NaN, 1, fmt, "—"), "—");
});
test("rule 2: 'Now at site' seal follows /sky science_status; null transition → N/D with reason", () => {
  const tr = { epoch_utc: "x", last_unchanged_utc: "y", kind: "sunset", hours_from_start: 7, resolution_seconds: 3600 };
  const mk = (status, sun = tr) => ({ ok: true, data: { science_status: status, next_transitions: { sun, sun_null_reason: sun ? null : "no change in window" } } });
  assert.equal(skyNext(mk("SYNTHETIC"), "sun").seal, "SIM");
  assert.equal(skyNext(mk("PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"), "sun").seal, "PRE");
  for (const s of ["NOT_VALIDATED", "UNVERIFIED_INPUTS", "validated?", null]) assert.notEqual(skyNext(mk(s), "sun").seal, "VAL", String(s));
  const n = skyNext(mk("SYNTHETIC", null), "sun"); assert.equal(n.seal, "N/D"); assert.equal(n.hours, null); assert.equal(n.reason, "no change in window");
  assert.equal(skyNext({ ok: false, offline: true, error: "down" }, "sun").seal, "N/D");
  assert.equal(skyNext(mk("SYNTHETIC"), "sun").hours, 7);
});
test("rule 2: screens never hard-code VAL or 'validated'; energy card is SIM, slope is EST", async () => {
  for (const f of ["screens/mission.tsx", "screens/explore.tsx", "screens/mission-calc.js", "screens/mission-i18n.ts", "mission.html", "explore.html"]) {
    const s = await read(f); assert.doesNotMatch(s, /["'>]VAL["'<]|\bvalidated\b|"VALIDATED"/i, f);
  }
  const m = await read("screens/mission.tsx");
  assert.match(m, /id: "card-energy", title: t\("mc\.energy"\), status: "SIMULATION"/);
  assert.match(m, /slopeDeg, \{ unit: "°", status: "ESTIMATE"/);
  const e = await read("screens/explore.tsx");
  assert.match(e, /id: "slope",[^}]*status: "ESTIMATE"/);
});
test("rule 3: real sites only, from core loadSites()", async () => {
  for (const f of ["screens/mission.tsx", "screens/explore.tsx"]) { const s = await read(f); assert.match(s, /loadSites\(\)/); assert.doesNotMatch(s, /SR-\d/); }
});
test("rule 6: no invented domain; links stay on the page with the query", async () => {
  for (const f of FILES) assert.ok(!(await read(f)).includes("moonproof.app"), f);
});
test("rule 7: resolution comes from the data (80 m native, 400 m grid), never 20 m/px", async () => {
  const e = await read("screens/explore.tsx");
  assert.match(e, /grid\.h\.native_resolution_m/); assert.ok(!e.includes("20 m"));
});
test("visibility runs: losses, longest, first loss and return", () => {
  const m = Float32Array.from([1, 1, -1, -1, -1, 1, 1, -1, 1, 1]);
  assert.deepEqual(runs(m, 0, 10), { losses: 2, longest: 3, firstLoss: 2, firstReturn: 5 });
  assert.deepEqual(runs(Float32Array.from([1, 1, 1]), 0, 3), { losses: 0, longest: 0, firstLoss: null, firstReturn: null });
  assert.equal(dayOf(0), 1); assert.equal(dayOf(25), 2); assert.equal(dayOf(null), null);
});
test("B: coordinate with 3 decimals, typed coordinate parsed", () => {
  assert.equal(coordText(-89.4567, -137.2, fmt, "—"), "89.457° S · 222.800° E");
  assert.deepEqual(parseCoord("-89.5, 220"), { lat: -89.5, lon: 220 });
  assert.deepEqual(parseCoord("89,5 S 220 E"), { lat: -89.5, lon: 220 });
  assert.equal(parseCoord("45, 10"), null, "north/equatorial latitude is outside the south pole data");
  assert.equal(parseCoord("abc"), null);
});
test("B: tap ↔ map transform round-trips; PGDA lookup ignores >100 and outside", () => {
  const view = { cx: 1000, cy: -2000, span: 50000 };
  const [x, y] = pxToStereo(333, 222, view, 1440, 900), [px, py] = stereoToPx(x, y, view, 1440, 900);
  assert.ok(Math.abs(px - 333) < 1e-6 && Math.abs(py - 222) < 1e-6);
  const grid = { x0: 0, y0: 0, dx: 10, nx: 2, ny: 2 };
  assert.equal(pgdaAt(grid, Uint8Array.from([5, 200, 7, 8]), 10, 0), null);
  assert.equal(pgdaAt(grid, Uint8Array.from([5, 6, 7, 8]), 10, 10), 8);
  assert.equal(pgdaAt(grid, Uint8Array.from([5, 6, 7, 8]), 99, 99), null);
});
test("A: Sun/Earth map direction — local north points away from the pole", () => {
  const [x, y] = mapDir(0, 0); assert.ok(Math.abs(x) < 1e-9 && y < 0, "lon 0: north is +y stereo = up on screen");
  const [x2, y2] = mapDir(180, 0); assert.ok(Math.abs(x2) < 1e-9 && y2 > 0);
  assert.equal(elRange([], []), null);
});
