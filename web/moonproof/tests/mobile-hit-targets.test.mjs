import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("Planning Kit export actions are real 44px-high buttons", async () => {
  const [css, component] = await Promise.all([read("../screens/plan.css"), read("../screens/plan.tsx")]);
  const rule = /\.mp-btn-white\s*\{([^}]+)\}/.exec(css);
  assert.ok(rule, "export button style exists");
  const size = /\bheight\s*:\s*(\d+)px/.exec(rule[1]);
  assert.ok(size, "export button height is explicit");
  assert.ok(Number(size[1]) >= 44, "export controls must expose >=44px physical height");
  for (const id of ["btn-csv", "btn-json", "btn-pdf"])
    assert.match(component, new RegExp(`id="${id}"[^>]*class="mp-btn-white"`));
});

test("Class Kit switches keep their visual track but provide a >=44px hit region", async () => {
  const [css, activity] = await Promise.all([read("../core/components.css"), read("../screens/activity.css")]);
  const base = /\.mp-switch\s*\{([^}]+)\}/.exec(activity);
  const hit = /\.mp-switch::before\s*\{([^}]+)\}/.exec(css);
  assert.ok(base && hit);
  const height = Number(/\bheight\s*:\s*(\d+)px/.exec(base[1])?.[1]);
  const extra = Number(/\binset\s*:\s*-(\d+)px/.exec(hit[1])?.[1]);
  assert.equal(height, 26, "the visual switch track remains at 26px");
  assert.ok(Number.isFinite(extra) && height + 2 * extra >= 44,
    "the visual switch must extend its pointer target to >=44px");
});
