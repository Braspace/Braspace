// Source-gated, same-origin Go API client. No fixtures, cross-origin calls, or synthetic fallback.
const idPattern=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export function safeID(id){if(typeof id!=="string"||!idPattern.test(id))throw new TypeError("INVALID_SITE_ID");return id;}
export function toUTC(local){
 if(typeof local!=="string"||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new TypeError("UTC_START_REQUIRED");
 const iso=new Date(local+":00Z").toISOString();
 if(iso.slice(0,16)!==local)throw new TypeError("INVALID_UTC");
 return iso.replace(".000Z","Z");
}
export function durationHours(n){const x=Number(n);if(!Number.isInteger(x)||x<1||x>720)throw new TypeError("INVALID_DURATION");return x;}
export function compareRequest(ids,local,hours){
 const chosen=ids.filter(Boolean).map(safeID);
 if(!chosen.length||chosen.length>3||new Set(chosen).size!==chosen.length)throw new TypeError("SELECT_DISTINCT_SITES");
 return {site_ids:chosen,start_utc:toUTC(local),duration_hours:durationHours(hours),include_series:false};
}
export function recoverRequest(id,local,hours,dark,comm){
 const d=Number(dark),c=Number(comm);
 if(String(dark).trim()===""||String(comm).trim()===""||!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0||d>720||c>720)throw new TypeError("SET_EXPLICIT_LIMITS");
 return {site_id:safeID(id),start_utc:toUTC(local),duration_hours:durationHours(hours),delays_hours:[24,48,72],include_nearby:true,max_nearby:2,
  constraints:{max_continuous_dark_hours:d,max_continuous_comm_gap_hours:c}};
}
export async function json(path,options={},fetcher=fetch){
 if(!/^\/api\/[A-Za-z0-9/?=&%_.-]+$/.test(path)||path.includes(".."))throw new TypeError("UNSAFE_API_PATH");
 const response=await fetcher(path,{redirect:"error",signal:AbortSignal.timeout(12000),...options});
 const body=await response.json().catch(()=>null);
 if(!response.ok){const e=new Error(body?.code||"HTTP_"+response.status);e.code=body?.code||"HTTP_ERROR";throw e;}
 if(!body||Array.isArray(body)||typeof body!=="object")throw new TypeError("INVALID_API_RESPONSE");
 return body;
}
export function validationBadge(res,scienceStatus=res?.science_status){
 const provenance=res?.provenance||{};
 // These flags are not substitutes for independent scientific review.
 const provenanceComplete=/^[a-f0-9]{64}$/i.test(provenance.terrain_sha256||"")&&
  typeof provenance.ephemeris_id==="string"&&provenance.ephemeris_id.length>0&&provenance.frame==="MOON_ME";
 return res?.scientifically_validated===true&&scienceStatus==="VALIDATED"&&provenanceComplete?"SOURCE-VALIDATED (REVIEW REQUIRED)":
  "PRELIMINARY / UNVERIFIED";
}
export function metricsFor(result){
 if(result?.data_status!=="AVAILABLE"||!result?.evaluation?.metrics)return null;
 const m=result.evaluation.metrics;
 const keys=["sun_visible_fraction","earth_visible_fraction","longest_continuous_dark_hours","longest_continuous_comm_gap_hours"];
 return keys.every(k=>typeof m[k]==="number"&&Number.isFinite(m[k]))?m:null;
}
export const api={
 sites:(fetcher)=>json("/api/sites",{},fetcher),
 sky:(id,start,hours,fetcher)=>json("/api/sites/"+safeID(id)+"/sky?start="+encodeURIComponent(toUTC(start))+"&hours="+durationHours(hours),{},fetcher),
 compare:(request,fetcher)=>json("/api/compare",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)},fetcher),
 recover:(request,fetcher)=>json("/api/scenarios/delay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)},fetcher)
};