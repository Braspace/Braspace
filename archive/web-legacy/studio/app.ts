import type {Json} from "../api-types.js";
import {api,compareRequest,recoverRequest,metricsFor,validationBadge,transitionSummary} from "./api.js";

const el=<T extends HTMLElement=HTMLElement>(id: string): T=>document.getElementById(id) as T;
const screens=[...document.querySelectorAll<HTMLElement>("[data-view]")];
const nav=[...document.querySelectorAll<HTMLElement>("[data-screen]")];
const meta: Record<string, string[]>={
 overview:["Mission overview","Learn how sunlight, terrain shadows and communication windows shape a lunar landing."],
 explore:["Explore the pole","Inspect stored Sun and Earth geometry at an exact UTC epoch."],
 compare:["Compare sites","Use the same time window and data-status rules for each candidate region."],
 recover:["Recover a mission","Study delays and alternatives without concealing breached engineering constraints."],
 science:["Science & engineering","Keep terrain and ephemerides separate from hypothetical spacecraft assumptions."],
 evidence:["Evidence & data","Inspect source identifiers, limitations and validation state, not just a chart."],
 learn:["Learn & teach","Educational exercises tied to source evidence and explicit assumptions."]
};
let catalog: Json[]=[];
let comparisonSnapshot: {request: unknown; response: Json}|null=null;
const lessonSteps=[
 ["If the Earth is visible above the terrain, is an RF link guaranteed?",
  "No. Geometric line-of-sight is necessary but insufficient; antennas, power, frequencies, link budget and ground networks must also work."],
 ["Why can a nearby ridge make sunlight scarce at the lunar South Pole?",
  "The Sun remains low near the horizon. Terrain can hide the solar disc even when a flat-horizon model suggests sunlight."],
 ["Does a successful educational Landing Lab touchdown certify an Artemis landing site?",
  "No. A hypothetical 3-DOF simulator cannot resolve unmodeled small obstacles, spacecraft design or mission safety."],
 ["What must you verify before comparing two lunar landing regions?",
  "Use the same UTC time window and sampling interpretation. Check sources, coverage, uncertainty and whether each site actually has stored series."]
];
let lessonStep=0;
function setLayer(container: HTMLElement|null,layer: string){
 if(!container||!["answer","why","proof"].includes(layer))return;
 for(const b of container.querySelectorAll<HTMLElement>("[data-layer]")){
  const selected=b.dataset.layer===layer;
  b.setAttribute("aria-pressed",selected?"true":"false");
 }
 for(const panel of container.querySelectorAll<HTMLElement>("[data-layer-panel]"))panel.hidden=panel.dataset.layerPanel!==layer;
 container.dataset.activeLayer=layer;
}
for(const container of document.querySelectorAll<HTMLElement>(".layer-card")){
 for(const button of container.querySelectorAll<HTMLElement>("[data-layer]"))button.addEventListener("click",()=>setLayer(container,button.dataset.layer as string));
 setLayer(container,container.dataset.initialLayer||"answer");
}
function selectExperience(role: string){
 const opening=({public:"answer",educator:"why",researcher:"proof"} as Record<string, string>)[role]||"answer";
 document.body.dataset.role=role;
 el<HTMLSelectElement>("role").value=role;
 for(const container of document.querySelectorAll<HTMLElement>(".layer-card"))setLayer(container,opening);
 if(role==="educator")switchScreen("learn");
 else if(role==="researcher")switchScreen("compare");
 else switchScreen("overview");
 setFeedback("Experience selected by you: "+role+". Explanation starts at "+opening+"; every card remains independently adjustable.");
}
for(const button of document.querySelectorAll<HTMLElement>("[data-task]"))button.addEventListener("click",()=>selectExperience(button.dataset.task as string));
function showLesson(){
 el("lesson-question").textContent="Question "+(lessonStep+1)+" / "+lessonSteps.length+": "+lessonSteps[lessonStep][0];
 el("lesson-answer").textContent=lessonSteps[lessonStep][1];
 el("lesson-answer").hidden=true;
}
el("reveal-answer").addEventListener("click",()=>{el("lesson-answer").hidden=false;});
el("next-question").addEventListener("click",()=>{
 lessonStep=(lessonStep+1)%lessonSteps.length;showLesson();
});
showLesson();
el("export-compare").addEventListener("click",()=>{
 if(!comparisonSnapshot)return;
 const payload={export_type:"BRASPACE_MOONPROOF_GO_COMPARE",exported_at_utc:new Date().toISOString(),
  assurance:"NOT NASA CERTIFIED. No independent scientific validation is inferred.",
  request:comparisonSnapshot.request,raw_api_response:comparisonSnapshot.response};
 const blob=new Blob([JSON.stringify(payload,null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="moonproof-compare-evidence.json";
 document.body.append(link);link.click();link.remove();
 URL.revokeObjectURL(url);
});


function setFeedback(message: string){el("feedback").textContent=message;}
function setConnection(message: string){el("connection").textContent=message;}
function setSeal(message: string){el("science-seal").textContent=message;}
function cell(value: unknown){const td=document.createElement("td");td.textContent=String(value??"—");return td;}
function row(values: unknown[]){const tr=document.createElement("tr");for(const v of values)tr.append(cell(v));return tr;}
function emptyTable(id: string,message: string,colspan: number){
 const body=el(id);body.replaceChildren();
 const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=colspan;td.textContent=message;tr.append(td);body.append(tr);
}
function fmt(v: unknown,digits=1){return typeof v==="number"&&Number.isFinite(v)?(v as number).toFixed(digits):"—";}
function pct(v: unknown){return typeof v==="number"&&Number.isFinite(v)?((v as number)*100).toFixed(1)+"%":"—";}
function selected(){return catalog.find(s=>s.id===el<HTMLSelectElement>("site").value);}
function params(){return {id:el<HTMLSelectElement>("site").value,utc:el<HTMLInputElement>("epoch").value,hours:el<HTMLInputElement>("hours").value};}
function clearData(){
 comparisonSnapshot=null;
 el<HTMLButtonElement>("export-compare").disabled=true;
 el("compare-answer").textContent="Run the API comparison to read available results.";
 emptyTable("sky-body","No API sky samples loaded.",5);
 emptyTable("compare-body","No comparison run with these parameters.",6);
 emptyTable("recover-body","No scenario run with these parameters.",6);
 el("explore-site").textContent="—";el("explore-status").textContent="—";el("explore-step").textContent="—";
 el("sky-source").textContent="No terrain provenance available.";
 for(const kind of ["sun","earth"]){
  el(kind+"-transition").textContent="—";
  el(kind+"-transition-note").textContent="No transition search loaded.";
 }
 el("recovery-outcome").textContent="No constraints evaluated with these parameters.";
 el("evidence-details").replaceChildren();
 setSeal("NOT SCIENTIFICALLY CERTIFIED");
}
function switchScreen(name: string){
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
function addOptions(select: HTMLSelectElement,sites: Json[],includeNone: boolean){
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
 if(s?.series?.start_utc)el<HTMLInputElement>("epoch").value=s.series.start_utc.slice(0,16);
 clearData();
 setFeedback(s?.series?"Series coverage: "+s.series.start_utc+" to "+s.series.end_utc+" · "+s.series.science_status+".":"No stored series for this site. API measurements are unavailable.");
}
async function refreshCatalog(){
 setConnection("Checking the Go API…");
 try{
  const data=await api.sites();
  if(!Array.isArray(data.sites)||data.sites.some((s: Json)=>!s?.id))throw new Error("INVALID_SITE_CATALOG");
  catalog=data.sites;
  addOptions(el<HTMLSelectElement>("site"),catalog,false);
  addOptions(el<HTMLSelectElement>("site-two"),catalog,true);
  addOptions(el<HTMLSelectElement>("site-three"),catalog,true);
  const first=catalog.find(s=>s.series)||catalog[0];
  if(first)el<HTMLSelectElement>("site").value=first.id;
  updateTimeFromSeries();
  setConnection("Go API connected · "+catalog.length+" catalog regions");
 }catch(err){
  catalog=[];for(const id of ["site","site-two","site-three"])addOptions(el<HTMLSelectElement>(id),[],id!=="site");
  el<HTMLInputElement>("epoch").value="";clearData();
  setConnection("Go API unavailable");
  setFeedback("No backend data: "+((err as Json).code||(err as Error).message||"connection failed")+". No scientific values are fabricated. The existing 3D Polar Lab can still use labelled preliminary static assets.");
 }
}
async function callWithButton(id: string,task: () => Promise<void>){
 const button=el<HTMLButtonElement>(id);button.disabled=true;
 try{await task();}catch(err){setFeedback("No result: "+((err as Json).code||(err as Error).message||"request failed")+". Check site coverage, UTC grid and the Go API.");}
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
 for(const kind of ["sun","earth"]){
  const item=transitionSummary(data.next_transitions,kind,kind==="sun"?"Sun":"Earth");
  el(kind+"-transition").textContent=item.value;
  el(kind+"-transition-note").textContent=item.note;
 }
 const body=el("sky-body");body.replaceChildren();
 for(const sample of data.samples.slice(0,72) as Json[]){
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
 const req=compareRequest([p.id,el<HTMLSelectElement>("site-two").value,el<HTMLSelectElement>("site-three").value],p.utc,p.hours);
 setFeedback("Requesting equal-window comparison from Go API…");
 const result=await api.compare(req);
 if(!Array.isArray(result.results)||typeof result.scientifically_validated!=="boolean")throw new Error("INVALID_COMPARE_RESPONSE");
 comparisonSnapshot={request:req,response:result};
 el<HTMLButtonElement>("export-compare").disabled=false;
 el("export-note").textContent="Download includes the request and unchanged API response with all source status and limitations.";
 const first=result.results.find((item: Json)=>metricsFor(item));
 el("compare-answer").textContent=first?"For "+(first.site?.name||first.site?.id||"a covered site")+", Sun is geometrically visible in "+pct(metricsFor(first)!.sun_visible_fraction)+" of stored samples; assess your own constraints and evidence before judging suitability.":"None of the requested regions has AVAILABLE metrics for this exact window.";
 const body=el("compare-body");body.replaceChildren();
 for(const site of result.results as Json[]){
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
 const p=params(),req=recoverRequest(p.id,p.utc,p.hours,el<HTMLInputElement>("dark-limit").value,el<HTMLInputElement>("earth-limit").value);
 setFeedback("Recalculating the baseline and delay options…");
 const result=await api.recover(req);
 if(!Array.isArray(result.options)||!result.outcome)throw new Error("INVALID_RECOVERY_RESPONSE");
 const body=el("recover-body");body.replaceChildren();
 for(const o of result.options as Json[]){
  const failures=Array.isArray(o.breached)?o.breached.map((x: Json)=>x.criterion+" ("+fmt(x.margin,2)+" "+x.unit+" margin)").join("; "):"—";
  body.append(row([o.kind+(o.delay_hours?" +"+o.delay_hours+"h":""),o.start_utc,o.site_id,
   o.data_status||"UNKNOWN",o.data_status==="AVAILABLE"?(o.admissible?"Yes · assumed thresholds":"No · assumed thresholds"):"Not evaluated",
   failures||"None under selected assumptions"]));
 }
 if(!result.options.length)emptyTable("recover-body","No alternatives returned.",6);
 el("recovery-outcome").textContent="Backend: "+result.outcome.status+" · "+(result.outcome.message||"No message")+". Human review required before any actual mission claim.";
 setSeal("PRELIMINARY / UNVERIFIED");
 setFeedback("Replanning response received. "+result.options.length+" options evaluated/reported. Scientific certification has not been established.");
}
function definition(dl: HTMLElement,key: string,value: unknown){
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
for(const button of nav)button.addEventListener("click",()=>switchScreen(button.dataset.screen as string));
for(const button of document.querySelectorAll<HTMLElement>("[data-go]"))button.addEventListener("click",()=>switchScreen(button.dataset.go as string));
el("role").addEventListener("change",event=>selectExperience((event.target as HTMLSelectElement).value));

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
