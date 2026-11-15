// K2 Apresentar: projector scale (design V3Apresentar). Static assertions on the desktop CSS rules and the markup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dir = new URL("../", import.meta.url);
const read = f => readFile(new URL(f, dir), "utf8");
const css = (await read("screens/present.css")).replace(/\/\*[\s\S]*?\*\//g, ""); // comments out
const base = css.slice(0, css.indexOf("@media")); // desktop rules only
const html = await read("present.html");
const js = await read("screens/present.tsx");

/** Declarations of the first base rule whose selector list contains `sel` exactly. */
function decl(sel) {
  for (const m of base.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if (m[1].split(",").map(s => s.trim()).includes(sel)) return m[2].replace(/\s+/g, " ");
  assert.fail(`no desktop rule for ${sel}`);
}
const has = (sel, re) => assert.match(decl(sel), re, `${sel} must match ${re}`);

test("question block: kicker 20px, h1 56/62, subtitle 24/34", () => {
  has(".mp-q-idx", /font-size:\s*20px/);
  has(".mp-q-idx", /#7FE6CB/i);
  has(".mp-present-q h1", /font-size:\s*56px/);
  has(".mp-present-q h1", /line-height:\s*62px/);
  has(".mp-present-q h1", /font-weight:\s*800/);
  has(".mp-present-q p", /font-size:\s*24px/);
  has(".mp-present-q p", /line-height:\s*34px/);
});

test("timer value 44px, privacy note has an icon and 14/20 text", () => {
  has(".mp-timer-val", /font-size:\s*44px/);
  has(".mp-timer-label", /font-size:\s*18px/);
  has(".mp-privacy-card", /font-size:\s*14px/);
  has(".mp-privacy-card", /line-height:\s*20px/);
  assert.match(js, /IconInfo/);
  assert.match(js, /<IconInfo \/><span>\{t\("present\.privacy"\)\}<\/span><\/>, \$\("present-privacy"\)/);
});

test("scenario cards: A/B/C circle 52px, rows with 30px icon, label 20/600, value 40/800", () => {
  has(".mp-sc-letter", /width:\s*52px/);
  has(".mp-sc-letter", /height:\s*52px/);
  has(".mp-sc-letter", /font-size:\s*24px/);
  has(".mp-sc-name", /font-size:\s*22px/);
  has(".mp-sc-label", /font-size:\s*20px/);
  has(".mp-sc-label", /font-weight:\s*600/);
  has(".mp-sc-val", /font-size:\s*40px/);
  has(".mp-sc-val", /font-weight:\s*800/);
  has(".mp-sc-card", /padding:\s*21px 21px/);
  assert.equal((js.match(/<svg width="30" height="30"/g) || []).length, 2, "night and Earth icons are 30px");
  assert.match(js, /mp-sc-row"><IconNight \/>/);
  assert.match(js, /mp-sc-row"><IconEarth \/>/);
});

test("buttons: Reveal 72px/20px, Next 56px/17px, column 250px", () => {
  has(".mp-btn-jade", /height:\s*72px/);
  has(".mp-btn-jade", /font:\s*700 20px/);
  has(".mp-btn-outline", /height:\s*56px/);
  has(".mp-btn-outline", /font:\s*600 17px/);
  has(".mp-present-actions", /width:\s*250px/);
});

test("terrain markers A/B/C are 64px solid black discs; scenario letters replace site numbers", () => {
  has(".mp-present .mp-marker", /width:\s*64px/);
  has(".mp-present .mp-marker", /height:\s*64px/);
  assert.match(js, /LETTERS\s*=\s*\["A", "B", "C"\]/);
  assert.match(js, /n:\s*LETTERS\[i\]/);
});

test("solid black circles keep the item-2 look: #050607 fill, light border, drop shadow", () => {
  for (const sel of [".mp-present .mp-marker", ".mp-sc-letter"]) {
    has(sel, /background:\s*var\(--card,\s*#050607\)/);
    has(sel, /border:\s*2px solid #F2F4F5/i);
    has(sel, /box-shadow:\s*0 18px 40px rgba\(0,\s*0,\s*0,\s*\.45\)/);
  }
});

test("scenario cards stay glass (the design draws them translucent, not black)", () => {
  assert.match(js, /class=\{"mp-glass mp-sc-card"/);
});

test("top bar: 32px logo, white pill 34px with icon, 28x6 progress segments, 44px exit with icon", () => {
  assert.match(html, /<svg width="32" height="32"/);
  assert.match(html, /mp-pill-white">\s*<svg/);
  has(".mp-pill-white", /height:\s*34px/);
  has(".mp-present-brand", /font-size:\s*19px/);
  has(".mp-progress-seg", /width:\s*28px/);
  has(".mp-progress-seg", /height:\s*6px/);
  has(".mp-progress-seg", /border-radius:\s*3px/);
  has(".mp-progress-seg", /rgba\(255,255,255,\.25\)/);
  has(".mp-btn-exit", /height:\s*44px/);
  assert.match(js, /IconX/);
});

test("integrity: no design number or invented text in the screen files", () => {
  for (const s of [css, html, js]) assert.doesNotMatch(s, /\b(68|40|38|160) h\b|Missão 03|1:42/);
});
