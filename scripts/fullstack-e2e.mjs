#!/usr/bin/env node
// Real process integration: web preview -> Go HTTP API -> Rust lunar engine.
// The fixtures are SYNTHETIC. Never treat this test as scientific validation.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiBinary = process.env.BRASPACE_E2E_API_BIN || "/tmp/braspace-e2e-api";
const rustBinary = process.env.BRASPACE_E2E_RUST_BIN ||
  join(root, "engine/target/debug/braspace-lunar-engine");
const baseAPI = "http://127.0.0.1:8080";
const baseWeb = "http://127.0.0.1:5173";
const children = [];
const diagnostics = [];

function launch(command, args, options) {
  const child = spawn(command, args, {stdio: ["ignore", "pipe", "pipe"], ...options});
  children.push(child);
  child.on("error", (e) => diagnostics.push(command + ": " + e.message));
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (bytes) => {
      const msg = bytes.toString();
      diagnostics.push(command + ": " + msg.slice(0, 1000));
      if (diagnostics.length > 50) diagnostics.shift();
    });
  }
  return child;
}

async function request(base, pathname, body = undefined) {
  const response = await fetch(base + pathname, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : {"Content-Type": "application/json"},
    body,
    signal: AbortSignal.timeout(15000),
    redirect: "error"
  });
  return response;
}

async function waitUntilReady(base, pathname) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(base + pathname, {signal: AbortSignal.timeout(800)});
      if (response.status === 200) return;
    } catch { /* Service is booting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Timed out waiting for " + base + pathname + "\n" + diagnostics.join(""));
}

async function mustJSON(base, pathname, expected, body) {
  const response = await request(base, pathname, body);
  assert.equal(response.status, expected, pathname + " status");
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  const json = await response.json();
  console.log("PASS", base === baseWeb ? "web" : "api", pathname, response.status);
  return json;
}

async function mustHTML(base, pathname, body) {
  const response = await request(base, pathname, body);
  assert.equal(response.status, 200, pathname + " status");
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /UNVERIFIED|NOT FLIGHT|SYNTHETIC/i);
  console.log("PASS web", pathname, response.status);
}

async function fixture(name) {
  return readFile(join(root, name), "utf8");
}

try {
  launch(apiBinary, [], {
    cwd: join(root, "api"),
    env: {...process.env, LISTEN_ADDR: "127.0.0.1:8080", RUST_ENGINE_BIN: rustBinary}
  });
  await waitUntilReady(baseAPI, "/readyz");
  launch(process.execPath, ["web/dev-server.mjs"], {
    cwd: root, env: {...process.env, BRASPACE_WEB_PORT: "5173"}
  });
  await waitUntilReady(baseWeb, "/");

  const health = await mustJSON(baseWeb, "/api/health", 200);
  assert.equal(health.engine, "ready");
  const capabilities = await mustJSON(baseAPI, "/v1/capabilities", 200);
  assert.equal(capabilities.nasa_lola_loaded, false);
  assert.equal(capabilities.naif_spice_loaded, false);
  assert.equal(capabilities.scientifically_validated, false);

  const sites = await mustJSON(baseWeb, "/api/sites", 200);
  assert.ok(Array.isArray(sites.sites) && sites.sites.length >= 3);
  const layers = await mustJSON(baseWeb, "/api/layers", 200);
  assert.ok(Array.isArray(layers.layers) && layers.layers.length > 0);
  const openapi = await mustJSON(baseWeb, "/api/openapi.json", 200);
  assert.match(openapi.openapi, /^3\./);
  const media = await mustJSON(baseWeb, "/api/sites/malapert-massif/media", 200);
  assert.ok(Array.isArray(media.media));
  const notProxied = await mustJSON(baseWeb, "/api/layers/lola-ldem-80s-80m/asset", 404);
  assert.equal(notProxied.code, "LAYER_NOT_PROXIED");

  const compareFixture = await fixture("examples/mission/compare.request.json");
  const directCompare = await mustJSON(baseAPI, "/api/compare", 200, compareFixture);
  const webCompare = await mustJSON(baseWeb, "/api/compare", 200, compareFixture);
  assert.deepEqual(webCompare, directCompare, "proxy must retain mission response exactly");
  assert.equal(webCompare.scientifically_validated, false);

  const delay = await mustJSON(baseWeb, "/api/scenarios/delay", 200,
    await fixture("examples/mission/scenario-delay.request.json"));
  assert.equal(delay.scientifically_validated, false);
  const standaloneOnboard = await mustJSON(baseWeb, "/api/onboard/evaluate", 200,
    await fixture("examples/onboard/mission.synthetic.request.json"));
  assert.equal(standaloneOnboard.science_status, "UNVERIFIED_INPUTS");
  const siteFixture = await fixture("examples/mission/onboard-site-evaluate.request.json");
  const siteOnboard = await mustJSON(baseWeb, "/api/onboard/site-evaluate", 200, siteFixture);
  assert.equal(siteOnboard.scientifically_validated, false);
  await mustHTML(baseWeb, "/api/onboard/report",
    await fixture("examples/onboard/mission.synthetic.request.json"));
  await mustHTML(baseWeb, "/api/onboard/site-report", siteFixture);
  console.log("PASS fullstack: Go/Rust + browser proxy + mission flows (synthetic only)");
} catch (error) {
  console.error("FAIL fullstack:", error.stack || error);
  console.error("Process diagnostics:", diagnostics.join(""));
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}
