// Moon HD viewer: pure geometry, data integrity and the local preview allowlist.
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer,moonHdFile} from "../dev-server.mjs";
import {decodeEphemeris,indexAt,timeAt,pointsAt,bodyDirection,toGlobeScene,toPolarScene,signedLon,elevationAtSouthPole,decodeOrientation,orientationAt,rotate,decodeSiteSeries,siteSkyAt} from "../moon-hd/ephemeris.js";
import {R_REF,CAP_LAT,stereoToLocal,localToStereo,localToScene,latLonToStereo,makeGrid,bilinearHeight,sunClearance} from "../moon-hd/polar-math.js";
import {latLonToBodyFixed,southStereoForward} from "../lab/coords.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const data=name=>readFile(path.join(root,"data/moonhd",name));
const manifest=JSON.parse(await data("manifest.json"));
const close=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg||""} ${a} vs ${b} (tol ${tol})`);

test("every published Moon HD file matches the manifest SHA-256 and size",async()=>{
 const names=Object.keys(manifest.files);
 assert.deepEqual(names.sort(),["color_4k.jpg","color_8k.jpg","earth_2k.jpg","earth_orientation.bin","ephemeris.bin","features.json","height_4k.jpg","normal_4k.jpg","south_pole_320m.bin","south_pole_80m.bin","stars_4k.jpg"]);
 for(const name of names){
  const bytes=await data(name);
  assert.equal(bytes.length,manifest.files[name].bytes,name);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),manifest.files[name].sha256,name);
 }
});

test("manifest keeps the honesty labels and the team's pinned NASA source hashes",()=>{
 assert.equal(manifest.science_status,"VISUAL_PRODUCT_NOT_INDEPENDENTLY_VALIDATED");
 assert.equal(manifest.nasa_certified,false);
 assert.equal(manifest.sources.ldem_80s_80m.sha256,"e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc");
 assert.equal(manifest.sources["de440s.bsp"].sha256,"c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2");
 for(const source of Object.values(manifest.sources))assert.match(source.url,/^https:\/\/(svs\.gsfc\.nasa\.gov|pds-geosciences\.wustl\.edu|naif\.jpl\.nasa\.gov|asc-planetarynames-data\.s3\.us-west-2\.amazonaws\.com|assets\.science\.nasa\.gov)\//);
});

test("local polar frame agrees with the body-fixed frame of web/lab/coords.js",()=>{
 for(const [lat,lon,h] of [[-90,0,0],[-89.4632,-137.49,1200],[-88.811,123.6901,-2500],[-87.5,45,3000],[-87.4,-90,0]]){
  const [x,y]=latLonToStereo(lat,lon),[a,b,c]=stereoToLocal(x,y,h);
  const [sx,sy]=southStereoForward(lat,lon);
  close(x,sx,1e-6,"stereo x");close(y,sy,1e-6,"stereo y");
  const [bx,by,bz]=latLonToBodyFixed(lat,lon,R_REF+h);
  // a = body +Y, b = body +X, c = outward at the south pole = -Z - R
  close(a,by,1e-3,"a");close(b,bx,1e-3,"b");close(c,-bz-R_REF,1e-3,"c");
  const back=localToStereo([a,b,c]);
  close(back.x,x,1e-3,"round trip x");close(back.y,y,1e-3,"round trip y");close(back.altitude,h,1e-3,"altitude");
  assert.deepEqual(localToScene([a,b,c]),[b/1000,c/1000,a/1000]);
 }
});

test("scene frames are right-handed images of the body-fixed frame",()=>{
 assert.deepEqual(toGlobeScene(bodyDirection(0,0)).map(v=>Math.round(v*1e9)/1e9),[1,0,-0]);
 assert.deepEqual(toGlobeScene(bodyDirection(90,0)).map(v=>Math.round(v*1e9)/1e9),[0,1,-0]);
 close(toGlobeScene(bodyDirection(0,90))[2],-1,1e-12,"east is -Z on the globe");
 const south=toPolarScene(bodyDirection(-90,0));
 close(south[1],1,1e-12,"south pole is up in the polar scene");
 close(toPolarScene(bodyDirection(0,90))[2],1,1e-12,"90E is +Z in the polar scene");
});

test("ephemeris: decoding, interpolation across the 0/360 seam and physical ranges",async()=>{
 const bytes=await data("ephemeris.bin");
 const eph=decodeEphemeris(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),manifest.ephemeris);
 assert.equal(eph.count,35064);
 assert.equal(indexAt(eph,Date.parse("2025-01-01T06:30:00Z")),6.5);
 assert.equal(indexAt(eph,0),0);assert.equal(indexAt(eph,Date.parse("2040-01-01T00:00:00Z")),eph.count-1);
 assert.equal(new Date(timeAt(eph,24)).toISOString(),"2025-01-02T00:00:00.000Z");
 let maxSun=0,maxEarthLat=0,maxEarthLon=0,previous=null;
 for(let i=0;i<eph.count;i+=7){
  const {sun,earth}=pointsAt(eph,i);
  maxSun=Math.max(maxSun,Math.abs(sun.lat));maxEarthLat=Math.max(maxEarthLat,Math.abs(earth.lat));maxEarthLon=Math.max(maxEarthLon,Math.abs(signedLon(earth.lon)));
  if(previous!==null){const step=((previous-sun.lon+540)%360)-180;assert.ok(step>3&&step<4,"Sun moves west about 3.5 deg per 7 h, got "+step);}
  previous=sun.lon;
 }
 // Lunar equator is inclined 1.54 deg to the ecliptic; optical librations stay under about 6.9 deg (lat) and 8.2 deg (lon).
 assert.ok(maxSun>1.4&&maxSun<1.7,"sub-solar latitude "+maxSun);
 assert.ok(maxEarthLat>6&&maxEarthLat<7,"libration in latitude "+maxEarthLat);
 assert.ok(maxEarthLon>7&&maxEarthLon<8.3,"libration in longitude "+maxEarthLon);
 const mid=pointsAt(eph,100.5),a=pointsAt(eph,100),b=pointsAt(eph,101);
 close(mid.sun.lat,(a.sun.lat+b.sun.lat)/2,1e-9);
 close(elevationAtSouthPole(-1.2),1.2,0);
});

test("ephemeris interpolation takes the short way around the longitude seam",()=>{
 const buffer=new ArrayBuffer(16),view=new DataView(buffer);
 view.setUint16(2,35990,true);view.setUint16(10,10,true); // 359.90 -> 0.10
 const eph=decodeEphemeris(buffer,{count:2,start_utc:"2025-01-01T00:00:00Z",step_seconds:3600});
 close(pointsAt(eph,0.5).sun.lon,0,1e-9);
 assert.throws(()=>decodeEphemeris(new ArrayBuffer(8),{count:2,start_utc:"2025-01-01T00:00:00Z",step_seconds:3600}));
});

test("80 m south-pole grid: centred, native spacing, Shackleton is a deep crater",async()=>{
 const bytes=await data("south_pole_80m.bin"),meta=manifest.south_pole;
 const grid=makeGrid(meta,new Int16Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)));
 assert.equal(meta.spacing_m,80);assert.equal(grid.half,81920);
 const sites=JSON.parse(await readFile(path.join(root,"data/sites.json"),"utf8"));
 const shackleton=sites.features.find(f=>f.id==="shackleton");
 const [x,y]=latLonToStereo(shackleton.lat,shackleton.lon);
 close(x,shackleton.stereo_x_m,1,"same stereographic convention as the site catalog");close(y,shackleton.stereo_y_m,1);
 // The catalog height comes from the team's 400 m block mean; the native pixel must be close to it.
 close(grid.heightAt(x,y),shackleton.centre_height_m,150,"Shackleton floor");
 const ridge=sites.sites.find(s=>s.id==="connecting-ridge");
 close(grid.heightAt(ridge.stereo_x_m,ridge.stereo_y_m),ridge.site_height_m,150,"Connecting Ridge");
 assert.ok(!grid.contains(200000,0));
 assert.throws(()=>makeGrid({...meta,origin_x_m:0},grid.dn));
});

// Cross-check of two independent computations on the same NASA inputs. The team series (science/three_site_pipeline.py)
// compares the Sun's elevation seen from the site (SPICE, spkcpo) with a 360-azimuth LOLA horizon. The viewer marches a
// ray over the 80 m grid toward the sub-solar direction. Agreement is not validation against an external reference.
test("shadow march agrees with the team's site series on whether the Sun centre is above the terrain",async()=>{
 const view=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 const grid=makeGrid(manifest.south_pole,new Int16Array(view(await data("south_pole_80m.bin"))));
 const wide=makeGrid(manifest.south_pole_wide,new Int16Array(view(await data("south_pole_320m.bin"))));
 const eph=decodeEphemeris(view(await data("ephemeris.bin")),manifest.ephemeris);
 for(const [id,floor] of [["connecting-ridge",0.95],["peak-near-shackleton",0.97]]){
  const meta=JSON.parse(await readFile(path.join(root,"data/sites",id+".json"),"utf8"));
  assert.equal(meta.series.start_utc,manifest.ephemeris.start_utc);assert.equal(meta.series.count,eph.count);
  const bin=new DataView(view(await readFile(path.join(root,"data/sites",id+".bin")))),n=eph.count,hz=meta.terrain_horizon;
  const horizon=az=>{const i=Math.floor(az)%360,f=az-Math.floor(az);return hz[i].el*(1-f)+hz[(i+1)%360].el*f;};
  const [x,y]=latLonToStereo(meta.site.latitude_deg,meta.site.longitude_deg);
  // Like for like: the series horizon stops at max_distance_m (100 km). The viewer itself marches 260 km, and at
  // Peak Near Shackleton that longer reach finds more shadow (docs/MOON_HD.md); that difference is not tested here.
  const reach=meta.provenance.ray_parameters.max_distance_m;
  assert.equal(reach,100000);
  let agree=0,compared=0,worst=0;
  for(let i=0;i<n;i+=37){
   const team=bin.getInt16(n*2+i*2,true)/100-horizon(bin.getUint16(i*2,true)/100);
   if(Math.abs(team)<0.3)continue; // within the solar disc radius of the horizon: the two samplings may differ
   const {sun}=pointsAt(eph,i);
   const mine=sunClearance(grid,x,y,meta.site.observer_height_m,toPolarScene(bodyDirection(sun.lat,sun.lon)),wide,144,reach)*180/Math.PI;
   compared++;if((team>0)===(mine>0))agree++;else worst=Math.max(worst,Math.abs(team));
  }
  assert.ok(compared>700,id+" compared "+compared);
  assert.ok(agree/compared>=floor,`${id}: ${agree}/${compared} agree, worst disagreement at ${worst.toFixed(2)} deg from the horizon`);
 }
});

test("wide 320 m grid: reaches the cap edge, agrees with the native grid, and the gazetteer names sit on it",async()=>{
 const view=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 const grid=makeGrid(manifest.south_pole,new Int16Array(view(await data("south_pole_80m.bin"))));
 const wide=makeGrid(manifest.south_pole_wide,new Int16Array(view(await data("south_pole_320m.bin"))));
 assert.equal(wide.spacing,320);assert.equal(wide.half,304000);
 const capRho=2*R_REF*Math.tan((CAP_LAT+90)*Math.PI/360);
 assert.ok(capRho+400<wide.half-wide.spacing,"cap mesh stays inside the raster");
 // A 4x4 block mean and the native pixels describe the same ground: compare on a coarse lattice inside the native grid.
 let worst=0,sum=0,n=0;
 for(let x=-70000;x<=70000;x+=3520)for(let y=-70000;y<=70000;y+=3520){
  let mean=0;for(let i=-1.5;i<=1.5;i++)for(let j=-1.5;j<=1.5;j++)mean+=grid.heightAt(x+i*80,y+j*80)/16;
  const d=Math.abs(bilinearHeight(wide,x,y)-mean);worst=Math.max(worst,d);sum+=d;n++;
 }
 assert.ok(sum/n<25&&worst<400,`mean ${sum/n} m, worst ${worst} m`);
 const doc=JSON.parse(await data("features.json")),names=doc.features.map(f=>f.name);
 for(const name of ["Shackleton","de Gerlache","Haworth","Shoemaker","Faustini","Nobile","Amundsen","Cabeus","Malapert","Mons Mouton","Mare Imbrium","Oceanus Procellarum"])assert.ok(names.includes(name),name);
 for(const f of doc.features){assert.ok(f.lon>=-180&&f.lon<=180&&f.lat>=-90&&f.lat<=90,f.name);assert.match(f.url,/^https:\/\/planetarynames\.wr\.usgs\.gov\/Feature\/\d+$/);}
 // Shackleton is a crater: its gazetteer centre must be far below its surroundings on the LOLA grid.
 const s=doc.features.find(f=>f.name==="Shackleton"),[sx,sy]=latLonToStereo(s.lat,s.lon);
 assert.ok(grid.heightAt(sx,sy)<-2000,"Shackleton floor "+grid.heightAt(sx,sy));
});

test("Earth orientation: unit quaternions that put the sub-Moon point where the Moon can be",async()=>{
 const view=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 const eph=decodeEphemeris(view(await data("ephemeris.bin")),manifest.ephemeris);
 const orientation=decodeOrientation(view(await data("earth_orientation.bin")),manifest.earth_orientation);
 assert.equal(orientation.count,eph.count);
 const inverse=([x,y,z,w])=>[-x,-y,-z,w];
 let maxLat=0,previous=null,drift=0,steps=0;
 for(let i=0;i<eph.count;i+=1){
  if(i>3000&&i%53)continue; // every hour for the first 125 days, then a sparse sweep of the four years
  const q=orientationAt(orientation,i),{earth}=pointsAt(eph,i);
  close(Math.hypot(...q),1,1e-9,"unit quaternion");
  // Moon -> Earth in the Moon frame, reversed, taken into the Earth frame: the point on Earth under the Moon.
  const toMoon=rotate(inverse(q),bodyDirection(earth.lat,earth.lon).map(v=>-v));
  const lat=Math.asin(toMoon[2])*180/Math.PI,lon=Math.atan2(toMoon[1],toMoon[0])*180/Math.PI;
  maxLat=Math.max(maxLat,Math.abs(lat));
  if(i<=3000){if(previous!==null){drift+=((lon-previous+540)%360)-180;steps++;}previous=lon;}
 }
 // The Moon's declination stays within about 28.7 deg (major standstill, 2024-2026); it crosses the sky westward once per 24.8 h.
 assert.ok(maxLat>27&&maxLat<29.2,"sub-Moon latitude reaches "+maxLat);
 close(drift/steps,-14.49,0.05,"sub-Moon longitude drift, deg per hour");
 // Interpolating half-way between two hourly samples stays a rotation and lies between them.
 const a=orientationAt(orientation,10),b=orientationAt(orientation,11),mid=orientationAt(orientation,10.5);
 const dot=(p,q)=>p[0]*q[0]+p[1]*q[1]+p[2]*q[2]+p[3]*q[3];
 assert.ok(dot(a,mid)>dot(a,b)&&dot(b,mid)>dot(a,b));
 assert.throws(()=>decodeOrientation(new ArrayBuffer(8),{count:2}));
});

test("site card reads the team series as stored: layout, horizon interpolation and margins",async()=>{
 const view=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 const sites=JSON.parse(await readFile(path.join(root,"data/sites.json"),"utf8")).sites;
 for(const site of sites){
  const meta=JSON.parse(await readFile(path.join(root,"data/sites",site.id+".json"),"utf8"));
  const series=decodeSiteSeries(view(await readFile(path.join(root,"data/sites",site.id+".bin"))),meta);
  assert.equal(series.startMs,Date.parse(manifest.ephemeris.start_utc));assert.equal(series.stepMs,3600000);
  // Recount "Sun centre above terrain" from the decoded samples: it must reproduce the catalog percentage.
  let sun=0,earth=0;
  for(let i=0;i<series.count;i++){const sky=siteSkyAt(series,i);if(sky.sun.margin>0)sun++;if(sky.earth.margin>0)earth++;
   if(i%5000===0){close(sky.sun.margin,sky.sun.el-sky.sun.horizon,1e-12);assert.ok(sky.sun.az>=0&&sky.sun.az<360&&Math.abs(sky.sun.el)<8);}}
  close(100*sun/series.count,site.metrics.sun_center_visible_pct,0.05,site.id+" Sun %");
  close(100*earth/series.count,site.metrics.earth_center_visible_pct,0.05,site.id+" Earth %");
 }
 assert.throws(()=>decodeSiteSeries(new ArrayBuffer(8),{series:{count:2,start_utc:"2025-01-01T00:00:00Z",step_seconds:3600},terrain_horizon:[]}));
});

test("viewer source parses and declares its limits in both languages",async()=>{
 for(const name of ["app.js","ephemeris.js","polar-math.js"])execFileSync(process.execPath,["--check",path.join(root,"moon-hd",name)]);
 const app=await readFile(path.join(root,"moon-hd/app.js"),"utf8"),html=await readFile(path.join(root,"moon-hd.html"),"utf8");
 for(const phrase of ["NOT VALIDATED","NÃO VALIDADO","not endorsed by NASA","Shadows are cast only by terrain inside that cap","This is not how the Moon is lit at this time","shapes and shadows are not at true scale"])assert.ok(app.includes(phrase),phrase);
 assert.ok(html.includes("Not a NASA product; not endorsed by NASA."));
 for(const id of ["color","light","relief","markers","exposure","time","site-card","site-go","site-close"])assert.ok(html.includes(`id="${id}"`),id);
 assert.ok(!/style=/.test(html),"CSP style-src 'self': no inline style attributes");
 assert.ok(!/<script(?![^>]*src=)/.test(html),"no inline scripts");
});

const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
after(()=>new Promise(resolve=>server.close(resolve)));

test("local preview serves the Moon HD page, modules and data, and nothing else there",async()=>{
 for(const [route,type] of [["/moon-hd.html","text/html"],["/moon-hd/app.js","text/javascript"],["/moon-hd/moon-hd.css","text/css"],
  ["/data/moonhd/manifest.json","application/json"],["/data/moonhd/south_pole_80m.bin","application/octet-stream"],["/data/moonhd/color_4k.jpg","image/jpeg"]]){
  const res=await fetch(base+route,{method:"HEAD"});
  assert.equal(res.status,200,route);assert.ok(res.headers.get("content-type").startsWith(type),route);
  assert.match(res.headers.get("content-security-policy"),/default-src 'none'/);
 }
 for(const route of ["/moon-hd/","/moon-hd/app.mjs","/moon-hd/sub/app.js","/moon-hd/APP.js","/moon-hd/app.js.map","/moon-hd.htm"])
  assert.equal(moonHdFile(route),null,route);
 assert.equal((await fetch(base+"/moon-hd/missing.js")).status,500);
});
