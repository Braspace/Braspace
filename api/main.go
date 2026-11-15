// BRASPACE integration adapter: input is not scientific source-of-truth.
// The Rust engine classifies *supplied* look angles against a supplied skyline.
// No NASA ephemeris or terrain is computed or verified by this service.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Braspace/Braspace/api/onboard"
	"log"
	"math"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"time"
)

const maxRequestBytes = 128 << 10

// buildCommit is stamped at link time (-ldflags "-X main.buildCommit=<sha>") so
// /healthz names the commit actually running; local builds fall back to Go's
// embedded VCS stamp, and "unknown" is reported rather than guessed.
var buildCommit = ""

func runningCommit() string {
	if buildCommit != "" {
		return buildCommit
	}
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" && s.Value != "" {
				return s.Value
			}
		}
	}
	return "unknown"
}

type direction struct {
	AzimuthDeg   float64 `json:"azimuth_deg"`
	ElevationDeg float64 `json:"elevation_deg"`
}
type horizonSample struct {
	AzimuthDeg   float64 `json:"azimuth_deg"`
	ElevationDeg float64 `json:"elevation_deg"`
}
type provenance struct {
	TerrainDatasetID string `json:"terrain_dataset_id"`
	EphemerisID      string `json:"ephemeris_id"`
	Frame            string `json:"frame"`
}
type visibilityRequest struct {
	SiteID         string          `json:"site_id"`
	EpochUTC       string          `json:"epoch_utc"`
	Sun            direction       `json:"sun"`
	Earth          direction       `json:"earth"`
	TerrainHorizon []horizonSample `json:"terrain_horizon"`
	Provenance     provenance      `json:"provenance"`
}

// The wire representation distinguishes absent/null values from explicit 0°.
// Internal engine requests intentionally retain their plain numeric fields.
type visibilityAngleInput struct {
	AzimuthDeg   *float64 `json:"azimuth_deg"`
	ElevationDeg *float64 `json:"elevation_deg"`
}

func (a *visibilityAngleInput) complete() bool {
	return a != nil && a.AzimuthDeg != nil && a.ElevationDeg != nil
}

type visibilityInput struct {
	SiteID         string                  `json:"site_id"`
	EpochUTC       string                  `json:"epoch_utc"`
	Sun            *visibilityAngleInput   `json:"sun"`
	Earth          *visibilityAngleInput   `json:"earth"`
	TerrainHorizon []*visibilityAngleInput `json:"terrain_horizon"`
	Provenance     provenance              `json:"provenance"`
}

func (in visibilityInput) request() (visibilityRequest, error) {
	if !in.Sun.complete() || !in.Earth.complete() {
		return visibilityRequest{}, errors.New("sun and earth require non-null azimuth_deg and elevation_deg")
	}
	if len(in.TerrainHorizon) < 2 || len(in.TerrainHorizon) > 1440 {
		return visibilityRequest{}, errors.New("terrain_horizon must contain 2..1440 samples")
	}
	req := visibilityRequest{SiteID: in.SiteID, EpochUTC: in.EpochUTC,
		Sun:            direction{AzimuthDeg: *in.Sun.AzimuthDeg, ElevationDeg: *in.Sun.ElevationDeg},
		Earth:          direction{AzimuthDeg: *in.Earth.AzimuthDeg, ElevationDeg: *in.Earth.ElevationDeg},
		TerrainHorizon: make([]horizonSample, 0, len(in.TerrainHorizon)), Provenance: in.Provenance}
	for _, angle := range in.TerrainHorizon {
		if !angle.complete() {
			return visibilityRequest{}, errors.New("terrain_horizon samples require non-null azimuth_deg and elevation_deg")
		}
		req.TerrainHorizon = append(req.TerrainHorizon, horizonSample{AzimuthDeg: *angle.AzimuthDeg, ElevationDeg: *angle.ElevationDeg})
	}
	return req, validate(req)
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func validDirection(d direction) bool {
	return finite(d.AzimuthDeg) && finite(d.ElevationDeg) && d.AzimuthDeg >= 0 && d.AzimuthDeg < 360 && d.ElevationDeg >= -90 && d.ElevationDeg <= 90
}
func validate(req visibilityRequest) error {
	if req.SiteID == "" || len(req.SiteID) > 80 || strings.TrimSpace(req.SiteID) != req.SiteID {
		return errors.New("invalid site_id")
	}
	if _, err := time.Parse(time.RFC3339, req.EpochUTC); err != nil {
		return errors.New("epoch_utc must be RFC3339")
	}
	if !validDirection(req.Sun) || !validDirection(req.Earth) {
		return errors.New("invalid look angles")
	}
	if len(req.TerrainHorizon) < 2 || len(req.TerrainHorizon) > 1440 {
		return errors.New("terrain_horizon must contain 2..1440 samples")
	}
	previous := -1.0
	for _, h := range req.TerrainHorizon {
		if !validDirection(direction{AzimuthDeg: h.AzimuthDeg, ElevationDeg: h.ElevationDeg}) || h.AzimuthDeg <= previous {
			return errors.New("terrain_horizon must have increasing, bounded azimuths")
		}
		previous = h.AzimuthDeg
	}
	if req.Provenance.TerrainDatasetID == "" || req.Provenance.EphemerisID == "" || req.Provenance.Frame != "MOON_ME" {
		return errors.New("provenance identifiers and MOON_ME frame required; identifiers are not verified")
	}
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
		writeJSON(w, http.StatusOK, map[string]string{"service": "braspace-api", "status": "alive", "science_status": "UNVERIFIED_INPUTS", "build_commit": runningCommit()})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		st, err := os.Stat(binary)
		if err != nil || st.IsDir() || st.Mode()&0111 == 0 {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "engine_unavailable"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "science_status": "UNVERIFIED_INPUTS"})
	})
	mux.HandleFunc("GET /v1/capabilities", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"version":                         "braspace.visibility.v1",
			"caller_supplied_look_angles":     true,
			"caller_supplied_terrain_horizon": true,
			"nasa_lola_loaded":                false,
			"naif_spice_loaded":               false,
			"scientifically_validated":        false,
			"maximum_horizon_samples":         1440,
		})
	})
	mux.HandleFunc("POST /v1/visibility", func(w http.ResponseWriter, r *http.Request) {
		var input visibilityInput
		if err := decodeJSON(r, &input); err != nil {
			writeError(w, err)
			return
		}
		req, err := input.request()
		if err != nil {
			writeError(w, errf(http.StatusUnprocessableEntity, "INVALID_VISIBILITY_INPUT", "%s", err))
			return
		}
		normalized, err := json.Marshal(req)
		if err != nil {
			writeError(w, errf(http.StatusBadRequest, "INVALID_JSON", "invalid JSON"))
			return
		}
		engine := newEngineClient(binary)
		_, out, err := engine.callRaw(r.Context(), req)
		if err != nil {
			// Same codes as the mission routes: 503 ENGINE_UNAVAILABLE, 504 ENGINE_TIMEOUT, 502 ENGINE_ERROR.
			writeError(w, err)
			return
		}
		var result map[string]any
		if json.Unmarshal(out, &result) != nil {
			writeError(w, errEngineContract)
			return
		}
		// A reproducibility fingerprint of the exact normalized request, NOT of NASA assets.
		// Caller-supplied source identifiers are always labeled as *claimed*.
		fingerprint := sha256.Sum256(normalized)
		result["evidence_passport"] = map[string]any{
			"protocol":                   "braspace.visibility.v1",
			"request_sha256":             fmt.Sprintf("%x", fingerprint),
			"terrain_dataset_id_claimed": req.Provenance.TerrainDatasetID,
			"ephemeris_id_claimed":       req.Provenance.EphemerisID,
			"frame_claimed":              req.Provenance.Frame,
			"inputs_supplied_by_caller":  true,
			"nasa_sources_verified":      false,
			"scientific_validation":      false,
			"replay_path":                "/v1/visibility",
		}
		writeJSON(w, http.StatusOK, result)
	})
	mux.Handle("POST /api/onboard/evaluate", onboard.Handler())
	mux.Handle("POST /api/onboard/report", onboard.ReportHandler())
	store, err := loadDefaultStore()
	if err != nil {
		panic(fmt.Errorf("site data: %w", err))
	}
	(&missionAPI{store: store, engine: newEngineClient(binary)}).register(mux)
	registerLayers(mux, store)
	registerVectorAPI(mux) // optional, disabled by default; never changes mission physics
	return mux
}
func main() {
	if len(os.Args) > 1 {
		os.Exit(runCLI(os.Args[1:]))
	}
	bin := os.Getenv("RUST_ENGINE_BIN")
	if bin == "" {
		bin = "./bin/lunar-engine"
	}
	address := os.Getenv("LISTEN_ADDR")
	if address == "" {
		address = ":8080"
	}
	if _, err := loadDefaultStore(); err != nil {
		log.Printf("site data rejected, not starting: %v", err)
		os.Exit(1)
	}
	srv := &http.Server{Addr: address, Handler: withMiddleware(routes(bin)), ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	log.Printf("BRASPACE API %s; source data NOT validated", address)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(fmt.Errorf("listen: %w", err))
	}
}
