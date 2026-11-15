package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeHorizons answers like the Horizons API for the epochs in TLIST, with Sun/Earth on the horizon (el=0,
// so cos(el)=1) at az 100 + 10*i; it never reaches the network.
func fakeHorizons(t *testing.T, seen *[]map[string]string) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := map[string]string{}
		for k, v := range r.URL.Query() {
			q[k] = v[0]
		}
		*seen = append(*seen, q)
		times := strings.Split(q["TLIST"], "' '")
		var rows []string
		for i, tm := range times {
			rows = append(rows, fmt.Sprintf(" %s, , , %.6f, 0.000000,", strings.Trim(tm, "'"), 100+10*float64(i)))
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"result": "x\n$$SOE\n" + strings.Join(rows, "\n") + "\n$$EOE\ny"})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func writeSite(t *testing.T, azOff, elOff float64) string {
	var series []map[string]any
	for i := 0; i < 5; i++ {
		s := map[string]any{"t": fmt.Sprintf("2025-01-0%dT00:00Z", i+1)}
		for _, k := range []string{"sun", "earth"} {
			s[k+"_az"] = 100 + 10*float64(i) + azOff
			s[k+"_el"] = elOff
		}
		series = append(series, s)
	}
	b, _ := json.Marshal(map[string]any{"site": map[string]any{"id": "syn", "latitude_deg": -89.4632, "longitude_deg": -137.49,
		"site_elevation_m": 1234.5678, "observer_height_m": 2.0}, "series": series})
	p := filepath.Join(t.TempDir(), "site.json")
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestReportAgainstSyntheticHorizonsServer(t *testing.T) {
	var seen []map[string]string
	srv := fakeHorizons(t, &seen)
	out := filepath.Join(t.TempDir(), "report.json")
	var so, se bytes.Buffer
	code := run([]string{"-samples", "5", "-output", out, "-api-url", srv.URL, writeSite(t, 0.003, 0.0012)}, &so, &se, defaultAPI)
	if code != 0 {
		t.Fatalf("exit %d: %s", code, se.String())
	}
	want := `{"site": "syn", "comparisons": [{"body": "sun", "n": 5, "max_abs_az_diff_deg_cos_el": 0.003, "max_abs_el_diff_deg": 0.0012}, ` +
		`{"body": "earth", "n": 5, "max_abs_az_diff_deg_cos_el": 0.003, "max_abs_el_diff_deg": 0.0012}]}` + "\n"
	if so.String() != want {
		t.Fatalf("stdout\n got %s\nwant %s", so.String(), want)
	}
	if len(seen) != 2 || seen[0]["COMMAND"] != "'10'" || seen[1]["COMMAND"] != "'399'" {
		t.Fatalf("expected one request per body, saw %v", seen)
	}
	// longitude wrapped to 0..360, altitude (site + mast) in km with 4 decimals.
	if got := seen[0]["SITE_COORD"]; got != "'222.510000,-89.463200,1.2366'" {
		t.Errorf("SITE_COORD %s", got)
	}
	if seen[0]["TLIST"] != "'2025-01-01 00:00' '2025-01-02 00:00' '2025-01-03 00:00' '2025-01-04 00:00' '2025-01-05 00:00'" {
		t.Errorf("TLIST %s", seen[0]["TLIST"])
	}
	rep, _ := os.ReadFile(out)
	if !strings.HasPrefix(string(rep), "{\n  \"reference\": \"JPL Horizons API, topocentric AZ-EL quantity 4, airless\",\n  \"results\": [\n    {\n      \"site\": \"syn\",") ||
		!strings.HasSuffix(string(rep), "}\n") {
		t.Errorf("report layout:\n%s", rep)
	}
}

func TestAzimuthDifferenceWrapsAround360(t *testing.T) {
	if got := angdiff(359.99, 0.01); got < -0.0200001 || got > -0.0199999 {
		t.Fatalf("angdiff across north = %v", got)
	}
}

func TestMissingEphemerisIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"result": "No ephemeris for target"})
	}))
	defer srv.Close()
	var so, se bytes.Buffer
	if code := run([]string{"-samples", "5", "-api-url", srv.URL, writeSite(t, 0, 0)}, &so, &se, defaultAPI); code != 1 ||
		!strings.Contains(se.String(), "Horizons returned no ephemeris") {
		t.Fatalf("exit %d, stderr %q", code, se.String())
	}
}
