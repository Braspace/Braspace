// E · Cockpit geometry measured by DOM against the Heloísa board at 1440x900 (audit-geom, IoU). Static checks of the
// desktop block: a regression to the old cards (163-171 px, 121 px pills, one big player pill) fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../screens/cockpit.css", import.meta.url), "utf8");
const js = await readFile(new URL("../screens/cockpit.js", import.meta.url), "utf8");
const html = await readFile(new URL("../cockpit.html", import.meta.url), "utf8");
const desktop = css.slice(css.indexOf("@media (min-width:701px){\n  .mp-ck-left,.mp-ck-right"));
const has = (re, msg) => assert.match(desktop, re, msg);

test("desktop cards keep the board heights, pills are 34 px tall and still reach a 44 px touch area", () => {
  has(/\.mp-ck-left \.mp-layer\{[^}]*min-height:169px/, "sun card 169 px");
  has(/\.mp-rules\{min-height:304px\}/, "rules card 304 px");
  has(/\.mp-alert\{[^}]*min-height:135px/, "alert card 135 px");
  has(/\.mp-glass\{[^}]*min-height:144px/, "fault card 144 px");
  has(/\.mp-faults \.mp-pill\{min-height:34px\}/, "fault pills 34 px");
  assert.match(css, /\.mp-faults \.mp-pill::after[^}]*height:var\(--touch\)/, "fault pill hit area is --touch");
  assert.match(css, /\.mp-alert \.mp-pill::after[^}]*height:var\(--touch\)/, "alert button hit area is --touch");
  has(/\.mp-alert \.mp-pill\.is-white\{min-height:30px/, "Entendi is 30 px tall");
});

test("player is four separate pieces: two circles, a 378x50 timeline pill and an 86x48 speed chip", () => {
  assert.match(html, /<div class="mp-tl">[\s\S]*id="time"[\s\S]*id="range"[\s\S]*id="end"[\s\S]*<\/div>\s*<select id="speed">/);
  has(/\.mp-tl\{[^}]*width:378px;height:50px/, "timeline pill");
  has(/\.mp-player select\{[^}]*width:86px;min-height:48px/, "speed chip");
  has(/\.mp-player>\.mp-round\{width:44px;height:44px/, "round buttons");
});

test("battery ring is a real 152 px disc and the satellites follow the board order (floor left, margin below)", () => {
  has(/\.mp-ck-left \.mp-stat\{width:152px;height:152px/, "ring box");
  const sats = js.match(/satellites: \[([\s\S]*?)\] \}\);/)[1];
  const order = [...sats.matchAll(/label: t\("cockpit\.(\w+)"\)/g)].map(m => m[1]);
  assert.deepEqual(order, ["next_night", "endurance", "margin", "floor"]);
});

test("phone keeps its own layout: the timeline wrapper vanishes below 701 px and the onboard link rides in the context bar", () => {
  assert.match(css, /\.mp-tl\{display:contents\}/);
  assert.match(js, /narrow\(\) \? \{ action:/);
});
