package navigation

import (
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fptr(v float64) *float64 { return &v }
func iptr(v int) *int         { return &v }

func baseReq() Request {
	return Request{
		Lat:           fptr(-89.5),
		Lon:           fptr(45),
		StartUTC:      "2026-12-01T00:00:00Z",
		DurationHours: fptr(720),
		StepMinutes:   fptr(120),
		GDOPLimit:     fptr(1000),
	}
}

// Parity with web/onboard/nav.js: the same request gives the same numbers in the browser model.
// Reference values were computed with nav.js (track + summary, GDOP limit 1000, minimum 4 satellites).
func TestParityWithBrowserModel(t *testing.T) {
	resp, err := Compute(baseReq())
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Samples) != 360 {
		t.Fatalf("samples = %d, want 360", len(resp.Samples))
	}
	satSum := 0
	gSum := 0.0
	finite := 0
	for _, s := range resp.Samples {
		satSum += s.Satellites
		if s.GDOP != nil {
			gSum += *s.GDOP
			finite++
		}
	}
	if satSum != 1691 {
		t.Errorf("satellite total = %d, want 1691", satSum)
	}
	if finite != 146 {
		t.Errorf("finite GDOP samples = %d, want 146", finite)
	}
	if math.Abs(gSum-558003.0636043891)/558003.0636043891 > 1e-4 { // relative: samples with GDOP near 4e5 amplify float error
		t.Errorf("GDOP total = %.6f, want 558003.063604", gSum)
	}
	if math.Abs(resp.Summary.Availability-0.3) > 1e-12 {
		t.Errorf("availability = %v, want 0.3", resp.Summary.Availability)
	}
	if resp.Summary.OutageCount != 9 || resp.Summary.LongestOutageH != 432 {
		t.Errorf("outages = %d / %v h, want 9 / 432", resp.Summary.OutageCount, resp.Summary.LongestOutageH)
	}
	if resp.Summary.MinSatellites != 0 {
		t.Errorf("min satellites = %d, want 0", resp.Summary.MinSatellites)
	}
	if resp.Summary.MedianGDOP == nil || math.Abs(*resp.Summary.MedianGDOP-721.6024455594243) > 1e-6 {
		t.Errorf("median GDOP = %v, want 721.602446", resp.Summary.MedianGDOP)
	}
	if resp.ModelStatus != "SYNTHETIC" {
		t.Errorf("model status = %q, must stay SYNTHETIC", resp.ModelStatus)
	}
}

func TestGDOPHandComputedCase(t *testing.T) {
	g, ok := gdop([]vec{{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, 0, 1}})
	if !ok || math.Abs(g-2) > 1e-9 {
		t.Fatalf("gdop = %v ok=%v, want 2", g, ok)
	}
	if _, ok := gdop([]vec{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}); ok {
		t.Fatal("three satellites must not give a solution")
	}
}

func TestEarthOccultsSatelliteBehindIt(t *testing.T) {
	P := DefaultPremises()
	site := unitFromLatLon(90, 0)
	for i := range site {
		site[i] *= P.MoonRadiusKm
	}
	E := vec{P.EarthMoonKm * math.Cos(40*d2r), 0, P.EarthMoonKm * math.Sin(40*d2r)}
	var d vec
	for i := range d {
		d[i] = E[i] - site[i]
	}
	length := math.Sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2])
	var behind vec
	for i := range behind {
		behind[i] = site[i] + d[i]*(1+30000/length)
	}
	if _, ok := usable(behind, site, E, P); ok {
		t.Fatal("satellite behind the Earth must be occulted")
	}
}

func TestValidationRejectsBadInput(t *testing.T) {
	cases := map[string]func(*Request){
		"missing lat":        func(r *Request) { r.Lat = nil },
		"lat out of range":   func(r *Request) { r.Lat = fptr(95) },
		"bad start":          func(r *Request) { r.StartUTC = "ontem" },
		"duration zero":      func(r *Request) { r.DurationHours = fptr(0) },
		"duration too long":  func(r *Request) { r.DurationHours = fptr(721) },
		"step zero":          func(r *Request) { r.StepMinutes = fptr(0) },
		"too many samples":   func(r *Request) { r.StepMinutes = fptr(1); r.DurationHours = fptr(720) },
		"gdop limit zero":    func(r *Request) { r.GDOPLimit = fptr(0) },
		"min satellites big": func(r *Request) { r.MinSatellites = iptr(25) },
	}
	for name, mutate := range cases {
		r := baseReq()
		mutate(&r)
		if _, err := Compute(r); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestHandlerContract(t *testing.T) {
	h := Handler()
	body := `{"lat":-89.5,"lon":45,"start_utc":"2026-12-01T00:00:00Z","duration_hours":24,"step_minutes":60}`
	ok := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/onboard/navigation", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(ok, req)
	ok.Result().Body.Close()
	if ok.Code != http.StatusOK {
		t.Fatalf("valid request: status %d", ok.Code)
	}
	bad := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/onboard/navigation", strings.NewReader(`{"lat":0,"lon":0,"extra":1}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(bad, req)
	if bad.Code != http.StatusBadRequest {
		t.Fatalf("unknown field: status %d, want 400", bad.Code)
	}
	wrong := httptest.NewRecorder()
	h.ServeHTTP(wrong, httptest.NewRequest(http.MethodPost, "/api/onboard/navigation", strings.NewReader(body)))
	if wrong.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("no content type: status %d, want 415", wrong.Code)
	}
}
