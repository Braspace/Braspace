#!/usr/bin/env node
// Real process integration: every documented OpenAPI operation is exercised
// through both the Go HTTP service and the same-origin web preview. Synthetic
// fixtures are engineering tests, never scientific validation. No NASA or
// pgvector network services are required by this default offline matrix.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {createServer} from "node:net";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiBinary = process.env.BRASPACE_E2E_API_BIN || "/tmp/braspace-e2e-api";
const rustBinary = process.env.BRASPACE_E2E_RUST_BIN ||
  join(root, "engine/target/debug/braspace-lunar-engine");
const children = [];
const diagnostics = [];
const coverage = new Map();

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const {port} = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function launch(command, args, options) {
  const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"], ...options});
  children.push(child);
  child.on("error", (e) => diagnostics.push(command + ": " + e.message));
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (bytes) => {
      diagnostics.push(command + ": " + bytes.toString().slice(0, 1000));
      if (diagnostics.length > 50) diagnostics.shift();
    });
  }
  return child;
}

async function waitUntilReady(base, pathname, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      const response = await fetch(base + pathname, {signal: AbortSignal.timeout(800)});
      if (response.status === 200) return;
    } catch { /* Service is booting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Timed out waiting for " + base + pathname + "\n" + diagnostics.join(""));
}

const fixture = name => readFile(join(root, name), "utf8");

try {
  const apiPort = await freePort();
  let webPort;
  do { webPort = await freePort(); } while (webPort === apiPort);
  const baseAPI = `http://127.0.0.1:${apiPort}`;
  const baseWeb = `http://127.0.0.1:${webPort}`;
  const spec = JSON.parse(await fixture("api/openapi.json"));
  const methods = new Set(["get", "post", "put", "delete", "patch", "head", "options", "trace"]);
  const expectedOps = new Set(Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.keys(operations).filter(method => methods.has(method)).map(method => `${method.toUpperCase()} ${path}`)));
  const apiChild = launch(apiBinary, [], {
    cwd: join(root, "api"),
    // This lane intentionally exercises embedded storage and disabled optional
    // vector metadata; dedicated Compose tests cover PostgreSQL/pgvector.
    env: {...process.env, LISTEN_ADDR: `127.0.0.1:${apiPort}`, RUST_ENGINE_BIN: rustBinary,
      DATABASE_URL: "", VECTOR_DATABASE_URL: "", BRASPACE_VECTOR_ENABLED: "0"}
  });
  await waitUntilReady(baseAPI, "/readyz", apiChild);
  const webChild = launch(process.execPath, ["web/dev-server.mjs"], {
    cwd: root, env: {...process.env, BRASPACE_WEB_PORT: String(webPort), BRASPACE_API_PORT: String(apiPort)}
  });
  await waitUntilReady(baseWeb, "/", webChild);

  async function both(operation, pathname, expected, {body, contentType = "application/json", as = "json"} = {}) {
    const [method, template] = operation.split(" ");
    assert.ok(expectedOps.has(operation), `undocumented fixture: ${operation}`);
    assert.ok(spec.paths[template][method.toLowerCase()].responses[String(expected)] ||
      spec.paths[template][method.toLowerCase()].responses.default, `undocumented response ${expected}: ${operation}`);
    const results = [];
    for (const [lane, base] of [["api", baseAPI], ["web", baseWeb]]) {
      const response = await fetch(base + pathname, {
        method, headers: body === undefined ? {} : {"Content-Type": contentType}, body,
        signal: AbortSignal.timeout(30000), redirect: "error"
      });
      const text = await response.text();
      assert.equal(response.status, expected, `${lane} ${operation} (${pathname}): ${text.slice(0, 500)}`);
      const expectedType = as === "html" ? /text\/html/ : as === "text" ? /text\/plain/ : /application\/json/;
      assert.match(response.headers.get("content-type") || "", expectedType,
        `${lane} ${operation} content type`);
      results.push(as === "json" ? JSON.parse(text) : text);
      if (!coverage.has(operation)) coverage.set(operation, new Set());
      coverage.get(operation).add(lane);
      console.log("PASS", lane, method, pathname, response.status);
    }
    assert.deepEqual(results[1], results[0], `${operation}: web proxy must preserve backend response`);
    return results[1];
  }

  const health = await both("GET /api/health", "/api/health", 200);
  assert.equal(health.engine, "ready");
  assert.equal(health.status, "ok");
  const live = await both("GET /healthz", "/healthz", 200);
  assert.equal(live.status, "alive");
  const ready = await both("GET /readyz", "/readyz", 200);
  assert.equal(ready.status, "ready");
  const caps = await both("GET /v1/capabilities", "/v1/capabilities", 200);
  assert.equal(caps.nasa_lola_loaded, false);
  assert.equal(caps.naif_spice_loaded, false);
  assert.equal(caps.scientifically_validated, false);

  const openapi = await both("GET /api/openapi.json", "/api/openapi.json", 200);
  assert.deepEqual(openapi, spec, "running API must expose the checkout's OpenAPI document");
  const sites = await both("GET /api/sites", "/api/sites", 200);
  assert.ok(Array.isArray(sites.sites) && sites.sites.length >= 3);
  assert.ok(sites.sites.some(s => s.id === "synthetic-demo-a"));
  const site = await both("GET /api/sites/{id}", "/api/sites/synthetic-demo-a", 200);
  assert.equal(site.site.id, "synthetic-demo-a");
  assert.equal((await both("GET /api/sites/{id}", "/api/sites/atlantis", 404)).code, "SITE_NOT_FOUND");
  const sky = await both("GET /api/sites/{id}/sky", "/api/sites/synthetic-demo-a/sky?start=2026-12-01T00%3A00%3A00Z&hours=1", 200);
  assert.equal(sky.site_id, "synthetic-demo-a");
  assert.equal(sky.science_status, "SYNTHETIC");
  assert.equal(sky.scientifically_validated, false);
  assert.ok(sky.samples.length > 0 && sky.terrain_horizon.length >= 2);
  assert.equal((await both("GET /api/sites/{id}/sky", "/api/sites/atlantis/sky", 404)).code, "SITE_NOT_FOUND");
  const media = await both("GET /api/sites/{id}/media", "/api/sites/malapert-massif/media", 200);
  assert.ok(Array.isArray(media.media));
  assert.ok(media.media.length > 0 && media.media.every(m => m.illustrative_only === true));
  assert.equal((await both("GET /api/sites/{id}/media", "/api/sites/atlantis/media", 404)).code, "SITE_NOT_FOUND");

  const layers = await both("GET /api/layers", "/api/layers", 200);
  assert.ok(Array.isArray(layers.layers) && layers.layers.length > 0);
  const layer = await both("GET /api/layers/{id}", "/api/layers/lroc-color-2k", 200);
  assert.equal(layer.layer.id, "lroc-color-2k");
  assert.equal(layer.layer.scientific_role, "visualization_only");
  assert.equal((await both("GET /api/layers/{id}", "/api/layers/no-such-layer", 404)).code, "LAYER_NOT_FOUND");
  // Deliberately use the registered external-only layer. The asset-success
  // download/checksum paths are tested by Go with a controlled upstream.
  // A network call to NASA is not a requirement for offline CI.
  const notProxied = await both("GET /api/layers/{id}/asset", "/api/layers/lola-ldem-80s-80m/asset", 404);
  assert.equal(notProxied.code, "LAYER_NOT_PROXIED");
  assert.equal((await both("GET /api/layers/{id}/asset", "/api/layers/no-such-layer/asset", 404)).code, "LAYER_NOT_FOUND");

  const compare = await both("POST /api/compare", "/api/compare", 200,
    {body: await fixture("examples/mission/compare.request.json")});
  assert.equal(compare.scientifically_validated, false);
  assert.ok(compare.results.some(row => row.data_status === "AVAILABLE"));
  const delay = await both("POST /api/scenarios/delay", "/api/scenarios/delay", 200,
    {body: await fixture("examples/mission/scenario-delay.request.json")});
  assert.equal(delay.scientifically_validated, false);
  assert.ok(delay.options.length > 0);

  const onboardFixture = await fixture("examples/onboard/mission.synthetic.request.json");
  const onboard = await both("POST /api/onboard/evaluate", "/api/onboard/evaluate", 200, {body: onboardFixture});
  assert.equal(onboard.science_status, "UNVERIFIED_INPUTS");
  const siteFixture = await fixture("examples/mission/onboard-site-evaluate.request.json");
  const siteOnboard = await both("POST /api/onboard/site-evaluate", "/api/onboard/site-evaluate", 200, {body: siteFixture});
  assert.equal(siteOnboard.scientifically_validated, false);
  const report = await both("POST /api/onboard/report", "/api/onboard/report", 200, {body: onboardFixture, as: "html"});
  assert.match(report, /UNVERIFIED|NOT FLIGHT|SYNTHETIC/i);
  const siteReport = await both("POST /api/onboard/site-report", "/api/onboard/site-report", 200, {body: siteFixture, as: "html"});
  assert.match(siteReport, /UNVERIFIED|NOT FLIGHT|SYNTHETIC/i);

  const visibility = await both("POST /v1/visibility", "/v1/visibility", 200,
    {body: await fixture("examples/visibility.synthetic.json")});
  assert.equal(visibility.science_status, "UNVERIFIED_INPUTS");
  assert.equal(visibility.sun_visible, true);
  assert.equal(visibility.earth_visible, false);
  const vectorStatus = await both("GET /api/vector/status", "/api/vector/status", 200);
  assert.equal(vectorStatus.enabled, false);
  assert.equal(vectorStatus.available, false);
  assert.equal(vectorStatus.dimension, 384);
  assert.equal(vectorStatus.scientifically_validated, false);
  const vector = await both("POST /api/vector/search", "/api/vector/search", 503,
    {body: JSON.stringify({model_id: "e2e-disabled", vector: Array.from({length: 384}, () => 1), limit: 1})});
  assert.equal(vector.code, "VECTOR_UNAVAILABLE");

  // Verify malformed JSON is rejected by every non-optional POST operation.
  // Vector's disabled state short-circuits validation by contract, covered above.
  for (const pathname of ["/api/compare", "/api/scenarios/delay", "/api/onboard/evaluate", "/api/onboard/site-evaluate", "/api/onboard/site-report", "/v1/visibility"]) {
    const invalid = await both(`POST ${pathname}`, pathname, 400, {body: "{"});
    assert.equal(typeof invalid.error, "string");
  }
  // Older standalone printable report uses http.Error and text/plain for
  // malformed JSON; OpenAPI documents the status but no error-body schema.
  const invalidReport = await both("POST /api/onboard/report", "/api/onboard/report", 400, {body: "{", as: "text"});
  assert.match(invalidReport, /invalid JSON/i);

  assert.deepEqual(new Set(coverage.keys()), expectedOps, "every OpenAPI operation requires an explicit E2E case");
  for (const operation of expectedOps) {
    assert.deepEqual(coverage.get(operation), new Set(["api", "web"]), `${operation}: missing test lane`);
  }
  console.log(`PASS fullstack: ${expectedOps.size}/${expectedOps.size} OpenAPI operations through direct Go/Rust and web proxy; synthetic/offline only`);
} catch (error) {
  console.error("FAIL fullstack:", error.stack || error);
  console.error("Process diagnostics:", diagnostics.join(""));
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}
