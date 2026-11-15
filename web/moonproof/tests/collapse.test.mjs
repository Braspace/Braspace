// Foldable panels (core/collapse.ts): placement, CSS contract and wiring.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buttonPlace, FOLDABLE} from "../core/collapse.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("button sits on the panel's inner edge when open and on the screen edge when folded", () => {
  const r = {left: 29, right: 349, top: 140, bottom: 760, width: 320};
  assert.deepEqual(buttonPlace("left", r, false, 1440, 900), {left: 355, top: 153});
  assert.deepEqual(buttonPlace("left", r, true, 1440, 900), {left: 8, top: 153});
  const rr = {left: 1062, right: 1411, top: 140, bottom: 600, width: 349};
  assert.deepEqual(buttonPlace("right", rr, false, 1440, 900), {left: 1028, top: 153});
  assert.deepEqual(buttonPlace("right", rr, true, 1440, 900), {left: 1404, top: 153});
  const d = {left: 520, right: 920, top: 820, bottom: 872, width: 400};
  assert.deepEqual(buttonPlace("bottom", d, false, 1440, 900), {left: 698, top: 786});
  assert.deepEqual(buttonPlace("bottom", d, true, 1440, 900), {left: 698, top: 864});
  // never under the top bar, never off screen
  assert.ok(buttonPlace("left", {...r, top: 0}, false, 1440, 900).top >= 76);
  assert.ok(buttonPlace("right", {...rr, left: 0}, false, 1440, 900).left >= 8);
});

test("left/right/dock/player fold to their own side", () => {
  assert.deepEqual(FOLDABLE, [["#left", "left"], ["#right", "right"], ["#dock", "bottom"], ["#player", "bottom"]]);
});

test("CSS slides with `translate` (composes with screen transforms), desktop only, reduced motion", () => {
  const css = read("core/components.css");
  for (const side of ["left", "right", "bottom"]) assert.match(css, new RegExp(`\\[data-fold="${side}"\\]\\[data-folded="true"\\] \\{ translate:`));
  assert.match(css, /@media \(max-width: 900px\) \{ \.mp-fold \{ display: none; \} \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \[data-fold\] \{ transition: none; \} \}/);
});

test("non-cockpit screens get generic folds; cockpit owns its single controller", () => {
  assert.match(read("core/shell.ts"), /if \(screen !== "cockpit"\) enhancePanels\(\);/);
  assert.match(read("cockpit.html"), /src="screens\/cockpit-panels\.js"/);
  const src = read("core/collapse.ts");
  assert.match(src, /setAttribute\("aria-controls", panel\.id\)/);
  assert.match(src, /setAttribute\("aria-expanded"/);
  assert.match(src, /"pt-BR": \{ "fold\.left\.hide": "Recolher painel esquerdo"/);
});
