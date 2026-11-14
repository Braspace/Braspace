// BRASPACE MoonProof frontend. NASA-derived metrics are NEVER invented here.
// The training fixture below is explicitly synthetic; Go owns evaluation.
// GitHub Pages is static: its generated config.js rewrites fetch(), but
// three.js TextureLoader / GLTFLoader do not use that fetch wrapper.
// Provide the public API origin before bootGlobe() imports moon3d.js.
// Only our official Pages hostname gets this fallback; local/proxy and
// self-hosted deployments retain their own origin or explicit configuration.
if (globalThis.location?.hostname === "braspace.github.io" && !globalThis.BRASPACE_API_BASE) {
  globalThis.BRASPACE_API_BASE = "https://braspace-api.srv1898743.hstgr.cloud";
}
const byId = id => document.getElementById(id);
const fields = ["start","duration","delay","battery","initial","reserve","generation","load","blackout"];
const state = {sites:[],selected:null,globe:null,lastRequest:null,lastResponse:null,apiReady:false};
const views = {
 explore:["01 / EXPLORE","Look beyond a landing-site score","Select a sourced candidate region, orbit the Moon and understand its geographic context. The 3D texture is visual: terrain elevation, solar geometry and direct-to-Earth windows require verified NASA DEM and JPL ephemerides."],
 compare:["02 / COMPARE","Make every trade-off visible","Compare sites and mission constraints using separate sunlight, visibility, darkness and blackout metrics. Actual site comparisons become available when science-backed series are ingested; the current training comparison remains synthetic."],
 recover:["03 / RECOVER","What happens after a 48-hour delay?","Run two synthetic onboard scenarios through the Go backend: the baseline and a shifted arrival. Inspect battery reserve, longest darkness, Earth obstruction and causes of constraint violations. No actual lunar replan is asserted."],
 science:["04 / SCIENCE & ENGINEERING","One plan, two competing priorities","A science objective such as shadowed-terrain access must be negotiated against engineering requirements for power, communications and surface conditions. No universal mission score is assumed, and input limits are explicit."],
 evidence:["05 / EVIDENCE & LEARN","What do we really know?","The visual Moon uses NASA SVS imagery if available. Real landing conditions require LOLA DEM topography and SPICE direction computations. All current onboard training outputs remain UNVERIFIED_INPUTS; printing the evidence report preserves this warning."]
};
function setStatus(text){byId("api-status").textContent=text;}
const viewNames=Object.keys(views);
function showView(name,moveFocus){
 if(!views[name])name="explore";
 const v=views[name];
 document.querySelectorAll("[data-panel]").forEach(p=>{p.hidden=p.dataset.panel!==name;});
 state.view=name;
 byId("view-eyebrow").textContent=v[0];byId("view-title").textContent=v[1];byId("view-description").textContent=v[2];
 document.querySelectorAll("[data-view]").forEach(button=>{const yes=button.dataset.view===name;button.classList.toggle("active",yes);if(yes)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");});
 if(moveFocus)byId("panel-"+name)?.focus({preventScroll:false});
}
function inputNumber(name){const n=Number(byId(name).value);if(!Number.isFinite(n))throw new Error(name+" must be a finite number");return n;}
function utcDateInput(s){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))throw new Error("Use a complete UTC date and time.");
 const d=new Date(s+":00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,16)!==s)throw new Error("Invalid UTC date.");
 return d;
}
function trainingSamples(start,count) {
 // Training-only tutorial pattern. NOT a lunar ephemeris or LRO measurement.
 // It varies predictably with UTC to make an arrival delay change constraints.
 const origin=Date.UTC(2026,10,1,0,0,0);
 const offset=Math.round((start.getTime()-origin)/3600000);
 return Array.from({length:count},(_,i)=>{
  const t=offset+i;
  return {sun_visible:Math.sin(2*Math.PI*t/(29.5*24)+0.7)>0.25,
          earth_visible:Math.cos(2*Math.PI*t/(27.3*24)+1.2)>-0.35};
 });
}
// Consumption rates are placeholders until checked against NASA BVAD; the API
// requires a rate source and reports it with every result.
const CREW_RATES={o2:0.84,food:1.76,source:"Placeholder planning values (O2 0.84, food 1.76 kg/person/day); verify against NASA BVAD NASA/TP-2015-218570"};
function missionInputs(){
 const start=utcDateInput(byId("start").value);
 const duration=inputNumber("duration"),delay=inputNumber("delay");
 const capacity=inputNumber("battery"),initial=inputNumber("initial"),reserve=inputNumber("reserve"),
  generation=inputNumber("generation"),load=inputNumber("load"),blackout=inputNumber("blackout");
 if(![24,48,72].includes(duration)||![24,48,72].includes(delay))throw new Error("Select supported duration and delay.");
 if(capacity<=0||capacity>1e5||initial<0||initial>capacity||reserve<0||reserve>capacity)throw new Error("Battery charge and reserve must not exceed capacity.");
 if(generation<0||load<0||blackout<0||blackout>duration)throw new Error("Use valid positive power and blackout inputs (gap <= duration).");
 const power={battery_capacity_wh:capacity,initial_charge_wh:initial,reserve_wh:reserve,solar_generation_w:generation,load_w:load};
 return {start,duration,delay,blackout,power};
}
function crewInput(){
 const size=inputNumber("crew");
 if(size===0)return undefined;
 const o2=inputNumber("o2"),food=inputNumber("food");
 if(!Number.isInteger(size)||size<0||size>12||o2<0||food<0)throw new Error("Crew must be 0..12 people with non-negative stocks.");
 return {size,o2_stock_kg:o2,food_stock_kg:food,o2_kg_per_person_day:CREW_RATES.o2,food_kg_per_person_day:CREW_RATES.food,
  reserve_hours:12,aboard_during_delay:true,rate_source:CREW_RATES.source};
}
// Sites with an ingested series are evaluated from stored horizon/ephemeris
// data by the Go API (Rust engine), not from browser-made samples.
function siteRequest(site){
 const {start,duration,delay,blackout,power}=missionInputs();
 return {mission_id:"MoonProof "+site.id,start_utc:start.toISOString().replace(".000Z","Z"),duration_hours:duration,
  candidates:[{id:"baseline",site_id:site.id,delay_hours:0},{id:"delayed-plus-"+delay+"h",site_id:site.id,delay_hours:delay}],
  power,max_comm_blackout_hours:blackout,crew:crewInput()};
}
// Rebuild an onboard request from the computed timeline so the printable
// report (#72) documents exactly the samples that were evaluated.
function onboardRequestFrom(resp){
 return {mission_id:resp.onboard.mission_id,candidates:resp.onboard.options.map((o,i)=>{
  const c=resp.candidates[i];
  return {id:o.id,site_id:o.site_id,start_utc:o.start_utc,source_claim:o.source_claim_unverified,step_minutes:c.step_seconds/60,
   max_comm_blackout_hours:resp.request.max_comm_blackout_hours,power:resp.request.power,
   samples:o.timeline.map(t=>({sun_visible:t.sun_visible,earth_visible:t.earth_visible}))};
 })};
}
function buildRequest(){
 const {start,duration,delay,blackout,power}=missionInputs();
 const make=(id,epoch)=>({id,site_id:"SYNTHETIC-SOUTH-POLE-TRAINING",start_utc:epoch.toISOString().replace(".000Z","Z"),source_claim:"SYNTHETIC-NOT-NASA",step_minutes:60,max_comm_blackout_hours:blackout,power,samples:trainingSamples(epoch,duration)});
 const shifted=new Date(start.getTime()+delay*3600000);
 return {mission_id:"MoonProof synthetic mission resilience lesson",candidates:[make("baseline",start),make("delayed-plus-"+delay+"h",shifted)]};
}
function format(n,suffix){if(!Number.isFinite(Number(n)))return "—";return Number(n).toLocaleString("en-US",{maximumFractionDigits:2})+(suffix||"");}
function element(tag,className,content){
 const e=document.createElement(tag);if(className)e.className=className;if(content!==undefined)e.textContent=content;return e;
}
function rowText(parent,label,value){
 const p=element("p","");const strong=element("strong","",label+": ");p.append(strong,document.createTextNode(value));parent.append(p);
}
// Limit and value come straight from the API risk entry (measured/allowed/unit); nothing is computed here.
function breachText(risk){
 const has=v=>v!==undefined&&v!==null&&v!=="";
 const what=String(risk.category||"constraint").replaceAll("_"," ").toLowerCase();
 if(has(risk.measured)&&has(risk.allowed)){
  const relation=Number(risk.measured)>Number(risk.allowed)?"exceeds":Number(risk.measured)<Number(risk.allowed)?"is below":"equals";
  return what+" — measured "+format(risk.measured," "+(risk.unit||""))+" "+relation+" limit "+format(risk.allowed," "+(risk.unit||""));
 }
 return what+" — the API gave no measured/limit values";
}
function renderResult(r,computed){
 const choices=Array.isArray(r.options)?r.options:[];
 if(r.science_status!=="UNVERIFIED_INPUTS"){setStatus("Unexpected scientific status. Do not use this result.");return;}
 state.lastResponse=r;
 const first=choices[0];
 const second=choices[1];
 byId("metric-battery").textContent=first?format(first.metrics?.minimum_charge_wh," Wh"):"—";
 byId("metric-dark").textContent=first?format(first.metrics?.longest_darkness_hours," h"):"—";
 byId("metric-earth").textContent=first?format(first.metrics?.longest_earth_obstruction_hours," h"):"—";
 byId("metric-risks").textContent=String((first?.risks?.length??0)+(computed?.candidates.find(c=>c.id===first?.id)?.consumables?.risks?.length??0));
 // Say which scenario the four top numbers describe; other scenarios are only quoted from the response.
 const quote=o=>o.id+": minimum charge "+format(o.metrics?.minimum_charge_wh," Wh")+", Earth obstruction "+format(o.metrics?.longest_earth_obstruction_hours," h")+", "+(o.risks?.length??0)+" risk(s)";
 byId("scope-text").textContent=first?"Top numbers are for scenario “"+first.id+"” only ("+choices.length+" evaluated). "+choices.slice(1).map(o=>"Not shown above — "+quote(o)+".").join(" "):"Top numbers: none.";
 byId("initial-state").hidden=true;byId("compare-empty").hidden=true;byId("recover-empty").hidden=true;byId("recover-content").hidden=false;byId("run-badge").textContent=computed?"COMPUTED FROM STORED SERIES · "+computed.candidates[0].science_status:"TRAINING RESULT · UNVERIFIED";
 const cards=byId("scenario-cards");cards.replaceChildren();
 choices.forEach(o=>{
  const card=element("div","scenario-card");
  card.append(element("strong","",o.id));
  rowText(card,"Simulation",o.simulation_status||"UNKNOWN");
  for(const risk of (o.risks||[]))rowText(card,"Breached",breachText(risk));
  rowText(card,"Final battery",format(o.metrics?.final_charge_wh," Wh"));
  rowText(card,"Earth obstruction",format(o.metrics?.longest_earth_obstruction_hours," h"));
  rowText(card,"Minimum reserve",format(o.metrics?.minimum_charge_wh," Wh"));
  const cons=computed?.candidates.find(c=>c.id===o.id)?.consumables;
  for(const item of (cons?.items||[]))rowText(card,item.resource==="oxygen"?"Oxygen margin":"Food margin",format(item.margin_hours," h")+" ("+item.status+")");
  if(cons?.status==="UNKNOWN")rowText(card,"Crew consumables","not evaluated (no crew)");
  cards.append(card);
 });
 const risks=byId("risk-register");risks.replaceChildren();
 for(const o of choices){
  for(const risk of (o.risks||[])){
   const div=element("div","risk-entry"),left=element("div","");
   left.append(element("strong","",o.id+" — "+risk.category),element("p","",breachText(risk)),element("p","",risk.explanation||""));
   const badge=element("span","",risk.severity);div.append(left,badge);risks.append(div);
  }
  for(const risk of (computed?.candidates.find(c=>c.id===o.id)?.consumables?.risks||[])){
   const div=element("div","risk-entry"),left=element("div","");
   left.append(element("strong","",o.id+" — "+risk.category),element("p","",risk.explanation||""));
   div.append(left,element("span","",risk.severity));risks.append(div);
  }
 }
 if(!risks.childElementCount)risks.append(element("p","small-muted","No training constraints were breached. This does NOT establish actual lunar mission safety."));
 if(computed){
  const c=computed.candidates[0],p=c.provenance;
  byId("model-status").textContent="Visibility computed by the Go API from stored series ("+c.science_status+"; terrain "+p.terrain_dataset_id+"; ephemeris "+p.ephemeris_id+"; "+p.frame+"). Scientifically validated: "+(computed.scientifically_validated?"yes":"no")+". Energy, comms and consumables together: "+(computed.combined_decision.candidate_id||"no option meets every assumed limit")+".";
 }else{
  byId("model-status").textContent="Input status: "+r.science_status+" · no real NASA elevation, validated ephemerides or spacecraft RF/power model. Educational candidate: "+(r.laboratory_candidate_id||"none")+".";
 }
 byId("report").disabled=false;
}
async function apiRequest(path,data,asHTML=false){
 const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),cache:"no-store"});
 if(!response.ok){let reason=await response.text();throw new Error("API "+response.status+": "+reason.slice(0,160));}
 return asHTML?response.text():response.json();
}
async function runTraining(event){
 event.preventDefault();
 const run=byId("run");run.disabled=true;run.textContent="Evaluating scenario…";
 try{
  const site=state.selected;
  if(site?.series){
   const sreq=siteRequest(site);
   const resp=await apiRequest("/api/onboard/site-evaluate",sreq,false);
   state.lastRequest=onboardRequestFrom(resp);state.lastSiteRequest=sreq;
   renderResult(resp.onboard,resp);
   setStatus("Visibility computed from stored "+site.series.science_status+" series for "+site.name+".");
  }else{
   const req=buildRequest();state.lastRequest=req;state.lastSiteRequest=null;
   const r=await apiRequest("/api/onboard/evaluate",req,false);
   renderResult(r);
   setStatus(site?"No computed series for "+site.name+" yet: synthetic training output only.":"Go mission computer connected. Synthetic educational output only.");
  }
  state.apiReady=true;
 }catch(err){
  byId("report").disabled=true;state.lastResponse=null;
  setStatus("Cannot evaluate: "+String(err.message||err)+". The page will not invent mission results.");
 }finally{run.disabled=false;run.textContent="Evaluate baseline + delay";}
}
async function openReport(){
 if(!state.lastRequest)return;
 const button=byId("report");button.disabled=true;
 try{
  // Computed-series runs get the report with crew consumables and the combined decision.
  const html=state.lastSiteRequest?await apiRequest("/api/onboard/site-report",state.lastSiteRequest,true):await apiRequest("/api/onboard/report",state.lastRequest,true);
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob),tab=window.open(url,"_blank","noopener,noreferrer");
  if(!tab){const a=document.createElement("a");a.href=url;a.download="braspace-mission-report.html";a.click();}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  setStatus("Evidence report generated. Use browser Print → Save as PDF.");
 }catch(err){setStatus("Mission Report endpoint is not available yet: "+String(err.message||err));}
 finally{button.disabled=false;}
}
function onSiteChange(){
 const id=byId("site").value,site=(state.allSites||state.sites).find(x=>x.id===id);
 state.selected=site||null;
 if(site?.coordinate&&state.globe){
  state.globe.focus(Number(site.coordinate.latitude_deg),Number(site.coordinate.longitude_deg));
 }
 if(site?.series)byId("view-description").textContent=site.name+" has an ingested "+site.series.science_status+" horizon/ephemeris series; the mission computer will use visibility computed from it."+(site.coordinate?" The point is a candidate-region feature center, not a touchdown point.":" It is a software test fixture, not a lunar location.");
 else if(site)byId("view-description").textContent=site.name+" is a candidate-region feature center, not a precise touchdown point. NASA scientific terrain/ephemeris time series have NOT been established by the current training simulator. The 3D globe is visual context only.";
}
async function loadSites(){
 const select=byId("site");
 try{
  const resp=await fetch("/api/sites",{cache:"no-store"});
  if(!resp.ok)throw new Error("HTTP "+resp.status);
  const data=await resp.json(),sites=Array.isArray(data.sites)?data.sites:[];
  if(!sites.length)throw new Error("Empty site catalog");
  const located=sites.filter(s=>s?.coordinate&&Number.isFinite(Number(s.coordinate.latitude_deg))&&Number.isFinite(Number(s.coordinate.longitude_deg)));
  const fixtures=sites.filter(s=>!s?.coordinate&&s?.series);
  state.sites=located;state.allSites=[...located,...fixtures];
  select.replaceChildren();
  const group=(label,list)=>{if(!list.length)return;const g=document.createElement("optgroup");g.label=label;
   list.forEach(s=>{const op=element("option","",s.name+(s.series?" · "+s.series.science_status+" series":""));op.value=s.id;g.append(op);});select.append(g);};
  group("Artemis III candidate regions",located);
  group("Test fixtures (synthetic series, not lunar locations)",fixtures);
  const match=state.sites.find(s=>s.id==="connecting-ridge");if(match)select.value=match.id;
  onSiteChange();
  if(state.globe)state.globe.setSites(state.sites);
 }catch{
  select.replaceChildren();const op=element("option","","No API catalog — South Pole visual only");op.value="";select.append(op);
  state.sites=[];select.disabled=true;
 }
}
async function checkAPI(){
 try{let r=await fetch("/healthz",{cache:"no-store"});if(!r.ok)r=await fetch("/api/health",{cache:"no-store"});if(!r.ok)throw new Error("API unavailable");
 setStatus("Go API reachable. Inputs remain synthetic until science data are validated.");state.apiReady=true;
 }catch{setStatus("Go API not connected; launch backend and serve the web app from the same origin.");state.apiReady=false;}
}
async function bootGlobe(){
 try{
  const mod=await import("./moon3d.js");
  state.globe=await mod.createMoon(byId("moon-stage"),byId("globe-status"));
  byId("stage-fallback").hidden=true;
  if(state.sites.length)state.globe.setSites(state.sites);
  onSiteChange();
  byId("reset-globe").addEventListener("click",()=>state.globe.reset());
 }catch(err){
  byId("globe-status").textContent="2D illustration fallback · 3D not loaded";
  byId("stage-fallback").querySelector("span").textContent="3D unavailable — lunar image is illustrative.";
 }
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view,true)));
byId("run-top").addEventListener("click",()=>byId("mission-form").requestSubmit());
byId("mission-form").addEventListener("submit",runTraining);
byId("site").addEventListener("change",onSiteChange);
byId("report").addEventListener("click",openReport);
showView("explore");
await Promise.allSettled([bootGlobe(),loadSites(),checkAPI()]);
