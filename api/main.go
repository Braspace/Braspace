// BRASPACE integration adapter: input is not scientific source-of-truth.
// The Rust engine classifies *supplied* look angles against a supplied skyline.
// No NASA ephemeris or terrain is computed or verified by this service.
package main

import (
 "bytes"
 "crypto/sha256"
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "log"
 "math"
 "net/http"
 "os"
 "os/exec"
 "strings"
 "time"
 "github.com/Braspace/Braspace/api/onboard"
)

const maxRequestBytes = 128 << 10

type direction struct {
 AzimuthDeg float64 `json:"azimuth_deg"`
 ElevationDeg float64 `json:"elevation_deg"`
}
type horizonSample struct {
 AzimuthDeg float64 `json:"azimuth_deg"`
 ElevationDeg float64 `json:"elevation_deg"`
}
type provenance struct {
 TerrainDatasetID string `json:"terrain_dataset_id"`
 EphemerisID string `json:"ephemeris_id"`
 Frame string `json:"frame"`
}
type visibilityRequest struct {
 SiteID string `json:"site_id"`
 EpochUTC string `json:"epoch_utc"`
 Sun direction `json:"sun"`
 Earth direction `json:"earth"`
 TerrainHorizon []horizonSample `json:"terrain_horizon"`
 Provenance provenance `json:"provenance"`
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func validDirection(d direction) bool {
 return finite(d.AzimuthDeg) && finite(d.ElevationDeg) && d.AzimuthDeg >= 0 && d.AzimuthDeg < 360 && d.ElevationDeg >= -90 && d.ElevationDeg <= 90
}
func validate(req visibilityRequest) error {
 if req.SiteID == "" || len(req.SiteID) > 80 || strings.TrimSpace(req.SiteID) != req.SiteID { return errors.New("invalid site_id") }
 if _, err := time.Parse(time.RFC3339, req.EpochUTC); err != nil { return errors.New("epoch_utc must be RFC3339") }
 if !validDirection(req.Sun) || !validDirection(req.Earth) { return errors.New("invalid look angles") }
 if len(req.TerrainHorizon) < 2 || len(req.TerrainHorizon) > 1440 { return errors.New("terrain_horizon must contain 2..1440 samples") }
 previous := -1.0
 for _, h := range req.TerrainHorizon {
  if !validDirection(direction{AzimuthDeg:h.AzimuthDeg,ElevationDeg:h.ElevationDeg}) || h.AzimuthDeg <= previous { return errors.New("terrain_horizon must have increasing, bounded azimuths") }
  previous = h.AzimuthDeg
 }
 if req.Provenance.TerrainDatasetID == "" || req.Provenance.EphemerisID == "" || req.Provenance.Frame != "MOON_ME" { return errors.New("provenance identifiers and MOON_ME frame required; identifiers are not verified") }
 return nil
}

func writeJSON(w http.ResponseWriter, code int, payload any) {
 w.Header().Set("Content-Type", "application/json; charset=utf-8")
 w.Header().Set("Cache-Control", "no-store")
 w.WriteHeader(code)
 _ = json.NewEncoder(w).Encode(payload)
}
func routes(binary string) http.Handler {
 mux := http.NewServeMux()
 mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
  writeJSON(w,http.StatusOK,map[string]string{"service":"braspace-api","status":"alive","science_status":"UNVERIFIED_INPUTS"})
 })
 mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
  st,err:=os.Stat(binary)
  if err!=nil || st.IsDir() || st.Mode()&0111==0 {
   writeJSON(w,http.StatusServiceUnavailable,map[string]string{"status":"engine_unavailable"})
   return
  }
  writeJSON(w,http.StatusOK,map[string]string{"status":"ready","science_status":"UNVERIFIED_INPUTS"})
 })
 mux.HandleFunc("GET /v1/capabilities", func(w http.ResponseWriter, r *http.Request) {
  writeJSON(w,http.StatusOK,map[string]any{
   "version":"braspace.visibility.v1",
   "caller_supplied_look_angles":true,
   "caller_supplied_terrain_horizon":true,
   "nasa_lola_loaded":false,
   "naif_spice_loaded":false,
   "scientifically_validated":false,
   "maximum_horizon_samples":1440,
  })
 })
 mux.HandleFunc("POST /v1/visibility", func(w http.ResponseWriter, r *http.Request) {
  if ct:=r.Header.Get("Content-Type"); !strings.HasPrefix(ct,"application/json") {
   writeJSON(w,http.StatusUnsupportedMediaType,map[string]string{"error":"application/json required"}); return
  }
  raw,err:=io.ReadAll(io.LimitReader(r.Body,maxRequestBytes+1))
  if err!=nil || len(raw)>maxRequestBytes {
   writeJSON(w,http.StatusRequestEntityTooLarge,map[string]string{"error":"request too large"}); return
  }
  dec:=json.NewDecoder(bytes.NewReader(raw)); dec.DisallowUnknownFields()
  var req visibilityRequest
  if err=dec.Decode(&req); err!=nil { writeJSON(w,http.StatusBadRequest,map[string]string{"error":"invalid JSON contract"}); return }
  var extra any
  if err=dec.Decode(&extra); err!=io.EOF { writeJSON(w,http.StatusBadRequest,map[string]string{"error":"trailing JSON payload"}); return }
  if err=validate(req); err!=nil { writeJSON(w,http.StatusUnprocessableEntity,map[string]string{"error":err.Error()}); return }
  normalized,err:=json.Marshal(req)
  if err!=nil { writeJSON(w,http.StatusBadRequest,map[string]string{"error":"invalid JSON"}); return }
  ctx,cancel:=context.WithTimeout(r.Context(),2*time.Second); defer cancel()
  cmd:=exec.CommandContext(ctx,binary)
  cmd.Stdin=bytes.NewReader(normalized)
  var stdout,stderr bytes.Buffer
  cmd.Stdout=&stdout; cmd.Stderr=&stderr
  if err=cmd.Run(); err!=nil {
   msg:="engine execution failed"
   if errors.Is(ctx.Err(),context.DeadlineExceeded) { msg="engine deadline exceeded" }
   // Do not expose internal paths, source content or stderr to API clients.
   log.Printf("engine error: %v; stderr: %.300s",err,stderr.String())
   writeJSON(w,http.StatusBadGateway,map[string]string{"error":msg}); return
  }
  var result map[string]any
  if json.Unmarshal(stdout.Bytes(),&result)!=nil || result["science_status"]!="UNVERIFIED_INPUTS" {
   writeJSON(w,http.StatusBadGateway,map[string]string{"error":"engine returned invalid contract"}); return
  }
  // A reproducibility fingerprint of the exact normalized request, NOT of NASA assets.
  // Caller-supplied source identifiers are always labeled as *claimed*.
  fingerprint:=sha256.Sum256(normalized)
  result["evidence_passport"]=map[string]any{
   "protocol":"braspace.visibility.v1",
   "request_sha256":fmt.Sprintf("%x",fingerprint),
   "terrain_dataset_id_claimed":req.Provenance.TerrainDatasetID,
   "ephemeris_id_claimed":req.Provenance.EphemerisID,
   "frame_claimed":req.Provenance.Frame,
   "inputs_supplied_by_caller":true,
   "nasa_sources_verified":false,
   "scientific_validation":false,
   "replay_path":"/v1/visibility",
  }
  writeJSON(w,http.StatusOK,result)
 })
 mux.Handle("POST /api/onboard/evaluate", onboard.Handler())
 store,err:=loadDefaultStore()
 if err!=nil { panic(fmt.Errorf("site data: %w",err)) }
 (&missionAPI{store:store,engine:newEngineClient(binary)}).register(mux)
 return mux
}
func main() {
 bin:=os.Getenv("RUST_ENGINE_BIN")
 if bin=="" { bin="./bin/lunar-engine" }
 address:=os.Getenv("LISTEN_ADDR")
 if address=="" { address=":8080" }
 srv:=&http.Server{Addr:address,Handler:withMiddleware(routes(bin)),ReadHeaderTimeout:5*time.Second,
  ReadTimeout:10*time.Second,WriteTimeout:30*time.Second,IdleTimeout:60*time.Second,MaxHeaderBytes:16<<10}
 log.Printf("BRASPACE API %s; source data NOT validated",address)
 if err:=srv.ListenAndServe(); !errors.Is(err,http.ErrServerClosed) { log.Fatal(fmt.Errorf("listen: %w",err)) }
}
