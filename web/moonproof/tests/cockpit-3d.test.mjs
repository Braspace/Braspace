import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { polarSiteCoordinates, siteReliefHeight, clampDistance } from '../screens/cockpit-3d.js';
import { latLonToStereo, makeGrid } from '../../moon-hd/polar-math.js';

test('site anchors prefer registered stereo metres, use Joel polar conversion only if needed', () => {
  assert.deepEqual(polarSiteCoordinates({ id: 'known', stereo_x_m: 123, stereo_y_m: -456 }), [123, -456]);
  assert.deepEqual(polarSiteCoordinates({ id: 'known', lat: -87, lon: 90 }), latLonToStereo(-87, 90));
  assert.equal(polarSiteCoordinates({ id: 'none', lat: 12, lon: 90 }), null);
  assert.equal(polarSiteCoordinates({ id: 'invalid', stereo_x_m: Infinity, stereo_y_m: 5 }), null);
});

function grid(spacing, value) {
  return makeGrid({ nx: 10, ny: 10, spacing_m: spacing, origin_x_m: -spacing * 4.5, origin_y_m: -spacing * 4.5, scale_m: 1 }, new Int16Array(100).fill(value));
}
test('height uses registered inner grid and same smooth transition to wide grid', () => {
  const inner = grid(1000, 100), wide = grid(4000, 300);
  assert.equal(siteReliefHeight(inner, wide, 0, 0), 100);
  assert.equal(siteReliefHeight(inner, wide, 3200, 0), 200);
  assert.equal(siteReliefHeight(inner, wide, 5000, 0), 300);
  assert.equal(siteReliefHeight(null, wide, 0, 0), 300);
  assert.equal(siteReliefHeight(inner, wide, 21000, 0), null);
});

test('camera zoom is bounded; both cockpit and landing use the same ship model', () => {
  assert.equal(clampDistance(1), 32); assert.equal(clampDistance(400), 220); assert.equal(clampDistance(75), 75);
  const cockpit = readFileSync(new URL('../screens/cockpit-3d.tsx', import.meta.url), 'utf8');
  const landing = readFileSync(new URL('../../lab/scene.ts', import.meta.url), 'utf8');
  assert.match(cockpit, /createArtemisLander\(T\)/); assert.match(landing, /createArtemisLander\(THREE\)/);
  assert.match(cockpit, /createCap\(/); assert.match(cockpit, /shared\.realLight\.value = 0/);
  assert.match(cockpit, /illustrative Artemis lander/);
  const screen = readFileSync(new URL('../screens/cockpit.tsx', import.meta.url), 'utf8');
  const terrain = readFileSync(new URL('../core/terrain.ts', import.meta.url), 'utf8');
  assert.match(screen, /hdRelief: false/); assert.match(terrain, /if \(hdRelief && !RELIEF_2D\)/);
});
