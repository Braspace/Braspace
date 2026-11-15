// Mobile perf (perf/compare-recover-lazy): Compare and Replan paint the context bar and the loading state before any series
// (280 KB per site) is requested. Compare downloads only the sites of its visible scenarios; Replan downloads the chosen site
// first and runs the exit search (all sites) after the panels are on screen, at low priority, with "Searching exits…".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSeries } from "../core/data.js";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const HEAVY = new RegExp(String.raw`loadRegion\(|loadRegionHeader\(|loadSeries\(|loadAll\(|seriesOf\(|mountTerrain\(|mountMap\(|computeExits\(|apiCompareMetrics\(|apiDelayMetrics\(|metricsFor\(|^(?:const \w+ = )?draw\(\)|apiWindowMetrics\(|pgda_`, "m");

for (const name of ["compare", "recover"]) {
  const src = read(`../screens/${name}.tsx`);
  test(`${name}: the context is painted before any series, API figure or map starts`, () => {
    const sites = src.indexOf("await loadSites()"), paint = src.indexOf("paintContext();", sites), gate = src.indexOf("await afterPaint(document");
    assert.ok(sites > 0 && paint > sites && gate > paint, "loadSites → paintContext → afterPaint");
    const before = src.slice(sites, gate).split("\n").filter(l => !/^\s/.test(l) && !/^(function|async function|\/\/)/.test(l)).join("\n");
    assert.doesNotMatch(before, HEAVY, "no heavy load is started before the first paint");
    assert.doesNotMatch(before.replace("await loadSites()", ""), /\bawait\b/, "nothing else is awaited before the first paint");
    assert.match(src.slice(gate, gate + 400), /afterPaint\(document\.querySelector\("\.mp-ctx-text"\)\)/);
    assert.match(src, /mountTerrain\([^;]*progressive: true/, "the map draws its relief when the heights arrive");
    assert.match(src.slice(gate), /mountTerrain\(|mountMap\(/, "the map draws its relief when the heights arrive");
    assert.doesNotMatch(src, /loadAll/, "no screen-wide download of every site's series");
  });
}

test("compare: series are fetched per visible scenario, never for the whole catalogue", () => {
  const src = read("../screens/compare.tsx");
  assert.doesNotMatch(src, /doc\.sites\.map\(s => s\.id\)[^;]*seriesOf|seriesOf\([^)]*doc\.sites/, "no series of every site");
  assert.match(src, /function seriesOf\(id: string\)/);
  assert.equal((src.match(/seriesOf\(/g) || []).length, 3, "definition + chart series + static fallback of one scenario");
});

test("recover: the exit search runs after the panels are painted, at low priority, with a loading line in both languages", () => {
  const src = read("../screens/recover.tsx");
  const draw = src.indexOf("async function draw()");
  const firstPaint = src.indexOf("paint(cached)", draw), twoFrames = src.indexOf("await afterPaint(null)", draw);
  const all = src.indexOf('doc.sites.map(x => seriesOf(x.id, "low"))', draw), exits = src.indexOf("computeExits({", draw);
  assert.ok(draw > 0 && firstPaint > draw && twoFrames > firstPaint && all > twoFrames && exits > all, "paint → 2 frames → all series → computeExits");
  assert.equal((src.match(/computeExits\(/g) || []).length, 1, "a single computeExits call");
  assert.match(src, /siteIds: doc\.sites\.map\(x => x\.id\), startMs: t0, hours: sc\.hours, delayH: sc\.d, rules, searchDays: SEARCH_DAYS/, "same search arguments as before");
  assert.match(src, /"rec\.searching": "Searching exits…"/); assert.match(src, /"rec\.searching": "Buscando saídas…"/);
  assert.match(src, /\{!exits \? <p class="mp-label">\{t\("rec\.searching"\)\}<\/p> : null\}/);
});

test("loadSeries forwards the fetch priority (background series are low priority) and keeps one download per site", async () => {
  const old = globalThis.fetch, seen = [];
  try {
    globalThis.fetch = async (url, opts = {}) => { seen.push({ u: String(url), priority: opts.priority }); return new Response(readFileSync(new URL(String(url)))); };
    const site = { id: "lazy-test-site", series: "sites/mons-mouton-im2" };
    const [a, b] = await Promise.all([loadSeries(site, { priority: "low" }), loadSeries(site)]);
    assert.equal(a, b, "shared promise");
    assert.equal(seen.length, 2, "one .json + one .bin");
    assert.ok(seen.every(s => s.priority === "low"));
    const other = await loadSeries({ id: "lazy-test-site-2", series: "sites/mons-mouton-im2" });
    assert.ok(other); assert.equal(seen.at(-1).priority, undefined, "default calls keep the browser's own priority");
  } finally { globalThis.fetch = old; }
});
