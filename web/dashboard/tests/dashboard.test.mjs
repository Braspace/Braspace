import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "../serve.mjs";
import * as D from "../dashboard.js";

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=await readFile(path.join(dir,"index.html"),"utf-8");
const css=await readFile(path.join(dir,"dashboard.css"),"utf-8");
const js=await readFile(path.join(dir,"dashboard.js"),"utf-8");

// fake API that returns the documented shapes; used through the real preview server
const fake=http.createServer((req,res)=>{
 const j=(c,o)=>{res.writeHead(c,{"content-type":"application/json"});res.end(JSON.stringify(o))};
 if(req.url==="/readyz")return j(200,{status:"ready",science_status:"UNVERIFIED_INPUTS"});
 if(req.url==="/v1/capabilities")return j(200,{naif_spice_loaded:false,nasa_lola_loaded:false,scientifically_validated:false,version:"v-test"});
 if(req.url==="/api/sites")return j(200,{sites:[{id:"s1",name:"Site One",kind:"synthetic_test_fixture",series:{start_utc:"2026-12-01T00:00:00Z",end_utc:"2027-01-01T00:00:00Z",step_seconds:3600,science_status:"SYNTHETIC",observer_height_m:2}}]});
 j(404,{error:"x",code:"X"});
});
await new Promise(r=>fake.listen(0,"127.0.0.1",r));
const dash=createServer("http://127.0.0.1:"+fake.address().port);
await new Promise(r=>dash.listen(0,"127.0.0.1",r));
const base="http://127.0.0.1:"+dash.address().port;
after(()=>{fake.close();dash.close()});

test("page has no hard-coded metric number and no fixed badge state",()=>{
 const body=html.replace(/<head>[\s\S]*?<\/head>/,"").replace(/<script[\s\S]*?<\/script>/g,"");
 // every metric holder starts as the em dash
 for(const m of body.matchAll(/data-metric="[^"]+">([^<]*)</g))assert.equal(m[1],"—");
 for(const m of body.matchAll(/class="val"><span[^>]*>([^<]*)</g))assert.equal(m[1],"—");
 assert.match(body,/id="donut-pct">—</);
 assert.doesNotMatch(body,/\d+(\.\d+)?\s*(Wh|kg|%)/);
 for(const word of["SYNTHETIC","UNVERIFIED","VALIDATED","readyz: ready","NAIF"])assert.ok(!body.includes(word),"fixed badge text: "+word);
 // the only permanent badge is the no-flight one
 assert.match(body,/id="b-flight"[^>]*>No flight recommendation</);
 assert.doesNotMatch(body,/fuel|combust/i);
 assert.doesNotMatch(js,/fuel|combust/i);
});
test("CSP, lang, labels, landmarks",async()=>{
 assert.match(html,/<html lang="en">/);
 assert.match(html,/Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'/);
 assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);assert.doesNotMatch(html,/ style="|\son\w+=/);
 for(const g of["Mission","Resources","Analysis","Data"])assert.ok(html.includes(">"+g+"<"),g);
 for(const id of html.matchAll(/<(?:input|select)[^>]*id="([^"]+)"/g))assert.ok(html.includes('for="'+id[1]+'"'),"no label for "+id[1]);
 for(const k of["<main","<nav","<header","<footer","skip"])assert.ok(html.includes(k),k);
 const r=await fetch(base+"/");assert.match(r.headers.get("content-security-policy"),/default-src 'none'/);
 assert.equal((await fetch(base+"/dashboard.js")).status,200);
 assert.equal((await fetch(base+"/x",{method:"POST"})).status,404);
});
test("dictionaries en and pt-BR have the same keys and every data-i18n key exists",()=>{
 assert.deepEqual(Object.keys(D.I18N.en).sort(),Object.keys(D.I18N["pt-BR"]).sort());
 for(const m of html.matchAll(/data-i18n="([^"]+)"/g))assert.ok(D.I18N.en[m[1]],m[1]);
 assert.equal(D.I18N.en.no_flight,"No flight recommendation");
});
test("missing values render as an em dash, never as 0",()=>{
 for(const v of[null,undefined,NaN,"3",Infinity,{}])assert.equal(D.fmtNum(v),"—");
 assert.equal(D.fmtNum(0),"0");assert.equal(D.fmtWith(undefined,"h"),"—");
 const c=D.viewFromCompare(null),o=D.viewFromOnboard(null);
 for(const v of Object.values(c).concat(Object.values(o)))assert.ok(v===null||Array.isArray(v)&&v.length===0,String(v));
 const noData=D.viewFromCompare({results:[{data_status:"NO_SERIES_DATA",site:{id:"x"}}]});
 assert.equal(noData.light,null);assert.equal(noData.earth,null);
 // consumables without crew: no numbers
 const u=D.viewFromOnboard({candidates:[{consumables:{status:"UNKNOWN",items:[]}}],onboard:{options:[]}});
 assert.equal(u.o2,null);assert.equal(u.rateSource,null);
});
test("badges come from the API payload",()=>{
 assert.deepEqual(D.readyBadge(null),{text:"API —",tone:"bad"});
 assert.equal(D.readyBadge({status:"ready",science_status:"UNVERIFIED_INPUTS"}).text,"readyz: ready · UNVERIFIED_INPUTS");
 assert.equal(D.readyBadge({status:"degraded"}).tone,"bad");
 assert.equal(D.capsBadge(null).text,"capabilities —");
 const k=D.capsBadge({naif_spice_loaded:false,nasa_lola_loaded:true,scientifically_validated:false});
 assert.equal(k.text,"NAIF no · LOLA yes · validated no");assert.equal(k.tone,"warn");
 assert.equal(D.capsBadge({}).text,"NAIF — · LOLA — · validated —");
 assert.equal(D.seriesBadge({id:"a",series:{science_status:"UNVERIFIED"}},null).text,"UNVERIFIED");
 assert.equal(D.seriesBadge({id:"a"},null).text,"NO_SERIES_DATA");
 assert.equal(D.seriesBadge({id:"a"},{data_status:"OUTSIDE_COVERAGE"}).text,"OUTSIDE_COVERAGE");
 assert.equal(D.seriesBadge({id:"a",series:{science_status:"SYNTHETIC"}},{data_status:"AVAILABLE",science_status:"SYNTHETIC"}).tone,"warn");
});
test("view models use the real field names of the OpenAPI",()=>{
 const c=D.viewFromCompare({limitations:["l"],results:[{data_status:"AVAILABLE",science_status:"SYNTHETIC",engine_science_status:"UNVERIFIED_INPUTS",provenance:{generator:"g"},evaluation:{metrics:{sample_count:10,step_hours:2,sun_visible_fraction:0.25,earth_visible_fraction:0.5,longest_continuous_dark_hours:7,longest_continuous_comm_gap_hours:9}}}]});
 assert.equal(c.total,20);assert.equal(c.light,5);assert.equal(c.dark,15);assert.equal(c.earth,10);assert.equal(c.longestDark,7);assert.equal(c.gap,9);
 const o=D.viewFromOnboard({combined_decision:{status:"NO_CANDIDATE_MEETS_ALL_ASSUMED_LIMITS"},candidates:[{science_status:"SYNTHETIC",consumables:{status:"OK",rate_source:"cite",items:[{resource:"oxygen",remaining_at_end_kg:4,margin_hours:5},{resource:"food",remaining_at_end_kg:6,margin_hours:-7}],risks:[]}}],onboard:{science_status:"UNVERIFIED_INPUTS",options:[{end_mode:"POWER_LOSS",metrics:{minimum_charge_wh:0,final_charge_wh:1,total_unserved_energy_wh:2},risks:[{category:"ENERGY_LOSS",severity:"CRITICAL",measured:2,allowed:0,unit:"Wh",explanation:"e"}]}]}});
 assert.equal(o.minCharge,0);assert.equal(o.o2,4);assert.equal(o.foodm,-7);assert.equal(o.rateSource,"cite");assert.equal(o.alarms.length,1);
 assert.equal(D.alarmLine(o.alarms[0]),"[CRITICAL] ENERGY_LOSS: 2\u00a0Wh / 0\u00a0Wh");
 assert.equal(D.alarmLine({severity:"HIGH",category:"X"}),"[HIGH] X: — / —");
});
test("request builder never defaults an empty input",()=>{
 assert.deepEqual(D.buildBody({site:"s",start:"",dur:"5"}),{error:"window"});
 assert.deepEqual(D.buildBody({site:"s",start:"2026-12-01T00:00:00Z",dur:"abc"}),{error:"window"});
 const a=D.buildBody({site:"s",start:"2026-12-01T00:00:00Z",dur:"48",cap:"",init:"",res:"",solar:"",load:"",blackout:""});
 assert.equal(a.onboard,null);assert.equal(a.compare.duration_hours,48);
 const full={site:"s",start:"2026-12-01T00:00:00Z",dur:"48",blackout:"24",cap:"10",init:"9",res:"1",solar:"3",load:"2"};
 const b=D.buildBody(full);assert.equal(b.onboard.crew,undefined);assert.equal(b.onboard.power.load_w,2);
 const c=D.buildBody({...full,size:"2",o2:"1",food:"2",o2r:"0.8",foodr:"1.7",reserve:"0",source:"cite"});assert.equal(c.onboard.crew.size,2);assert.equal(c.onboard.crew.rate_source,"cite");
 assert.equal(D.buildBody({...full,size:"2",o2:"1",food:"2",o2r:"0.8",foodr:"1.7",reserve:"0",source:""}).onboard.crew,undefined,"no citation, no crew");
});
test("no API: the preview server answers 502 and no number can be built",async()=>{
 const dead=createServer("http://127.0.0.1:1");await new Promise(r=>dead.listen(0,"127.0.0.1",r));
 const b="http://127.0.0.1:"+dead.address().port;
 for(const p of["/api/sites","/readyz","/v1/capabilities"]){const r=await fetch(b+p);assert.equal(r.status,502)}
 dead.close();
 assert.equal(D.readyBadge(null).tone,"bad");assert.equal(D.viewFromCompare(null).light,null);
});
test("badge inputs reach the page through the preview server unchanged",async()=>{
 const r=await (await fetch(base+"/readyz")).json();assert.equal(D.readyBadge(r).text,"readyz: ready · UNVERIFIED_INPUTS");
 const k=await (await fetch(base+"/v1/capabilities")).json();assert.equal(D.capsBadge(k).title,"v-test");
 const s=await (await fetch(base+"/api/sites")).json();assert.equal(D.seriesBadge(s.sites[0],null).text,"SYNTHETIC");
});
test("WCAG AA contrast of text tokens in both themes (measured)",()=>{
 const grab=block=>Object.fromEntries([...block.matchAll(/--([a-z-]+):(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
 const light=grab(css.match(/:root\{[\s\S]*?color-scheme:light;\s*\}/)[0]);
 const dark=grab(css.match(/:root\[data-theme="dark"\]\{[\s\S]*?\}/)[0]);
 const media=grab(css.match(/@media\(prefers-color-scheme:dark\)\{[\s\S]*?color-scheme:dark\}\}/)[0]);
 assert.deepEqual(media,dark,"media dark and [data-theme=dark] must be identical");
 for(const [name,t] of [["light",light],["dark",dark]]){
  const pairs=[["ink","bg"],["ink","card"],["dim","bg"],["dim","card"],["amber","card"],["red","card"],["side-ink","side"],["side-dim","side"],["side-ink","side-active"],["side-dim","side-active"],
   ["good-ink","good-bg"],["warn-ink","warn-bg"],["bad-ink","bad-bg"],["neutral-ink","neutral-bg"]];
  for(const [f,b] of pairs){const c=D.contrast(t[f],t[b]);assert.ok(c>=4.5,name+" "+f+" on "+b+" = "+c.toFixed(2))}
  for(const [f,b] of [["focus","card"],["focus","bg"],["amber-fill","card"],["red-fill","card"]]){const c=D.contrast(t[f],t[b]);assert.ok(c>=3,name+" non-text "+f+" on "+b+" = "+c.toFixed(2))}
 }
});
test("the test fails with wrong code: a hard-coded metric would be caught",()=>{
 const bad=html.replace('data-metric="light">—<','data-metric="light">200<');
 const found=[...bad.matchAll(/data-metric="[^"]+">([^<]*)</g)].some(m=>m[1]!=="—");
 assert.ok(found);
});
