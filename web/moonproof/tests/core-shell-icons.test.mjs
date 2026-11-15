// Nav pills use the shared icon set (core/icons.js), not a private path table in shell.js.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ICON_NAMES } from "../core/icons.js";

const shell = await readFile(new URL("../core/shell.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../core/components.css", import.meta.url), "utf8");
const ids = [...shell.matchAll(/\{ id: "([a-z]+)", page:/g)].map(m => m[1]);
const map = Object.fromEntries([...(shell.match(/const ICON_OF = \{([^}]*)\}/)?.[1] ?? "").matchAll(/(\w+): "([\w-]+)"/g)].map(m => [m[1], m[2]]));
const local = [...(shell.match(/const LOCAL = \{\s*(\w+):/g) ?? [])].map(m => m.match(/(\w+):$/)[1]);

test("every nav screen has an icon: a name of the shared set, or the one local drawing", () => {
  assert.deepEqual(ids, ["cockpit", "onboard", "landing"]); // 15/11: only the cockpit stays (ARQUIVO.md)
  for (const id of ids) {
    if (map[id]) assert.ok(ICON_NAMES.includes(map[id]), `${id} -> ${map[id]} is not in core/icons.js`);
    else assert.ok(local.includes(id), `${id} has no icon`);
  }
  assert.deepEqual(local, ["debrief"]); // kept for the archived Debrief page
});

test("shell imports the shared set, has no private path table and the help pill uses the help icon", () => {
  assert.match(shell, /from "\.\/icons\.js"/); assert.doesNotMatch(shell, /const P = \{/);
  assert.ok(ICON_NAMES.includes("help")); assert.match(shell, /ico: "help"/);
  assert.match(shell, /aria-label", t\("nav\.help"\)/, "icon-only pill keeps its accessible name");
});

test("pills size the 24-unit icons in CSS", () => assert.match(css, /\.mp-pill svg\{[^}]*width:\d+px;height:\d+px/));
