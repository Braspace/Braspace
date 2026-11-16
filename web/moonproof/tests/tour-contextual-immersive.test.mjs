import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

function zIndex(css, selector) {
  const line = css.split("\n").find(line =>
    line.trimStart().startsWith(selector + "{") ||
    line.trimStart().startsWith(selector + " {"));
  assert.ok(line, `Missing CSS selector ${selector}`);
  const match = /\bz-index\s*:\s*(\d+)/.exec(line);
  assert.ok(match, `Missing numeric z-index ${selector}`);
  return Number(match[1]);
}

test("contextual Help popover and full guided overlay outrank immersive Three.js", async () => {
  const [tour, backdrop, shell] = await Promise.all([
    read("../screens/tour.css"), read("../../moon-hd/backdrop.css"), read("../core/shell.js")
  ]);
  assert.match(shell, /className = "mp-glass mp-help-pop"/);
  assert.match(shell, /document\.body\.append\(pop\)/);
  assert.match(shell, /querySelector\("\.mp-tour-help"\)/);
  const layers = [
    zIndex(backdrop, ".moon-backdrop.is-explore"),
    zIndex(backdrop, ".moon-ui"),
    zIndex(tour, "html.moon-explore-on .mp-top"),
    zIndex(tour, "html.moon-explore-on .mp-help-pop"),
    zIndex(tour, "html.moon-explore-on .mp-tour-cover"),
    zIndex(tour, "html.moon-explore-on .mp-tour-spotlight"),
    zIndex(tour, "html.moon-explore-on .mp-tour-dialog"),
  ];
  for (let index = 1; index < layers.length; index++)
    assert.ok(layers[index] > layers[index - 1], `Immersive hit layers out of order: ${layers.join(",")}`);
});

test("normal tour and popover retain their existing nonimmersive ordering", async () => {
  const [tour, components] = await Promise.all([
    read("../screens/tour.css"), read("../core/components.css"),
  ]);
  assert.ok(zIndex(components, ".mp-top") < zIndex(components, ".mp-help-pop"));
  assert.ok(zIndex(tour, ".mp-tour-cover") < zIndex(tour, ".mp-tour-spotlight"));
  assert.ok(zIndex(tour, ".mp-tour-spotlight") < zIndex(tour, ".mp-tour-dialog"));
  assert.match(tour, /html\.moon-explore-on \.mp-help-pop\{/);
});
