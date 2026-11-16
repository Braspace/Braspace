// LUA3D L2: Cockpit with the 3D Moon below, the lander centred, zoom +/- and inconsistencies 1-4 fixed at the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COCKPIT_RANGE, COCKPIT_MIN_RANGE, COCKPIT_MAX_RANGE, clampCockpitRange } from "../../moon-hd/backdrop.js";
import { TEXTS } from "../screens/cockpit-texts.js";
const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const tsx = read("../screens/cockpit.tsx"), js = read("../screens/cockpit.js"), css = read("../screens/cockpit.css");

test("cockpit zoom has finite limits around the default framing", () => {
  assert.ok(COCKPIT_MIN_RANGE < COCKPIT_RANGE && COCKPIT_RANGE < COCKPIT_MAX_RANGE);
  assert.equal(clampCockpitRange(0.001), COCKPIT_MIN_RANGE);
  assert.equal(clampCockpitRange(99), COCKPIT_MAX_RANGE);
  assert.equal(clampCockpitRange(NaN), COCKPIT_RANGE);
});

test("1: Sun/Earth angles are the margin over the relief horizon (same figure as Explorar), not the flat elevation", () => {
  assert.match(tsx, /series\.sunMargin\[i\]\) \? series\.sunMargin\[i\]/);
  assert.match(tsx, /series\.earthMargin\[i\]\) \? series\.earthMargin\[i\]/);
  assert.doesNotMatch(tsx, /series\.s\.sunEl\[i\]|series\.s\.earthEl\[i\]/);
});

test("2: the rules header explains the folded rules; 3: the ring's margin is labelled as the battery's", () => {
  for (const l of ["en", "pt-BR"]) {
    for (const k of ["cockpit.rules_split", "cockpit.battery_margin", "cockpit.battery_margin_hint", "cockpit.zoom_in", "cockpit.zoom_out", "cockpit.zoom_center"]) assert.ok(TEXTS[l][k], `${l} ${k}`);
    assert.match(TEXTS[l]["cockpit.rules_more"], /\{n\}.*\{m\}/);
  }
  assert.equal(TEXTS["pt-BR"]["cockpit.battery_margin"], "folga da bateria");
  assert.match(js, /label: t\("cockpit\.battery_margin"\)/);
});

test("4: no 2D crater labels behind the glass panels; zoom buttons are 44 px with labels; lander anchored", () => {
  assert.match(tsx, /labels: false, progressive: true/);
  assert.match(css, /\.ck-zoom-btn\{min-width:44px;min-height:44px/);
  for (const z of ["in", "out", "center"]) assert.match(js, new RegExp(`data-zoom": "${z}"`));
  assert.match(js, /setFocusOffset/);
  assert.match(read("../../moon-hd/artemis-cockpit.ts"), /cockpitView\?\.\(site\.lat, site\.lon, HOVER_MID_R\)/);
});
