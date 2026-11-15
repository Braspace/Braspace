import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMission, serializeMission, labHref, moonHdHref, missionFromMultipage, warningText, DURATIONS_H } from "../ds/mission-context.js";
import { buildHash, parseHash, bordoURL } from "../ds/router.js";
import { pickedSites, scenarioQuery } from "../shell/views/common.js";

const sites = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url))).sites;
const siteIds = sites.map(s => s.id);
const window = { start: Date.parse("2025-01-01T00:00Z"), end: Date.parse("2028-12-31T23:00Z") };

test("round trip: serialize then parse returns the same context, no warnings", () => {
  for (const durationH of DURATIONS_H) {
    const ctx = { siteId: siteIds[1], t: Date.parse("2027-03-14T06:00Z"), durationH, layer: "proof", lang: "pt", origin: "shell" };
    const rec = serializeMission(ctx);
    assert.equal(rec.d, String(durationH / 24));
    const back = parseMission(new URLSearchParams(rec), { siteIds, window });
    assert.deepEqual(back.warnings, []);
    assert.deepEqual(back.ctx, ctx);
  }
});

test("unsupported values become explicit warnings, never a silent reset", () => {
  const { ctx, warnings } = parseMission({ site: "nope", t: "1990-01-01", d: "30", layer: "x", lang: "fr", from: "?" }, { siteIds, window });
  assert.deepEqual(warnings.map(w => w.key + ":" + w.reason), ["site:unknown-site", "t:outside-coverage", "d:unsupported-duration",
    "layer:unsupported-layer", "lang:unsupported-lang", "from:unsupported-from"]);
  assert.equal(ctx.siteId, null); assert.equal(ctx.durationH, 672);
  assert.match(warningText(warnings[2]), /d=30/);
  assert.equal(parseMission({ t: "garbage" }).warnings[0].reason, "invalid-time");
});

test("FE-02: 28 to 56 days changes the Terreno link, and the Lab hash carries site, t and d", () => {
  const sc = n => ({ site: sites[0], t0: Date.parse("2027-01-12T00:00Z"), hours: n * 24 });
  const href = buildHash("/terreno", scenarioQuery(sc(56)));
  assert.notEqual(href, buildHash("/terreno", scenarioQuery(sc(28))));
  const q = parseHash(href).query;
  assert.deepEqual([q.site, q.t, q.d], [sites[0].id, "2027-01-12T00:00Z", "56"]);
  const lab = labHref(parseMission(q, { siteIds, window }).ctx);
  const p = new URLSearchParams(lab.split("#")[1]);
  assert.deepEqual([p.get("site"), p.get("t"), p.get("d")], [sites[0].id, "2027-01-12T00:00Z", "56"]);
  assert.equal(labHref({}), "lab.html");
});

test("shell Terreno route, Explorar link and board link use the shared context", () => {
  assert.match(readFileSync(new URL("../shell/app.js", import.meta.url), "utf8"), /labHref\(m\)/);
  assert.match(readFileSync(new URL("../shell/views/explorar.js", import.meta.url), "utf8"), /"\/terreno", scenarioQuery\(sc\)/);
  assert.match(bordoURL("c.html", ["bordo"], { site: "s", t: "2027-01-01", d: "14" }), /d=14/);
});

test("Moon HD and multipage adapters carry the mission both ways", () => {
  const ctx = parseMission({ site: siteIds[2], t: "2027-02-01T00:00Z", d: "14", lang: "pt" }, { siteIds }).ctx;
  const u = new URL(moonHdHref(ctx), "http://x/");
  assert.deepEqual([u.searchParams.get("start"), u.searchParams.get("site"), u.searchParams.get("d"), u.searchParams.get("lang")], ["2027-02-01T00:00Z", siteIds[2], "14", "pt"]);
  const m = missionFromMultipage({ site: siteIds[2], start: "2027-02-01T00:00Z", hours: 336, lang: "pt-BR" });
  assert.deepEqual(m.warnings, []);
  assert.equal(m.ctx.durationH, 336); assert.equal(m.ctx.lang, "pt");
  assert.equal(missionFromMultipage({ hours: 50 }).warnings[0].key, "d");
});

test("FE-01: Comparar picks distinct sites for every initial site and every explicit combination", () => {
  const data = { sites };
  const ids = q => pickedSites(data, q).map(s => s.id);
  const distinct = a => assert.equal(new Set(a).size, a.length, a.join());
  for (const s of siteIds) {
    assert.equal(ids({ site: s })[0], s); distinct(ids({ site: s })); assert.equal(ids({ site: s }).length, 3);
    for (const L of ["a", "b", "c"]) for (const o of siteIds) {
      if (o === s) continue;
      const got = ids({ site: s, [L]: o }); distinct(got); assert.equal(got.length, 3);
    }
  }
});
