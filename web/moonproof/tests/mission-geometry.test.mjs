// A (mission): geometry pass against the Main board + the Earth compass (data, never a fixed azimuth).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compassIndex } from "../screens/mission-calc.js";

const read = f => readFile(new URL("../" + f, import.meta.url), "utf8");
const CSS_FILE = process.env.MISSION_CSS_FILE || "screens/mission.css";
/** Declarations of the LAST rule whose selector list contains `sel` inside the block that starts at `media` (or top level). */
const decl = (css, sel, prop) => {
  let v = null; // first match wins: the prepended 1301+ block is read before the generic rules
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(",").some(x => x.trim().endsWith(sel))) continue;
    const p = m[2].match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;!]+)")); if (p && v == null) v = p[1].trim();
  }
  return v;
};

test("compass: 8-point index from an azimuth, null when the azimuth is missing (never 0)", () => {
  assert.equal(compassIndex(null), null); assert.equal(compassIndex(undefined), null); assert.equal(compassIndex(NaN), null);
  const cases = [[0, 0], [22.4, 0], [22.5, 1], [90, 2], [180, 4], [270, 6], [337.4, 7], [337.5, 0], [359.9, 0], [360, 0], [-10, 0], [-90, 6], [725, 0]];
  for (const [az, i] of cases) assert.equal(compassIndex(az), i, String(az));
});
test("compass: azimuth and direction come from the stored series (cur.geo), no fixed value in code or html", async () => {
  const js = await read("screens/mission.js");
  const block = js.slice(js.indexOf('const comp = el("div", "mc-compass")'), js.indexOf("right.append(comp)"));
  assert.ok(block.length > 100, "compass block found");
  assert.match(block, /cur\.geo\?\.earthAz/); assert.match(block, /compassIndex\(az\)/);
  assert.match(block, /ci == null \? nd\(\)/, "missing direction renders N/D dash");
  assert.match(block, /fmtVal\(az, fmtNum, nd\(\)/, "missing azimuth renders the dash");
  assert.doesNotMatch(block, /\d{2,3}\s*°|earthAz\s*=\s*\d|az\s*=\s*\d/, "no literal azimuth in the compass block");
  assert.doesNotMatch(await read("mission.html"), /\d{3}°/);
});
test("compass: eight directions and the EARTH/TERRA label exist in both languages", async () => {
  const { t, setLang } = await import("../core/i18n.js"); await import("../screens/mission-i18n.js");
  for (const l of ["en", "pt-BR"]) { setLang(l); for (let i = 0; i < 8; i++) assert.notEqual(t("mc.dir." + i), "mc.dir." + i, `${l} dir ${i}`); assert.notEqual(t("mc.compass"), "mc.compass"); }
  setLang("pt-BR"); assert.equal(t("mc.compass"), "TERRA"); assert.equal(t("mc.dir.2"), "L"); setLang("en"); assert.equal(t("mc.compass"), "EARTH"); assert.equal(t("mc.dir.2"), "E");
});
test("geometry 1440: key boxes of the Main board are set in CSS", async () => {
  const all = await read(CSS_FILE), at = all.lastIndexOf("@media (min-width:1301px){\n  .mc-left{gap:13px}");
  const css = at < 0 ? all : all.slice(at, all.indexOf("\n}\n", at)) + "\n" + all;  // the 1301+ block wins over the generic rules
  assert.equal(decl(css, ".mc-right", "width"), "342px", "numbers/now column");
  assert.equal(decl(css, ".mc-circles .mp-stat", "width"), "142px", "stat halo");
  assert.equal(decl(css, ".mc-circles .mp-stat", "height"), "142px");
  assert.equal(decl(css, ".mc-compass", "width"), "100px", "Earth compass");
  assert.equal(decl(css, ".mc-compass", "height"), "100px");
  assert.equal(decl(css, ".mc-tabs .mp-pill", "height"), "30px", "tabs");
  assert.equal(decl(css, ".mp-pill.is-white.mc-battery", "height"), "40px", "battery pill");
  assert.equal(decl(css, ".mc-sel", "width"), "172px", "site selector");
  assert.equal(decl(css, ".mc-numbers select.mc-win", "width"), "87px", "window select");
});
test("geometry: shrunken controls keep a real touch area of at least 44px (::after with negative inset)", async () => {
  const css = await read(CSS_FILE);
  for (const [vis, after] of [[".mc-tabs .mp-pill", ".mc-tabs .mp-pill::after"], [".mp-context>a.mp-pill", ".mp-context>a.mp-pill::after"]]) {
    const h = parseFloat(decl(css, vis, "height")), inset = decl(css, after, "inset");
    assert.ok(h && inset, `${vis} has height and ::after inset`);
    const vert = Math.abs(parseFloat(inset.split(/\s+/)[0]));
    assert.ok(h + 2 * vert >= 44, `${vis}: ${h} + 2*${vert} >= 44`);
  }
});
test("dock order follows the board: previous, next, site selector, zoom out, zoom in", async () => {
  const js = await read("screens/mission.js");
  const row = js.slice(js.indexOf("row.append("), js.indexOf("d.replaceChildren(hint, row)"));
  const order = ["mc.prev", "mc.next", "sel,", "mc.zout", "mc.zin"].map(k => row.indexOf(k));
  assert.ok(order.every(i => i > -1) && order.every((v, i, a) => !i || v > a[i - 1]), String(order));
});
