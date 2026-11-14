import {api,compareRequest,recoverRequest,metricsFor,validationBadge} from "./api.js";

const el=id=>document.getElementById(id);
const screens=[...document.querySelectorAll("[data-view]")];
const nav=[...document.querySelectorAll("[data-screen]")];
const meta={
 overview:["Mission overview","Learn how sunlight, terrain shadows and communication windows shape a lunar landing."],
 explore:["Explore the pole","Inspect stored Sun and Earth geometry at an exact UTC epoch."],
 compare:["Compare sites","Use the same time window and data-status rules for each candidate region."],
 recover:["Recover a mission","Study delays and alternatives without concealing breached engineering constraints."],
 science:["Science & engineering","Keep terrain and ephemerides separate from hypothetical spacecraft assumptions."],
 evidence:["Evidence & data","Inspect source identifiers, limitations and validation state, not just a chart."],
 learn:["Learn & teach","Educational exercises tied to source evidence and explicit assumptions."]
};
let catalog=[];

function setFeedback(message){el("feedback").textContent=message;}
function setConnection(message){el("connection").textContent=message;}
function setSeal(message){el("science-seal").textContent=message;}
function cell(value){const td=document.createElement("td");td.textContent=String(value??"—");return td;}
function row(values){const tr=document.createElement("tr");for(const v of values)tr.append(cell(v));return tr;}
function emptyTable(id,message,colspan){
 const body=el(id);body.replaceChildren();
 const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=colspan;td.textContent=message;tr.append(td);body.append(tr);
}
function fmt(v,digits=1){return typeof v==="number"&&Number.isFinite(v)?v.toFixed(digits):"—";}
function pct(v){return typeof v==="number"&&Number.isFinite(v)?(v*100).toFixed(1)+"%":"—";}
function selected(){return catalog.find(s=>s.id===el("site").value);}
function params(){return {id:el("site").value,utc:el("epoch").value,hours:el("hours").value};}
function clearData(){
 emptyTable("sky-body","No API sky samples loaded.",5);
 emptyTable("compare-body","No comparison run with these parameters.",6);
 emptyTable("recover-body","No scenario run with these parameters.",6);
 el("explore-site").textContent="—";el("explore-status").textContent="—";el("explore-step").textContent="—";
 el("sky-source").textContent="No terrain provenance available.";
 el("recovery-outcome").textContent="No constraints evaluated with these parameters.";
 el("evidence-details").replaceChildren();
 setSeal("NOT SCIENTIFICALLY CERTIFIED");
}
function switchScreen(name){
 if(!meta[name])return;
 for(const v of screens)v.hidden=v.dataset.view!==name;
 for(const button of nav){
  const active=button.dataset.screen===name;
  button.classList.toggle("active",active);
  if(active)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current");
 }
 el("page-title").textContent=meta[name][0];
 el("page-description").textContent=meta[name][1];
 if(document.activeElement?.closest?.("#screens"))el("content").focus({preventScroll:true});
}
function addOptions(select,sites,includeNone){
 select.replaceChildren();
 if(includeNone){const o=document.createElement("option");o.value="";o.textContent="None";select.append(o);}
 for(const s of sites){
  const o=document.createElement("option");o.value=s.id;
  o.textContent=(s.name||s.id)+(s.series?" · series":" · no series");
  select.append(o);
 }
}
function updateTimeFromSeries(){
 const s=selected();
 if(s?.series?.start_utc)el("epoch").value=s.series.start_utc.slice(0,16);
 clearData();
 setFeedback(s?.series?"Series coverage: "+s.series.start_utc+" to "+s.series.end_utc+" · "+s.series.science_status+".":"No stored series for this site. API measurements are unavailable.");
}
async function refreshCatalog(){
 setConnection("Checking the Go API…");
 try{
  const data=await api.sites();
  if(!Array.isArray(data.sites)||data.sites.some(s=>!s?.id))throw new Error("INVALID_SITE_CATALOG");
  catalog=data.sites;
  addOptions(el("site"),catalog,false);
  addOptions(el("site-two"),catalog,true);
  addOptions(el("site-three"),catalog,true);
  const first=catalog.find(s=>s.series)||catalog[0];
  if(first)el("site").value=first.id;
  updateTimeFromSeries();
  setConnection("Go API connected · "+catalog.length+" catalog regions");
 }catch(err){
  catalog=[];for(const id of ["site","site-two","site-three"])addOptions(el(id),[],id!=="site");
  el("epoch").value="";clearData();
  setConnection("Go API unavailable");
  setFeedback("No backend data: "+(err.code||err.message||"connection failed")+". No scientific values are fabricated. The existing 3D Polar Lab can still use labelled preliminary static assets.");
 }
}
async function callWithButton(id,task){
 const button=el(id);button.disabled=true;
 try{await task();}catch(err){setFeedback("No result: "+(err.code||err.message||"request failed")+". Check site coverage, UTC grid and the Go API.");}
 finally{button.disabled=false;}
}
async function showSky(){
 const {id,utc,hours}=params();
 setFeedback("Reading recorded terrain-horizon and ephemeris samples…");
 const data=await api.sky(id,utc,hours);
 if(data.site_id!==id||!Array.isArray(data.samples)||!data.provenance)throw new Error("INVALID_SKY_CONTRACT");
 setSeal(validationBadge(data));
 el("explore-site").textContent=selected()?.name||id;
 el("explore-status").textContent=data.science_status||"UNVERIFIED";
 el("explore-step").textContent=String(data.step_seconds)+" seconds";
 const body=el("sky-body");body.replaceChildren();
 for(const sample of data.samples.slice(0,72)){
  body.append(row([sample.epoch_utc,fmt(sample.sun?.elevation_deg,2)+"°",fmt(sample.earth?.elevation_deg,2)+"°",
   sample.sun_visible===true?"Yes":sample.sun_visible===false?"No":"—",
   sample.earth_visible===true?"Yes":sample.earth_visible===false?"No":"—"]));
 }
 if(!data.samples.length)emptyTable("sky-body","The API returned no samples.",5);
 const p=data.provenance;
 el("sky-source").textContent="Source: "+(p.terrain_dataset_id||"unspecified")+" · "+(p.ephemeris_id||"unspecified")+" · frame "+(p.frame||"unspecified")+". "+data.samples.length+" samples returned; first 72 shown. "+(data.limitations?.[0]||"");
 setFeedback("Read "+data.samples.length+" stored samples. Science status: "+data.science_status+"; this is not NASA flight certification.");
}
async function showCompare(){
 const p=params();
 const req=compareRequest([p.id,el("site-two").value,el("site-three").value],p.utc,p.hours);
 setFeedback("Requesting equal-window comparison from Go API…");
 const result=await api.compare(req);
 if(!Array.isArray(result.results)||typeof result.scientifically_validated!=="boolean")throw new Error("INVALID_COMPARE_RESPONSE");
 const body=el("compare-body");body.replaceChildren();
 for(const site of result.results){
  const m=metricsFor(site);
  body.append(row([
   (site.site?.name||site.site?.id||"Unknown")+" · "+(site.data_status||"UNKNOWN")+(site.reason?" ("+site.reason+")":""),
   m?pct(m.sun_visible_fraction):"—",m?pct(m.earth_visible_fraction):"—",
   m?fmt(m.longest_continuous_dark_hours):"—",m?fmt(m.longest_continuous_comm_gap_hours):"—",
   site.science_status||"NO_SERIES_DATA"
  ]));
 }
 if(!result.results.length)emptyTable("compare-body","No candidates returned.",6);
 setSeal("PRELIMINARY / UNVERIFIED");
 setFeedback("Go API compared "+result.results.length+" region(s). Absent series never produce numeric values. "+(result.limitations?.[0]||""));
}
async function showRecover(){
 const p=params(),req=recoverRequest(p.id,p.utc,p.hours,el("dark-limit").value,el("earth-limit").value);
 setFeedback("Recalculating the baseline and delay options…");
 const result=await api.recover(req);
 if(!Array.isArray(result.options)||!result.outcome)throw new Error("INVALID_RECOVERY_RESPONSE");
 const body=el("recover-body");body.replaceChildren();
 for(const o of result.options){
  const failures=Array.isArray(o.breached)?o.breached.map(x=>x.criterion+" ("+fmt(x.margin,2)+" "+x.unit+" margin)").join("; "):"—";
  body.append(row([o.kind+(o.delay_hours?" +"+o.delay_hours+"h":""),o.start_utc,o.site_id,
   o.data_status||"UNKNOWN",o.data_status==="AVAILABLE"?(o.admissible?"Yes · assumed thresholds":"No · assumed thresholds"):"Not evaluated",
   failures||"None under selected assumptions"]));
 }
 if(!result.options.length)emptyTable("recover-body","No alternatives returned.",6);
 el("recovery-outcome").textContent="Backend: "+result.outcome.status+" · "+(result.outcome.message||"No message")+". Human review required before any actual mission claim.";
 setSeal("PRELIMINARY / UNVERIFIED");
 setFeedback("Replanning response received. "+result.options.length+" options evaluated/reported. Scientific certification has not been established.");
}
function definition(dl,key,value){
 const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=key;dd.textContent=String(value??"Unavailable");dl.append(dt,dd);
}
async function showEvidence(){
 const p=params();setFeedback("Reading stored series provenance…");
 const data=await api.sky(p.id,p.utc,Math.min(1,Number(p.hours)||1));
 const dl=el("evidence-details");dl.replaceChildren();
 definition(dl,"Site",data.site_id);
 definition(dl,"Science status",data.science_status);
 definition(dl,"Terrain dataset",data.provenance?.terrain_dataset_id);
 definition(dl,"Terrain SHA-256",data.provenance?.terrain_sha256||"Not provided");
 definition(dl,"Ephemeris",data.provenance?.ephemeris_id);
 definition(dl,"Reference frame",data.provenance?.frame);
 definition(dl,"Observer height (m)",data.observer_height_m);
 definition(dl,"Stored step (s)",data.step_seconds);
 definition(dl,"Generator",data.provenance?.generator);
 definition(dl,"Limitations",(data.limitations||[]).join("; "));
 setSeal(validationBadge(data));setFeedback("API provenance read. A listed source ID does not itself establish scientific validation.");
}
for(const button of nav)button.addEventListener("click",()=>switchScreen(button.dataset.screen));
for(const button of document.querySelectorAll("[data-go]"))button.addEventListener("click",()=>switchScreen(button.dataset.go));
el("role").addEventListener("change",event=>{
 const allowed=["public","researcher","educator"];const role=event.target.value;
 document.body.dataset.role=allowed.includes(role)?role:"public";
 if(role==="educator")switchScreen("learn");
 if(role==="researcher")switchScreen("evidence");
});
for(const id of ["site","epoch","hours","site-two","site-three"])el(id).addEventListener("change",()=>{
 if(id==="site")updateTimeFromSeries();else {clearData();setFeedback("Parameters changed. Run a new API request for these parameters.");}
});
el("refresh").addEventListener("click",()=>callWithButton("refresh",refreshCatalog));
el("load-sky").addEventListener("click",()=>callWithButton("load-sky",showSky));
el("run-compare").addEventListener("click",()=>callWithButton("run-compare",showCompare));
el("run-recover").addEventListener("click",()=>callWithButton("run-recover",showRecover));
el("load-provenance").addEventListener("click",()=>callWithButton("load-provenance",showEvidence));
switchScreen("overview");
refreshCatalog();
