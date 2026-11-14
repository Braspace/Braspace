package main

import (
 "bytes"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "strings"
 "testing"
)

const validBody = `{"site_id":"demo-synthetic","epoch_utc":"2026-11-14T12:00:00Z","sun":{"azimuth_deg":0,"elevation_deg":2},"earth":{"azimuth_deg":180,"elevation_deg":-1},"terrain_horizon":[{"azimuth_deg":0,"elevation_deg":0},{"azimuth_deg":180,"elevation_deg":0}],"provenance":{"terrain_dataset_id":"SYNTHETIC-TEST","ephemeris_id":"SYNTHETIC-TEST","frame":"MOON_ME"}}`
func post(body string) *httptest.ResponseRecorder {
 req:=httptest.NewRequest(http.MethodPost,"/v1/visibility",strings.NewReader(body))
 req.Header.Set("Content-Type","application/json")
 rec:=httptest.NewRecorder()
 routes("/nonexistent/engine").ServeHTTP(rec,req)
 return rec
}
func TestValidation(t *testing.T) {
 cases:=[]struct{body string;status int}{
  {strings.Replace(validBody,`"elevation_deg":2`,`"elevation_deg":92`,1),422},
  {strings.Replace(validBody,`"MOON_ME"`,`"UNKNOWN"`,1),422},
  {strings.Replace(validBody,`"site_id"`,`"unexpected"`,1),400},
  {validBody+"{}",400},
  {strings.Repeat("x",maxRequestBytes+1),413},
 }
 for i,tc:=range cases { if rec:=post(tc.body); rec.Code!=tc.status { t.Errorf("case %d: got %d, want %d: %s",i,rec.Code,tc.status,rec.Body.String()) } }
}
func TestHealthAndUnavailable(t *testing.T) {
 for path,expected:=range map[string]int{"/healthz":200,"/readyz":503} {
  rec:=httptest.NewRecorder()
  routes("/nonexistent/engine").ServeHTTP(rec,httptest.NewRequest("GET",path,nil))
  if rec.Code!=expected { t.Fatalf("%s: %d",path,rec.Code) }
 }
}
func TestRealProcessContractWithStub(t *testing.T) {
 if os.Getenv("GOOS")=="windows" { t.Skip("POSIX script") }
 file:=filepath.Join(t.TempDir(),"engine")
 output := `{"site_id":"demo-synthetic","epoch_utc":"2026-11-14T12:00:00Z","science_status":"UNVERIFIED_INPUTS","sun_horizon_deg":0,"earth_horizon_deg":0,"sun_margin_deg":2,"earth_margin_deg":-1,"sun_visible":true,"earth_visible":false,"simultaneous_visibility":false}`
 script:="#!/bin/sh\nprintf '%s\\n' '"+output+"'\n"
 if err:=os.WriteFile(file,[]byte(script),0700);err!=nil {t.Fatal(err)}
 req:=httptest.NewRequest("POST","/v1/visibility",bytes.NewBufferString(validBody))
 req.Header.Set("Content-Type","application/json")
 rec:=httptest.NewRecorder(); routes(file).ServeHTTP(rec,req)
 if rec.Code!=200 || !strings.Contains(rec.Body.String(),"UNVERIFIED_INPUTS") || !strings.Contains(rec.Body.String(),"\"evidence_passport\"") {t.Fatalf("response: %d %s",rec.Code,rec.Body.String())}
}

func TestCapabilitiesStateScientificLimits(t *testing.T) {
 rec:=httptest.NewRecorder()
 routes("/nonexistent/engine").ServeHTTP(rec,httptest.NewRequest("GET","/v1/capabilities",nil))
 if rec.Code!=200 || !strings.Contains(rec.Body.String(),"\"scientifically_validated\":false") || !strings.Contains(rec.Body.String(),"\"nasa_lola_loaded\":false") {t.Fatalf("unexpected capabilities: %d %s",rec.Code,rec.Body.String())}
}

func TestDirectEndpointRejectsForgedGeometry(t *testing.T) {
 if os.PathSeparator == '/' {
  binary:=filepath.Join(t.TempDir(),"fake-engine")
  forged:=`{"site_id":"demo-synthetic","epoch_utc":"2026-11-14T12:00:00Z","science_status":"UNVERIFIED_INPUTS","sun_horizon_deg":0,"earth_horizon_deg":0,"sun_margin_deg":2,"earth_margin_deg":-1,"sun_visible":false,"earth_visible":false,"simultaneous_visibility":false}`
  script:="#!/bin/sh\\nprintf '%s\\\\n' '"+forged+"'\\n"
  if err:=os.WriteFile(binary,[]byte(script),0700);err!=nil {t.Fatal(err)}
  req:=httptest.NewRequest("POST","/v1/visibility",strings.NewReader(validBody))
  req.Header.Set("Content-Type","application/json")
  rec:=httptest.NewRecorder()
  routes(binary).ServeHTTP(rec,req)
  if rec.Code!=502 {t.Fatalf("forged direct endpoint returned %d: %s",rec.Code,rec.Body.String())}
 }
}
