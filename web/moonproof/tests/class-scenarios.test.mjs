import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHash } from "../screens/scenario-calc.js";
import { classroomWindows, classroomWindowLabel } from "../screens/class-scenarios.js";

const sites = [
  { id: "site-a", name: "A" },
  { id: "site-b", name: "B" },
  { id: "site-c", name: "C" },
  { id: "site-d", name: "D" },
];
const defaults = { start: "2026-11-15T00:00:00Z", hours: 336 };

test("Compare handoff preserves site, start and duration for every scenario", () => {
  const sc = [
    { site: "site-c", start: "2026-11-15T12:00:00Z", hours: 24 },
    { site: "site-a", start: "2026-11-16T12:00:00Z", hours: 48 },
    { site: "site-a", start: "2026-11-17T12:00:00Z", hours: 72 },
  ];
  const hash = "#" + buildHash({ sc });
  const selected = classroomWindows(sites, hash, defaults);
  assert.deepEqual(selected.map(w => w.site.id), sc.map(w => w.site));
  assert.deepEqual(selected.map(w => w.start), sc.map(w => w.start));
  assert.deepEqual(selected.map(w => w.hours), sc.map(w => w.hours));
  assert.notStrictEqual(selected[1], selected[2], "two windows on same site are independent");
});

test("Direct Kit Aula links keep the legacy first-three default", () => {
  const selected = classroomWindows(sites, "", defaults);
  assert.deepEqual(selected.map(w => w.site.id), ["site-a", "site-b", "site-c"]);
  assert.ok(selected.every(w => w.start === defaults.start && w.hours === defaults.hours));
});

test("Invalid catalogue IDs cannot inject unknown classroom sites", () => {
  assert.deepEqual(classroomWindows(sites, "#sc=not-in-catalogue", defaults).map(w => w.site.id), ["site-a", "site-b", "site-c"]);
  assert.deepEqual(classroomWindows(sites, "#sc=site-b%7E%7E", defaults).map(w => w.site.id), ["site-b"]);
});

test("Compare, Kit Aula and Apresentar are wired to the same scenario contract", () => {
  const read = name => readFileSync(new URL("../screens/" + name, import.meta.url), "utf8");
  const compare = read("compare.tsx"), activity = read("activity.tsx"), present = read("present.tsx");
  assert.ok(compare.includes('hrefTo("activity.html") + "#" + buildHash({ sc: list })'));
  assert.ok(activity.includes("classroomWindows(doc.sites, location.hash, getState())"));
  assert.ok(activity.includes("u.hash = buildHash({ sc: chosenWindows.map("));
  assert.ok(present.includes("classroomWindows(doc.sites, location.hash, st)"));
  assert.ok(present.includes("apiWindowMetrics(doc, w.site, w.start, w.hours || 336)"));
  assert.ok(present.includes('hrefTo("activity.html") + location.hash'));
});

test("Projector UTC windows distinguish the same site at different times", () => {
  const first = classroomWindowLabel({ start: "2026-11-15T12:00:00Z", hours: 24 });
  const later = classroomWindowLabel({ start: "2026-11-16T09:00:00-03:00", hours: 48 });
  assert.deepEqual(first, { startUtc: "2026-11-15 12:00", hours: 24 });
  assert.deepEqual(later, { startUtc: "2026-11-16 12:00", hours: 48 });
  assert.notEqual(first.startUtc, later.startUtc);
});
test("Unknown start remains explicitly unspecified, not a fabricated UTC date", () => {
  assert.deepEqual(classroomWindowLabel({ start: null, hours: null }), { startUtc: null, hours: 336 });
});
test("Projector shows each scenario UTC window in PT and EN", () => {
  const read = name => readFileSync(new URL("../screens/" + name, import.meta.url), "utf8");
  const tsx = read("present.tsx"), js = read("present.js"), css = read("present.css");
  assert.match(tsx, /classroomWindowLabel\(chosenWindows\[idx\]\)/);
  assert.match(js, /classroomWindowLabel\(chosenWindows\[idx\]\)/);
  assert.match(tsx, /class="mp-sc-window"/);
  assert.match(js, /class: "mp-sc-window"/);
  assert.match(tsx, /Janela UTC: \{start\}/);
  assert.match(tsx, /UTC window: \{start\}/);
  assert.match(css, /\.mp-sc-window/);
});
