import test from "node:test";
import assert from "node:assert/strict";
import {apiDelayMetrics,apiCompareMetrics} from "../screens/scenario-data.js";

test("retry after initial API failure and retain actual nearby option start and offset",async()=>{
  const old=globalThis.fetch;
  const q={siteId:"connecting-ridge",startIso:"2026-11-15T00:00:00Z",hours:24,delayH:48,rules:{night:12,blackout:24}};
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++; if(calls===1)throw new Error("offline");return new Response(JSON.stringify({options:[
      {kind:"nearby_site",site_id:"nobile-rim-1",start_utc:q.startIso,delay_hours:0,distance_km:10,data_status:"AVAILABLE",admissible:true,science_status:"PRELIMINARY"},
      {kind:"nearby_site",site_id:"unknown",data_status:"AVAILABLE"}
    ]}),{headers:{"content-type":"application/json"}});};
    assert.equal((await apiDelayMetrics(q)).online,false);
    const r=await apiDelayMetrics(q);
    assert.equal(r.online,true);assert.equal(r.nearby[0].startUtc,q.startIso);assert.equal(r.nearby[0].delayH,0);assert.equal(r.nearby[1].admissible,null);
    assert.equal(calls,2);
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({results:[]}),{headers:{"content-type":"application/json"}});};
    const a=apiCompareMetrics(q.siteId,q.startIso,q.hours), b=apiCompareMetrics(q.siteId,q.startIso,q.hours);
    await Promise.all([a,b]);assert.equal(calls,3,"same inflight request shares one fetch");
    await apiCompareMetrics(q.siteId,q.startIso,q.hours);assert.equal(calls,4,"completed requests do not prevent retries");
  }finally{globalThis.fetch=old;}
});
