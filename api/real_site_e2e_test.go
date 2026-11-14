package main

import (
	"encoding/json"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

// BS-021: end-to-end check for one real site and date. The series for
// connecting-ridge is derived from NASA LOLA LDEM_80S_80M and NAIF SPICE
// (status PRELIMINARY). The API result is compared against an independent
// recomputation from the raw series file, so a wrong index, epoch shift or
// horizon lookup anywhere in the chain would show up here.

const (
	realSite   = "connecting-ridge"
	realStart  = "2026-11-15T00:00:00Z"
	realHours  = 72
	lolaSHA256 = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"
)

type rawSeries struct {
	StartUTC       string          `json:"start_utc"`
	StepSeconds    int             `json:"step_seconds"`
	TerrainHorizon []horizonSample `json:"terrain_horizon"`
	Samples        []seriesSample  `json:"samples"`
}

// periodicHorizon is an independent copy of the engine's linear, 360°-periodic
// horizon interpolation.
func periodicHorizon(h []horizonSample, az float64) float64 {
	i := sort.Search(len(h), func(i int) bool { return h[i].AzimuthDeg > az })
	var la, le, ra, re float64
	switch {
	case i == 0:
		la, le, ra, re = h[len(h)-1].AzimuthDeg-360, h[len(h)-1].ElevationDeg, h[0].AzimuthDeg, h[0].ElevationDeg
	case i == len(h):
		la, le, ra, re = h[len(h)-1].AzimuthDeg, h[len(h)-1].ElevationDeg, h[0].AzimuthDeg+360, h[0].ElevationDeg
	default:
		la, le, ra, re = h[i-1].AzimuthDeg, h[i-1].ElevationDeg, h[i].AzimuthDeg, h[i].ElevationDeg
	}
	return le + (re-le)*(az-la)/(ra-la)
}

func realCompare(t *testing.T, h http.Handler) map[string]any {
	t.Helper()
	body := `{"site_ids":["` + realSite + `"],"start_utc":"` + realStart + `","duration_hours":72,"include_series":true}`
	rec := do(h, "POST", "/api/compare", body)
	if rec.Code != 200 {
		t.Fatalf("compare on real site: %d %s", rec.Code, rec.Body.String())
	}
	return decode(t, rec)
}

func TestRealSiteEndToEnd(t *testing.T) {
	st, err := loadDefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	ser, ok := st.seriesFor(realSite)
	if !ok {
		t.Skip("no real series for " + realSite + " in this checkout")
	}
	h, _ := testAPI(t, "ok")
	out := realCompare(t, h)
	r := out["results"].([]any)[0].(map[string]any)

	// Provenance and honesty: real NASA inputs, never presented as validated.
	if r["data_status"] != "AVAILABLE" || r["science_status"] != ser.ScienceStatus || ser.ScienceStatus == "VALIDATED" {
		t.Fatalf("status: %v / %v", r["data_status"], r["science_status"])
	}
	if out["scientifically_validated"] != false {
		t.Fatal("a PRELIMINARY series must not be reported as scientifically validated")
	}
	prov := r["provenance"].(map[string]any)
	if prov["terrain_sha256"] != lolaSHA256 || prov["frame"] != "MOON_ME" {
		t.Fatalf("provenance does not point at the verified LOLA product: %v", prov)
	}

	// Independent recomputation from the raw file.
	raw, err := os.ReadFile(filepath.Join("sitedata", "series", realSite+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var rs rawSeries
	if err := json.Unmarshal(raw, &rs); err != nil {
		t.Fatal(err)
	}
	start, _ := time.Parse(time.RFC3339, rs.StartUTC)
	want, _ := time.Parse(time.RFC3339, realStart)
	from := int(want.Sub(start) / (time.Duration(rs.StepSeconds) * time.Second))

	ev := r["evaluation"].(map[string]any)
	series := ev["series"].([]any)
	if len(series) != realHours {
		t.Fatalf("series length %d, want %d", len(series), realHours)
	}
	sunN, earthN := 0, 0
	for k, p := range series {
		pt := p.(map[string]any)
		smp := rs.Samples[from+k]
		wantEpoch := start.Add(time.Duration(from+k) * time.Duration(rs.StepSeconds) * time.Second).Format(time.RFC3339)
		sunM := smp.Sun.ElevationDeg - periodicHorizon(rs.TerrainHorizon, smp.Sun.AzimuthDeg)
		earthM := smp.Earth.ElevationDeg - periodicHorizon(rs.TerrainHorizon, smp.Earth.AzimuthDeg)
		if pt["epoch_utc"] != wantEpoch {
			t.Fatalf("sample %d epoch %v, want %s", k, pt["epoch_utc"], wantEpoch)
		}
		if pt["sun_visible"] != (sunM >= 0) || pt["earth_visible"] != (earthM >= 0) {
			t.Fatalf("sample %d (%s): visibility differs from the raw series", k, wantEpoch)
		}
		if math.Abs(pt["sun_margin_deg"].(float64)-sunM) > 1e-6 || math.Abs(pt["earth_margin_deg"].(float64)-earthM) > 1e-6 {
			t.Fatalf("sample %d: margins differ from the raw series", k)
		}
		if sunM >= 0 {
			sunN++
		}
		if earthM >= 0 {
			earthN++
		}
	}
	m := ev["metrics"].(map[string]any)
	if m["sun_visible_fraction"] != round6(float64(sunN)/realHours) || m["earth_visible_fraction"] != round6(float64(earthN)/realHours) {
		t.Fatalf("fractions %v/%v do not match %d/%d of %d samples", m["sun_visible_fraction"], m["earth_visible_fraction"], sunN, earthN, realHours)
	}

	// The delay replan runs on the same real data.
	rec := do(h, "POST", "/api/scenarios/delay", `{"site_id":"`+realSite+`","start_utc":"`+realStart+`","duration_hours":72,"delays_hours":[24],"include_nearby":false,"constraints":{"max_continuous_comm_gap_hours":24}}`)
	if rec.Code != 200 {
		t.Fatalf("delay replan on real site: %d %s", rec.Code, rec.Body.String())
	}
	opts := decode(t, rec)["options"].([]any)
	for _, o := range opts {
		if o.(map[string]any)["data_status"] != "AVAILABLE" {
			t.Fatalf("real-site option not evaluated: %v", o)
		}
	}
}

// With the Rust binary built, the real engine must give the same answer as the
// test engine on the real site.
func TestRealSiteRustEngineAgrees(t *testing.T) {
	if _, ok := mustStore(t).seriesFor(realSite); !ok {
		t.Skip("no real series")
	}
	bin, _ := filepath.Abs("../engine/target/debug/braspace-lunar-engine")
	if _, err := os.Stat(bin); err != nil {
		t.Skip("Rust engine not built")
	}
	mux := http.NewServeMux()
	(&missionAPI{store: mustStore(t), engine: newEngineClient(bin)}).register(mux)
	fake, _ := testAPI(t, "ok")
	a, b := realCompare(t, mux), realCompare(t, fake)
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatal("real Rust engine and test engine disagree on the real site")
	}
}

func mustStore(t *testing.T) *siteStore {
	t.Helper()
	st, err := loadDefaultStore()
	if err != nil {
		t.Fatal(err)
	}
	return st
}
