package main

import (
 "math"
 "strings"
 "testing"
)

// Real-source does not mean independently validated. Preserve every warning.
func TestConnectingRidgeNASAProvenanceAndCoverage(t *testing.T) {
 st,err:=loadDefaultStore()
 if err!=nil {t.Fatal(err)}
 site,ok:=st.site("connecting-ridge")
 if !ok||site.SeriesFile!="series/connecting-ridge.naif.unverified.json" {t.Fatalf("site missing its explicit series: %+v",site)}
 s,ok:=st.seriesFor(site.ID)
 if !ok {t.Fatal("NASA-source-derived series not ingested")}
 if s.ScienceStatus!="UNVERIFIED"||s.Provenance.Frame!="MOON_ME"||s.Provenance.TerrainSHA256!="e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc" {
  t.Fatalf("unexpected provenance: %+v",s)
 }
 if s.ObserverHeightM!=2||s.StepSeconds!=3600||s.StartUTC!="2026-11-15T00:00:00Z"||len(s.Samples)!=72||len(s.TerrainHorizon)!=36 {
  t.Fatalf("incorrect source grid shape or epoch")
 }
 if math.Abs(s.Samples[0].Sun.ElevationDeg-1.389786)>1e-7||
    math.Abs(s.Samples[71].Earth.ElevationDeg-0.020642)>1e-7 {
  t.Fatalf("source angles differ from pinned NASA/NAIF artifact")
 }
}

func TestConnectingRidgeAPINeverClaimsScientificValidation(t *testing.T) {
 h,_:=testAPI(t,"ok")
 site:=do(h,"GET","/api/sites/connecting-ridge","")
 if site.Code!=200||!strings.Contains(site.Body.String(),"\"science_status\":\"UNVERIFIED\""){
  t.Fatalf("site provenance missing: %d %s",site.Code,site.Body.String())
 }
 body:=`{"site_ids":["connecting-ridge"],"start_utc":"2026-11-15T00:00:00Z","duration_hours":2,"include_series":true}`
 rec:=do(h,"POST","/api/compare",body)
 if rec.Code!=200 {t.Fatalf("compare failed: %d %s",rec.Code,rec.Body.String())}
 out:=decode(t,rec)
 if out["scientifically_validated"]!=false {t.Fatal("preliminary NASA-backed data falsely validated")}
 item:=out["results"].([]any)[0].(map[string]any)
 if item["data_status"]!="AVAILABLE"||item["science_status"]!="UNVERIFIED" {
  t.Fatalf("source-backed series not available with explicit UNVERIFIED status: %+v",item)
 }
 evaluation:=item["evaluation"].(map[string]any)
 if evaluation["metrics"].(map[string]any)["sample_count"].(float64)!=2 {t.Fatal("wrong sample count")}
}
