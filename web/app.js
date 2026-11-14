// BRASPACE MoonProof frontend. NASA-derived metrics are NEVER invented here.
// The training fixture below is explicitly synthetic; Go owns evaluation.
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
function showView(name){
 const v=views[name]||views.explore;
 byId("view-eyebrow").textContent=v[0];byId("view-title").textContent=v[1];byId("view-description").textContent=v[2];
 document.querySelectorAll("[data-view]").forEach(button=>{const yes=button.dataset.view===name;button.classList.toggle("active",yes);if(yes)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");});
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
function buildRequest(){
 const start=utcDateInput(byId("start").value);
 const duration=inputNumber("duration"),delay=inputNumber("delay");
 const capacity=inputNumber("battery"),initial=inputNumber("initial"),reserve=inputNumber("reserve"),
  generation=inputNumber("generation"),load=inputNumber("load"),blackout=inputNumber("blackout");
 if(![24,48,72].includes(duration)||![24,48,72].includes(delay))throw new Error("Select supported duration and delay.");
 if(capacity<=0||capacity>1e5||initial<0||initial>capacity||reserve<0||reserve>capacity)throw new Error("Battery charge and reserve must not exceed capacity.");
 if(generation<0||load<0||blackout<0||blackout>duration)throw new Error("Use valid positive power and blackout inputs (gap <= duration).");
 const power={battery_capacity_wh:capacity,initial_charge_wh:initial,reserve_wh:reserve,solar_generation_w:generation,load_w:load};
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
function renderResult(r){
 const choices=Array.isArray(r.options)?r.options:[];
 if(r.science_status!=="UNVERIFIED_INPUTS"){setStatus("Unexpected scientific status. Do not use this result.");return;}
 state.lastResponse=r;
 const first=choices[0];
 byId("metric-battery").textContent=first?format(first.metrics?.minimum_charge_wh," Wh"):"—";
 byId("metric-dark").textContent=first?format(first.metrics?.longest_darkness_hours," h"):"—";
 byId("metric-earth").textContent=first?format(first.metrics?.longest_earth_obstruction_hours," h"):"—";
 byId("metric-risks").textContent=String(first?.risks?.length??0);
 byId("result-placeholder").hidden=true;byId("result-content").hidden=false;byId("run-badge").textContent="TRAINING RESULT · UNVERIFIED";
 const cards=byId("scenario-cards");cards.replaceChildren();
 choices.forEach(o=>{
  const card=element("div","scenario-card");
  card.append(element("strong","",o.id));
  rowText(card,"Simulation",o.simulation_status||"UNKNOWN");
  rowText(card,"Final battery",format(o.metrics?.final_charge_wh," Wh"));
  rowText(card,"Earth obstruction",format(o.metrics?.longest_earth_obstruction_hours," h"));
  rowText(card,"Minimum reserve",format(o.metrics?.minimum_charge_wh," Wh"));
  cards.append(card);
 });
 const risks=byId("risk-register");risks.replaceChildren();
 for(const o of choices){
  for(const risk of (o.risks||[])){
   const div=element("div","risk-entry"),left=element("div","");
   left.append(element("strong","",o.id+" — "+risk.category),element("p","",risk.explanation||""));
   const badge=element("span","",risk.severity);div.append(left,badge);risks.append(div);
  }
 }
 if(!risks.childElementCount)risks.append(element("p","small-muted","No training constraints were breached. This does NOT establish actual lunar mission safety."));
 byId("model-status").textContent="Input status: "+r.science_status+" · no real NASA elevation, validated ephemerides or spacecraft RF/power model. Educational candidate: "+(r.laboratory_candidate_id||"none")+".";
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
  const req=buildRequest();state.lastRequest=req;
  const r=await apiRequest("/api/onboard/evaluate",req,false);
  renderResult(r);
  state.apiReady=true;
  setStatus("Go mission computer connected. Synthetic educational output only.");
 }catch(err){
  byId("report").disabled=true;state.lastResponse=null;
  setStatus("Cannot evaluate: "+String(err.message||err)+". The page will not invent mission results.");
 }finally{run.disabled=false;run.textContent="Evaluate baseline + delay";}
}
async function openReport(){
 if(!state.lastRequest)return;
 const button=byId("report");button.disabled=true;
 try{
  const html=await apiRequest("/api/onboard/report",state.lastRequest,true);
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob),tab=window.open(url,"_blank","noopener,noreferrer");
  if(!tab){const a=document.createElement("a");a.href=url;a.download="braspace-mission-report.html";a.click();}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  setStatus("Evidence report generated. Use browser Print → Save as PDF.");
 }catch(err){setStatus("Mission Report endpoint is not available yet: "+String(err.message||err));}
 finally{button.disabled=false;}
}
function onSiteChange(){
 const id=byId("site").value,site=state.sites.find(x=>x.id===id);
 state.selected=site||null;
 if(site?.coordinate&&state.globe){
  state.globe.focus(Number(site.coordinate.latitude_deg),Number(site.coordinate.longitude_deg));
 }
 if(site)byId("view-description").textContent=site.name+" is a candidate-region feature center, not a precise touchdown point. NASA scientific terrain/ephemeris time series have NOT been established by the current training simulator. The 3D globe is visual context only.";
}
async function loadSites(){
 const select=byId("site");
 try{
  const resp=await fetch("/api/sites",{cache:"no-store"});
  if(!resp.ok)throw new Error("HTTP "+resp.status);
  const data=await resp.json(),sites=Array.isArray(data.sites)?data.sites:[];
  if(!sites.length)throw new Error("Empty site catalog");
  state.sites=sites.filter(s=>s?.coordinate&&Number.isFinite(Number(s.coordinate.latitude_deg))&&Number.isFinite(Number(s.coordinate.longitude_deg)));
  select.replaceChildren();
  state.sites.forEach(s=>{const op=element("option","",s.name);op.value=s.id;select.append(op);});
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
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
byId("mission-form").addEventListener("submit",runTraining);
byId("site").addEventListener("change",onSiteChange);
byId("report").addEventListener("click",openReport);
showView("explore");
await Promise.allSettled([bootGlobe(),loadSites(),checkAPI()]);
