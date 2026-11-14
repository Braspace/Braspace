import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {latLonToPixel,pixelToLatLon,labelBox,countGraticuleCrossings,chooseLabelPlacement} from "../polar-map.js";

const meta=JSON.parse(await readFile(new URL("../assets/polar-elevation-87s.json",import.meta.url),"utf8"));

test("pole maps to image centre",()=>{
 const p=latLonToPixel(meta,-90,0);
 assert.ok(Math.abs(p.col-(meta.width_px-1)/2)<1e-9);
 assert.ok(Math.abs(p.row-(meta.height_px-1)/2)<1e-9);
});
test("JS transform equals the LOLA DEM pixel for Shackleton Rim (R04)",()=>{
 const lat=-89.7668,lon=-171.87,R=1737400;
 const rho=2*R*Math.tan((90+lat)*Math.PI/360);
 const demCol=rho*Math.sin(lon*Math.PI/180)/80+3799.5, demRow=-rho*Math.cos(lon*Math.PI/180)/80+3799.5;
 const p=latLonToPixel(meta,lat,lon);
 assert.ok(Math.abs(2*p.col+meta.source.dem_crop_zero_indexed.first_col+0.5-demCol)<0.01);
 assert.ok(Math.abs(2*p.row+meta.source.dem_crop_zero_indexed.first_row+0.5-demRow)<0.01);
 const q=pixelToLatLon(meta,p.col,p.row);
 assert.ok(Math.abs(q.lat-lat)<1e-9&&Math.abs(q.lon-lon)<1e-9);
});
test("component wording says elevation and credits NASA/GSFC/LOLA",async()=>{
 const src=await readFile(new URL("../polar-map.js",import.meta.url),"utf8");
 assert.match(src,/Elevation \(meters\)/);
 assert.match(src,/NASA\/GSFC\/LOLA/);
 assert.doesNotMatch(src.replace(/do not show light or Earth visibility/,""),/illuminat|sunlit|visibilit/i);
});
test("square corners lie outside 87°S, so the component crops to a circle at the edge",async()=>{
 const corner=pixelToLatLon(meta,-0.5,-0.5);
 assert.ok(corner.lat>meta.latitude_edge_deg, `corner ${corner.lat}`);
 const src=await readFile(new URL("../polar-map.js",import.meta.url),"utf8");
 assert.match(src,/clipPath/);
 assert.match(src,/resampled from/);
 assert.equal(meta.source.meters_per_pixel_native,80);
});

test("site labels avoid crossing graticule meridians and parallels (BR106)", () => {
  const sites = [
    { name: "Faustini Rim A", lat: -88.1, lon: 90.0 },
    { name: "Connecting Ridge Extension", lat: -89.08, lon: -101.0 },
    { name: "de Gerlache Rim 2", lat: -88.25, lon: -58.0 },
  ];
  const faustiniP = latLonToPixel(meta, sites[0].lat, sites[0].lon);
  const oldBox = labelBox(sites[0].name, faustiniP, -11, 4, "end");
  assert.ok(countGraticuleCrossings(oldBox, meta) > 0, "old Faustini Rim A placement crossed 90°E");

  for (const s of sites) {
    const p = latLonToPixel(meta, s.lat, s.lon);
    const chosen = chooseLabelPlacement(s.name, p, meta);
    assert.equal(chosen.hits, 0, `${s.name} still crosses graticule: ${JSON.stringify(chosen)}`);
  }
});
