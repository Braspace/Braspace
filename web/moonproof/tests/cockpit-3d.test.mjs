import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { polarSiteCoordinates, siteReliefHeight, clampDistance, siteChoices, visibleMarker } from '../screens/cockpit-3d.js';
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

test('site choices retain all catalogue sites including map-only locations, without duplicate or blank IDs', () => {
  assert.deepEqual(siteChoices([{id:'shackleton',name:'Shackleton',n:1},{id:'map-only',lat:12,lon:20},{id:'shackleton',name:'Duplicate'},{id:''}]), [
    {id:'shackleton',label:'1 · Shackleton'},{id:'map-only',label:'map-only'}
  ]);
  const cockpit = readFileSync(new URL('../screens/cockpit-3d.tsx', import.meta.url), 'utf8');
  assert.match(cockpit, /<select class="mp-cockpit-3d-site"/);
  assert.match(cockpit, /onChange=\{e => selectSite\(e.currentTarget.value\)\}/);
  assert.match(cockpit, /handle.select\(id\); options.onSelect\(id\)/);
  assert.match(cockpit, /<details class="mp-cockpit-3d-camera"/);
});

test('only full visible marker hit areas are interactive; side panels, menus and off-screen markers are excluded', () => {
  const viewport={left:0,right:320,top:0,bottom:844};
  const marker={left:100,right:144,top:300,bottom:344};
  assert.equal(visibleMarker(marker,viewport,[]),true);
  assert.equal(visibleMarker(marker,viewport,[{left:0,right:104,top:200,bottom:500}]),false);
  assert.equal(visibleMarker(marker,viewport,[{left:144,right:300,top:200,bottom:500}]),true);
  assert.equal(visibleMarker({...marker,left:-1},viewport,[]),false);
  assert.equal(visibleMarker({...marker,bottom:850},viewport,[]),false);
  const cockpit = readFileSync(new URL('../screens/cockpit-3d.tsx', import.meta.url), 'utf8');
  assert.match(cockpit, /attributeFilter: \["data-ck-hidden"\]/);
  assert.match(cockpit, /if \(focused\) ui.querySelector<HTMLSelectElement>\("\.mp-cockpit-3d-site"\)\?\.focus\(\)/);
});
