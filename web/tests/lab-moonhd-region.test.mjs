// Heloísa Polar Lab region view draws Joel's Moon HD cap. Guards the frame identity and the scope rules.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {latLonToBodyFixed, R_REF} from "../lab/coords.js";

const scene = readFileSync(new URL("../lab/scene.ts", import.meta.url), "utf8");
const KM = 1000, R = R_REF / KM;
// lab/scene.ts toRegion and moon-hd/scene.ts CAP_MATRIX (polar km -> unit globe), toGlobe (body m -> globe km)
const toRegion = b => [b[0] / KM, (-b[2] - R_REF) / KM, b[1] / KM];
const capToUnitGlobe = ([x, y, z]) => [x / R, -y / R - 1, -z / R];
const globeKmToBody = ([x, y, z]) => [x * KM, -z * KM, y * KM];

test("cap polar frame equals the Lab region frame, so markers keep catalogue coordinates", () => {
  for (const [lat, lon, h] of [[-88.811, 123.69, 1640], [-89.9, 0, 0], [-85, -45, -3000], [-81, 200, 500]]) {
    const body = latLonToBodyFixed(lat, lon, R_REF + h);
    const region = toRegion(body);
    const back = globeKmToBody(capToUnitGlobe(region).map(v => v * R));
    back.forEach((v, i) => assert.ok(Math.abs(v - body[i]) < 1e-3, `axis ${i} at ${lat},${lon}: ${v} vs ${body[i]}`));
  }
  assert.match(scene, /cap\.mesh\.matrix\.identity\(\)/);
  assert.match(scene, /cap\.camPolar\.copy\(this\.camera\.position\)/);
});

test("Moon HD replaces only the natural relief at true scale; analysis layers keep the 400 m grid", () => {
  assert.match(scene, /const hd = natural && r\.exaggeration === 1 && this\.moonHD\?\.kind === "region"/);
  assert.match(scene, /r\.mesh\.visible = !hd/);
  assert.match(scene, /if \(exaggeration === 1\) void this\.loadRegionMoonHD\(scene\)/);
});

test("region cap skips software WebGL and keeps the shadow march affordable", () => {
  assert.match(scene, /isSoftwareRenderer\(/);
  assert.match(scene, /segments: 192, steps: 24/);
  assert.doesNotMatch(scene, /steps: 48/);
});
