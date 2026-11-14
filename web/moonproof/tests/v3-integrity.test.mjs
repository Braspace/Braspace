import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {moonproofFile} from "../../dev-server.mjs";

const root=resolve(import.meta.dirname,"..");
const read=p=>readFileSync(resolve(root,p),"utf8");

test("every original Heloisa screen and three classroom/planner kits is served by allowlist",()=>{
 for(const name of ["index","mission","explore","compare","recover","cockpit","landing","debrief","evidence","learn","plan","present","activity"]){
  const route="/moonproof/"+name+".html";
  assert.ok(moonproofFile(route),route);
  assert.match(read(name+".html"),/<!doctype html>/i);
 }
 for(const path of ["/moonproof/designer/A-mission-control.designer.mds","/moonproof/../../Dockerfile","/moonproof/screens/.env","/moonproof/screens/plan.js.backup"]){
  assert.equal(moonproofFile(path),null,path);
 }
});
test("specialized A-H scripts remain in place after branch reconciliation",()=>{
 const map={mission:"mission",explore:"explore",compare:"compare",recover:"recover",
  plan:"plan",present:"present",activity:"activity"};
 for(const [page,script] of Object.entries(map)){
  assert.ok(read(page+".html").includes("screens/"+script+".js"),"specialized screen script lost: "+page);
 }
 for(const page of ["cockpit","landing","debrief","evidence","learn"]){
  assert.ok(read(page+".html").includes("screens/workflow.js"),"additional screen must use source-gated adapter "+page);
 }
});
test("planning API parameters match typed OpenAPI and no fabricated onboard response is sent",()=>{
 const src=read("screens/plan.js");
 assert.match(src,/site_ids: scenarios\.map/);
 assert.match(src,/start_utc:/);
 assert.match(src,/duration_hours:/);
 assert.doesNotMatch(src,/body: \{ sites: scenarios/);
 assert.doesNotMatch(src,/max_night_h:/);
 assert.match(src,/const evals = scenarios\.map\(\(\) => \(\{ ok: false/);
 assert.match(src,/series\.index\(epoch\)/);
 assert.match(src,/series\.sunMargin\[i\]/);
 assert.match(src,/scientifically_validated: false/);
 assert.match(src,/textContent = location\.href/);
 assert.doesNotMatch(src,/id="plan-url">\$\{location\.href\}/);
});
test("all three-stage science cards retain preliminary rather than validated status",()=>{
 for(const p of ["core/data.js","screens/mission.js","screens/compare.js","screens/recover.js"]){
  const text=read(p);
  assert.doesNotMatch(text,/\bscience_status\s*:\s*["']VALIDATED["']/);
 }
 assert.match(read("core/data.js"),/PRELIMINARY/);
 assert.match(read("core/layers.js"),/createLayerCard/);
});
test("terrain-first presentation is backed by source grid with IAU labels, not example percentages",()=>{
 const terrain=read("core/terrain.js");
 assert.match(terrain,/loadRegion/);
 assert.match(terrain,/featureLabels/);
 assert.match(terrain,/false-colour|False-colour/);
 assert.match(terrain,/stereo_x_m/);
 assert.doesNotMatch(terrain,/71%|63%|46h|38h/);
});
