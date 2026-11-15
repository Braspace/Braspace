// Source-gated Go API client. No fixtures or silent synthetic fallback.
import type {Json} from "../api-types.js";
import {apiURL} from "../api-base.js";
type Fetcher=typeof fetch;
const idPattern=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export function safeID(id: unknown): string {if(typeof id!=="string"||!idPattern.test(id))throw new TypeError("INVALID_SITE_ID");return id;}
export function toUTC(local: unknown): string {
 if(typeof local!=="string"||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new TypeError("UTC_START_REQUIRED");
 const iso=new Date(local+":00Z").toISOString();
 if(iso.slice(0,16)!==local)throw new TypeError("INVALID_UTC");
 return iso.replace(".000Z","Z");
}
export function durationHours(n: unknown): number {const x=Number(n);if(!Number.isInteger(x)||x<1||x>720)throw new TypeError("INVALID_DURATION");return x;}
export function compareRequest(ids: unknown[],local: unknown,hours: unknown){
 const chosen=ids.filter(Boolean).map(safeID);
 if(!chosen.length||chosen.length>3||new Set(chosen).size!==chosen.length)throw new TypeError("SELECT_DISTINCT_SITES");
 return {site_ids:chosen,start_utc:toUTC(local),duration_hours:durationHours(hours),include_series:false};
}
export function recoverRequest(id: unknown,local: unknown,hours: unknown,dark: unknown,comm: unknown){
 const d=Number(dark),c=Number(comm);
 if(String(dark).trim()===""||String(comm).trim()===""||!Number.isFinite(d)||!Number.isFinite(c)||d<0||c<0||d>720||c>720)throw new TypeError("SET_EXPLICIT_LIMITS");
 return {site_id:safeID(id),start_utc:toUTC(local),duration_hours:durationHours(hours),delays_hours:[24,48,72],include_nearby:true,max_nearby:2,
  constraints:{max_continuous_dark_hours:d,max_continuous_comm_gap_hours:c}};
}
export async function json(path: string,options: RequestInit={},fetcher: Fetcher=fetch): Promise<Json> {
 if(!/^\/api\/[A-Za-z0-9/?=&%_.-]+$/.test(path)||path.includes(".."))throw new TypeError("UNSAFE_API_PATH");
 const response=await fetcher(apiURL(path),{redirect:"error",signal:AbortSignal.timeout(12000),...options});
 const body=await response.json().catch(()=>null);
 if(!response.ok){const e: Error&{code?: string}=new Error(body?.code||"HTTP_"+response.status);e.code=body?.code||"HTTP_ERROR";throw e;}
 if(!body||Array.isArray(body)||typeof body!=="object")throw new TypeError("INVALID_API_RESPONSE");
 return body;
}
export function validationBadge(res: Json|null|undefined,scienceStatus: unknown=res?.science_status): string {
 const provenance=res?.provenance||{};
 // These flags are not substitutes for independent scientific review.
 const provenanceComplete=/^[a-f0-9]{64}$/i.test(provenance.terrain_sha256||"")&&
  typeof provenance.ephemeris_id==="string"&&provenance.ephemeris_id.length>0&&provenance.frame==="MOON_ME";
 return res?.scientifically_validated===true&&scienceStatus==="VALIDATED"&&provenanceComplete?"SOURCE-VALIDATED (REVIEW REQUIRED)":
  "PRELIMINARY / UNVERIFIED";
}
export function metricsFor(result: Json|null|undefined): Json|null {
 if(result?.data_status!=="AVAILABLE"||!result?.evaluation?.metrics)return null;
 const m=result.evaluation.metrics;
 const keys=["sun_visible_fraction","earth_visible_fraction","longest_continuous_dark_hours","longest_continuous_comm_gap_hours"];
 // A declared AVAILABLE series is not sufficient if the numeric payload is malformed.
 // Visibility fractions must be in [0,1]; longest gaps must fit the <=720h API window.
 const fractions=["sun_visible_fraction","earth_visible_fraction"];
 const gaps=["longest_continuous_dark_hours","longest_continuous_comm_gap_hours"];
 return keys.every(k=>typeof m[k]==="number"&&Number.isFinite(m[k]))&&
  fractions.every(k=>m[k]>=0&&m[k]<=1)&&gaps.every(k=>m[k]>=0&&m[k]<=720)?m:null;
}
export const api={
 sites:(fetcher?: Fetcher)=>json("/api/sites",{},fetcher),
 sky:(id: unknown,start: unknown,hours: unknown,fetcher?: Fetcher)=>json("/api/sites/"+safeID(id)+"/sky?start="+encodeURIComponent(toUTC(start))+"&hours="+durationHours(hours),{},fetcher),
 compare:(request: unknown,fetcher?: Fetcher)=>json("/api/compare",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)},fetcher),
 recover:(request: unknown,fetcher?: Fetcher)=>json("/api/scenarios/delay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request)},fetcher)
};
/** A native-series transition is an interval, not an exact event or a real-time countdown. */
export function transitionSummary(obj: Json|null|undefined,body: string,label: string){
 const tr=obj?.[body],reason=obj?.[body+"_null_reason"];
 if(!tr){
  return {value:"Not observed in requested window",note:typeof reason==="string"&&reason?reason:"No transition available from stored samples."};
 }
 const valid=typeof tr.kind==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(tr.epoch_utc||"")&&
  Number.isFinite(tr.hours_from_start)&&tr.hours_from_start>=0&&Number.isInteger(tr.resolution_seconds)&&tr.resolution_seconds>0;
 if(!valid)return {value:"No trustworthy transition",note:"API transition contract invalid; numerical time withheld."};
 return {
  value:tr.kind.replaceAll("_"," ")+" after "+tr.hours_from_start.toFixed(2)+" h",
  note:label+" first changed at stored sample "+tr.epoch_utc+
   ". Actual event is within the preceding "+tr.resolution_seconds+" seconds (native series step)."
 };
}
