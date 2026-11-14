// Typed same-origin bridge for the optional Go/Rust/PostgreSQL API.
// Geometry from NASA-derived static assets is NEVER silently replaced by
// synthetic API fixtures; no client-side scientific status promotion.
const sitePattern=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const datePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function validUTC(utc){
 if(typeof utc!=="string"||!datePattern.test(utc)||!Number.isFinite(Date.parse(utc)))throw new TypeError("expected UTC RFC3339");
 return utc;
}
async function json(path,options={},fetcher=fetch){
 const response=await fetcher(path,{redirect:"error",signal:AbortSignal.timeout(12000),...options});
 const body=await response.json().catch(()=>null);
 if(!response.ok){
  const err=new Error(body?.code||"HTTP_"+response.status);
  err.status=response.status;err.code=body?.code||"HTTP_ERROR";throw err;
 }
 if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("INVALID_API_JSON");
 return body;
}
export async function backendStatus(fetcher=fetch){
 const health=await json("/api/health",{},fetcher);
 const catalog=await json("/api/sites",{},fetcher);
 if(!["ready","unavailable"].includes(health.engine)||!Array.isArray(catalog.sites))throw new Error("INVALID_BACKEND_CONTRACT");
 return {engine:health.engine,dataSource:health.data_source||"unknown",sites:catalog.sites.map(site=>({id:site.id,scienceStatus:site.series?.science_status||"NO_SERIES_DATA"}))};
}
export async function backendSky(siteId,utc,hours,fetcher=fetch){
 if(!sitePattern.test(siteId)||!Number.isFinite(hours)||hours<=0||hours>720)throw new TypeError("invalid site or hours");
 validUTC(utc);
 const body=await json("/api/sites/"+siteId+"/sky?start="+encodeURIComponent(utc)+"&hours="+hours,{},fetcher);
 if(body.site_id!==siteId||!Array.isArray(body.samples)||!Array.isArray(body.terrain_horizon)||!body.provenance||typeof body.science_status!=="string")throw new Error("INVALID_SKY_CONTRACT");
 return body;
}
export async function backendCompare(request,fetcher=fetch){
 if(!Array.isArray(request?.site_ids)||request.site_ids.length<1||request.site_ids.length>3||!request.site_ids.every(id=>sitePattern.test(id)))throw new TypeError("invalid sites");
 validUTC(request.start_utc);
 if(!Number.isFinite(request.duration_hours)||request.duration_hours<=0||request.duration_hours>720)throw new TypeError("invalid duration");
 const result=await json("/api/compare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request)},fetcher);
 if(!Array.isArray(result.results)||typeof result.scientifically_validated!=="boolean")throw new Error("INVALID_COMPARE_CONTRACT");
 return result;
}
export function presentationStatus(series){
 // Only an explicit, separately reviewed validated flag may promote a claim.
 if(!series||series.science_status!=="VALIDATED"||series.scientifically_validated!==true)return "PRELIMINARY / UNVERIFIED";
 return "SOURCE-VALIDATED (review numerical methodology)";
}
