import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=await readFile(path.join(root,"app.ts"),"utf-8");
const html=await readFile(path.join(root,"classic.html"),"utf-8");

test("sites with an ingested series use server-computed visibility",()=>{
 assert.match(app,/"\/api\/onboard\/site-evaluate"/);
 assert.match(app,/if\(site\?\.series\)/);
 // Browser-made samples stay limited to the labelled synthetic fallback.
 assert.equal((app.match(/trainingSamples\(/g)||[]).length,2);
});

test("crew consumables carry a rate source and the result names its data status",()=>{
 assert.match(app,/rate_source:CREW_RATES\.source/);
 assert.match(app,/verify against NASA BVAD/);
 assert.match(app,/COMPUTED FROM STORED SERIES · /);
 for(const id of ['id="crew"','id="o2"','id="food"'])assert.ok(html.includes(id),"missing "+id);
});

test("computed runs print the report with consumables",()=>{
 assert.match(app,/"\/api\/onboard\/site-report"/);
 assert.match(app,/state\.lastSiteRequest=null/);
});

test("risk counter includes consumable risks",()=>{
 assert.match(app,/consumables\?\.risks\?\.length/);
});
