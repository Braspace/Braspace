// Optional Go API health/provenance readout. Never substitutes synthetic data
// for the scientific 2025–2028 lab products when the backend is unavailable.
import {backendStatus,backendSky,backendVectorAvailability,presentationStatus} from "./backend-bridge.js";
const button=document.getElementById("api-sync");
const feedback=document.getElementById("api-feedback");
async function refresh(){
 button.disabled=true;
 feedback.textContent="Go/PostgreSQL API: checking…";
 try{
  const status=await backendStatus();
  const available=status.sites.filter(s=>s.scienceStatus!=="NO_SERIES_DATA").length;
  let note=status.engine==="ready"?"Go/Rust engine ready":"Go/Rust engine unavailable";
  note+=" · "+status.dataSource+" · "+available+" sites with series";
  const selected=status.sites.find(s=>s.id==="peak-near-shackleton");
  if(selected?.scienceStatus && selected.scienceStatus!=="NO_SERIES_DATA"){
   try{
    // No scientific status elevation; this call is diagnostic only.
    const sky=await backendSky(selected.id,"2026-12-01T00:00:00Z",6);
    note+=" · site sky: "+presentationStatus(sky);
   }catch(e){note+=" · sky unavailable ("+(e.code||"coverage/engine")+")";}
  }else{
   note+=" · chosen Shackleton site has no Go series; NASA-derived lab data remains separate";
  }
  const vector=await backendVectorAvailability();
  note+=" · pgvector metadata "+(vector.available?"available":vector.enabled?"not ready":"disabled");
  feedback.textContent=note+".";
 }catch(e){
  feedback.textContent="Go/PostgreSQL API offline or incompatible ("+(e.code||"unavailable")+"); the preliminary Polar Lab continues with its versioned static assets.";
 }finally{button.disabled=false;}
}
button?.addEventListener("click",refresh);
refresh();
