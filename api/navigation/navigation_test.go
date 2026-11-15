package navigation

import (
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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
		"duration NaN":       func(r *Request) { r.DurationHours = fptr(math.NaN()) },
		"step zero":          func(r *Request) { r.StepMinutes = fptr(0) },
		"step NaN":           func(r *Request) { r.StepMinutes = fptr(math.NaN()) },
		"empty grid":         func(r *Request) { r.DurationHours = fptr(1); r.StepMinutes = fptr(360) },
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

func TestFractionalMinuteEpochs(t *testing.T) {
	r := baseReq()
	r.DurationHours = fptr(1)
	r.StepMinutes = fptr(1.5)
	resp, err := Compute(r)
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Samples) != 40 || resp.Summary.TotalH != 1 {
		t.Fatalf("got %d samples and %.6f hours, want 40 and 1", len(resp.Samples), resp.Summary.TotalH)
	}
	start, err := time.Parse(time.RFC3339, r.StartUTC)
	if err != nil {
		t.Fatal(err)
	}
	for i, sample := range resp.Samples {
		want := start.Add(time.Duration(i) * 90 * time.Second).Format(time.RFC3339)
		if sample.EpochUTC != want {
			t.Fatalf("sample %d epoch = %s, want %s", i, sample.EpochUTC, want)
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

func TestStartUTCContract(t *testing.T) {
	post := func(body string) (int, string) {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/onboard/navigation", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		Handler().ServeHTTP(w, req)
		return w.Code, w.Body.String()
	}
	rest := `"lat":-89.5,"lon":45,"duration_hours":24,"step_minutes":60`
	code, out := post(`{` + rest + `}`)
	if code != http.StatusUnprocessableEntity || !strings.Contains(out, `"INVALID_INPUT"`) || !strings.Contains(out, "start_utc is required (RFC 3339 UTC)") {
		t.Errorf("missing start_utc: %d %s", code, out)
	}
	if code, out = post(`{` + rest + `,"start_utc":"ontem"}`); code != http.StatusUnprocessableEntity || !strings.Contains(out, "must be RFC 3339") {
		t.Errorf("invalid start_utc: %d %s", code, out)
	}
	if code, out = post(`{` + rest + `,"start_utc":"2026-12-01T00:00:00Z"}`); code != http.StatusOK {
		t.Errorf("valid start_utc: %d %s", code, out)
	}
}

func TestHandlerRejectsAmbiguousJSONAndEmptyGrid(t *testing.T) {
	const valid = `{"lat":-89.5,"lon":45,"start_utc":"2026-12-01T00:00:00Z","duration_hours":24,"step_minutes":60}`
	h := Handler()
	for _, tc := range []struct {
		name string
		body string
		code int
	}{
		{"trailing document", valid + `{}`, http.StatusBadRequest},
		{"trailing garbage", valid + `!`, http.StatusBadRequest},
		{"duplicate field", strings.Replace(valid, `"lat":-89.5`, `"lat":-89.5,"lat":0`, 1), http.StatusBadRequest},
		{"case alias", strings.Replace(valid, `"lat"`, `"LAT"`, 1), http.StatusBadRequest},
		{"empty grid", strings.Replace(strings.Replace(valid, `"duration_hours":24`, `"duration_hours":1`, 1), `"step_minutes":60`, `"step_minutes":360`, 1), http.StatusUnprocessableEntity},
		{"trailing whitespace", valid + "\n\t ", http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/onboard/navigation", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != tc.code {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.code, w.Body.String())
			}
		})
	}
}
