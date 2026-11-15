import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

// Compare the actual layer values used by the shared Three.js backdrop and guided tour.
// A visually present button can be pointer-inaccessible when a fullscreen canvas sits above it.
function zIndex(css, selector) {
  const rule = css.split("\n").find(line => line.trimStart().startsWith(selector + "{") ||
    line.trimStart().startsWith(selector + " {"));
  assert.ok(rule, `missing CSS rule: ${selector}`);
  const value = /\bz-index\s*:\s*(\d+)/.exec(rule);
  assert.ok(value, `missing z-index for: ${selector}`);
  return Number(value[1]);
}

test("immersive Moon keeps guided tour help, cover and dialog above the interactive canvas", async () => {
  const [tour, backdrop, page] = await Promise.all([
    read("../screens/tour.css"),
    read("../../moon-hd/backdrop.css"),
    read("../cockpit.html"),
  ]);
  assert.match(page, /href="screens\/tour\.css"/);
  assert.match(page, /data-moon-backdrop="globe"/);
  const layers = [
    zIndex(backdrop, ".moon-backdrop.is-explore"),
    zIndex(backdrop, ".moon-ui"),
    zIndex(tour, "html.moon-explore-on .mp-tour-help"),
    zIndex(tour, "html.moon-explore-on .mp-tour-cover"),
    zIndex(tour, "html.moon-explore-on .mp-tour-spotlight"),
    zIndex(tour, "html.moon-explore-on .mp-tour-dialog"),
  ];
  for (let index = 1; index < layers.length; index++)
    assert.ok(layers[index] > layers[index - 1], `invalid immersive stacking: ${layers.join(" < ")}`);
});

test("outside immersive mode, tour layers retain their normal lightweight stacking", async () => {
  const tour = await read("../screens/tour.css");
  const help = zIndex(tour, ".mp-tour-help");
  const cover = zIndex(tour, ".mp-tour-cover");
  const spotlight = zIndex(tour, ".mp-tour-spotlight");
  const dialog = zIndex(tour, ".mp-tour-dialog");
  assert.ok(help < cover && cover < spotlight && spotlight < dialog);
});
