import test from "node:test";
import assert from "node:assert/strict";
import { loadSites, loadSeries, DATA_BASE } from "../core/data.js";
import { SiteSeries } from "../../lab/data.js";

test("sites catalogue shares an in-flight fetch, evicts a temporary failure, and retries without invented data", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    assert.equal(String(url), DATA_BASE + "sites.json");
    calls++;
    if (calls === 1) return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => ({
        science_status: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        note: "fixture",
        series_window: { start_utc: "2025-01-01T00:00:00Z" },
        generated_utc: "2026-11-15T00:00:00Z",
        features: [],
        sites: [{ id: "retry-catalogue", series: "sites/retry-catalogue" }]
      })
    };
  };
  try {
    const first = loadSites(), same = loadSites();
    assert.strictEqual(first, same, "concurrent callers share the same request");
    const failed = await Promise.allSettled([first, same]);
    for (const item of failed) {
      assert.equal(item.status, "rejected");
      assert.match(item.reason.message, /sites.json 503/);
    }
    const recovered = await loadSites();
    assert.equal(recovered.status, "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED");
    assert.deepEqual(recovered.sites, [{ id: "retry-catalogue", series: "sites/retry-catalogue", n: 1 }]);
    assert.strictEqual(await loadSites(), recovered, "valid catalogue remains cached");
    assert.equal(calls, 2, "one failure plus one successful retry");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("site series shares pending requests and retries after a rejected load", async () => {
  const originalLoad = SiteSeries.load;
  const site = { id: "retry-series-fixture", series: "sites/retry-series-fixture" };
  const fixture = { start: 0, count: 2, sunMargin: [1, -1], earthMargin: [1, 1],
    meta: { series: { sha256: "fixture" } }, window: () => ({ status: "COMPUTED" }) };
  let calls = 0;
  SiteSeries.load = async url => {
    assert.equal(url, DATA_BASE + site.series);
    calls++;
    if (calls === 1) throw new Error("temporary download failure");
    return fixture;
  };
  try {
    const first = loadSeries(site), same = loadSeries(site);
    assert.strictEqual(first, same);
    const failed = await Promise.allSettled([first, same]);
    assert.ok(failed.every(item => item.status === "rejected"));
    assert.strictEqual(await loadSeries(site), fixture);
    assert.strictEqual(await loadSeries(site), fixture);
    assert.equal(calls, 2);
  } finally {
    SiteSeries.load = originalLoad;
  }
});
