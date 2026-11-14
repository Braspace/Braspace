import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const app=await readFile(path.join(root,"app.js"),"utf-8");
const html=await readFile(path.join(root,"index.html"),"utf-8");
const css=await readFile(path.join(root,"styles.css"),"utf-8");

// Minimal DOM: just enough to run app.js functions without a browser.
function makeDom(){
 const ids=new Map();
 const el=(id,extra={})=>{const e={id,hidden:false,textContent:"",dataset:{},children:[],classList:{toggle(){}},
  setAttribute(){},removeAttribute(){},focus(){e.focused=true},addEventListener(){},append(...c){e.children.push(...c)},replaceChildren(){e.children=[]},...extra};ids.set(id,e);return e};
 return {ids,el};
}
function loadApp(){
 const {ids,el}=makeDom();
 const panels=["explore","compare","recover","science","evidence"].map(n=>el("panel-"+n,{dataset:{panel:n}}));
 const buttons=["explore","compare","recover","science","evidence"].map(n=>({dataset:{view:n},classList:{toggle(){}},setAttribute(){},removeAttribute(){}}));
 for(const id of ["view-eyebrow","view-title","view-description","metric-battery","metric-dark","metric-earth","metric-risks","initial-state","compare-empty","recover-empty","recover-content","run-badge","scope-text","scenario-cards","risk-register","model-status","report","api-status"])el(id);
 const document={getElementById:id=>ids.get(id),createElement:()=>({children:[],append(...c){this.children.push(...c)},replaceChildren(){},classList:{}}),
  createTextNode:t=>({text:t}),
  querySelectorAll:sel=>sel==="[data-panel]"?panels:sel==="[data-view]"?buttons:[]};
 // Strip the top-level boot lines (listeners, await) and the import; keep every function.
 const src=app.split("\ndocument.querySelectorAll(\"[data-view]\").forEach(b=>b.addEventListener")[0];
 const ctx=vm.createContext({document,console,Number,Math,Date,String,Array,Object,Error,Intl,fetch:()=>{throw new Error("no network in tests")},Promise,JSON,URL,Blob:class{},setTimeout});
 vm.runInContext(src+"\n;globalThis.__t={showView,renderResult,breachText,state};",ctx);
 return {t:ctx.__t,ids,panels};
}

test("tab switch changes which panel is visible",()=>{
 const {t,panels}=loadApp();
 const visible=()=>panels.filter(p=>!p.hidden).map(p=>p.dataset.panel);
 for(const name of ["explore","compare","recover","science","evidence"]){
  t.showView(name);
  assert.deepEqual(visible(),[name],name);
 }
 t.showView("recover",true);
 assert.equal(panels.find(p=>p.dataset.panel==="recover").focused,true,"focus moves to the new panel");
 for(const n of ["explore","compare","recover","science","evidence"])assert.ok(html.includes("data-panel=\""+n+"\""),"missing panel "+n);
});

test("initial state says no scenario was evaluated and the button is in the first block",()=>{
 assert.ok(html.includes("No scenario evaluated yet"));
 assert.match(html,/id="run-top"/);
 assert.ok(html.indexOf("id=\"run-top\"")<html.indexOf("class=\"metrics\""),"button must come before the metrics");
 assert.ok(html.includes("NO SCENARIO RUN"));
 // metrics start empty, nothing precomputed in the HTML
 assert.equal((html.match(/<strong id="metric-[a-z]+">—<\/strong>/g)||[]).length,4);
});

test("breach reason (limit and measured value) comes from the API response",()=>{
 const {t,ids}=loadApp();
 const risk={category:"EARTH_GEOMETRIC_BLACKOUT",severity:"HIGH",measured:41,allowed:7,unit:"h",explanation:"x"};
 assert.match(t.breachText(risk),/measured 41 h exceeds limit 7 h/);
 assert.match(t.breachText({...risk,category:"ENERGY_RESERVE",measured:3,allowed:7}),/measured 3 h is below limit 7 h/);
 assert.match(t.breachText({...risk,measured:7,allowed:7}),/measured 7 h equals limit 7 h/);
 assert.match(t.breachText({category:"X"}),/no measured\/limit values/);
 const resp={science_status:"UNVERIFIED_INPUTS",options:[
  {id:"baseline",simulation_status:"CONSTRAINTS_BREACHED",risks:[risk],metrics:{minimum_charge_wh:650,longest_earth_obstruction_hours:41}},
  {id:"late",simulation_status:"CONSTRAINTS_BREACHED",risks:[{...risk,measured:53}],metrics:{minimum_charge_wh:650,longest_earth_obstruction_hours:53}}]};
 t.renderResult(resp);
 assert.equal(ids.get("initial-state").hidden,true);
 assert.match(ids.get("scope-text").textContent,/scenario “baseline” only \(2 evaluated\)/);
 assert.match(ids.get("scope-text").textContent,/late: .*53 h/);
 const text=JSON.stringify(ids.get("scenario-cards").children.map(function walk(c){return c.children?c.children.map(walk):c.textContent||c.text}));
 assert.match(text,/measured 41 h exceeds limit 7 h/);
 assert.match(text,/measured 53 h exceeds limit 7 h/);
});

test("no metric is computed in the browser from breach values",()=>{
 const fn=app.slice(app.indexOf("function breachText"),app.indexOf("function renderResult"));
 assert.doesNotMatch(fn,/[-+*\/]\s*Number|Math\./);
});

test("no CSS font-size below 12px",()=>{
 const sizes=[...css.matchAll(/font-size:([\d.]+)px/g)].map(m=>Number(m[1]));
 assert.ok(sizes.length>20);
 assert.deepEqual(sizes.filter(s=>s<12),[]);
});
