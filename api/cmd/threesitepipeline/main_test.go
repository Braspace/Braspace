package main

import (
	"bytes"
	"github.com/Braspace/Braspace/api/sitevis"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const label = `PRODUCT = LDEM_80S_80M.IMG
MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"
POSITIVE_LONGITUDE_DIRECTION = "EAST"
CENTER_LATITUDE = -90 <deg>
CENTER_LONGITUDE = 0 <deg>
MAP_PROJECTION_ROTATION = 0
SAMPLE_TYPE = "LSB_INTEGER"
SAMPLE_BITS = 16
COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"
KEYWORD_LATITUDE_TYPE = "PLANETOCENTRIC"
LINE_SAMPLES = 101
LINES = 101
MAP_SCALE = 80 <m/pix>
A_AXIS_RADIUS = 1737.4 <km>
LINE_PROJECTION_OFFSET = 50.0 <pix>
SAMPLE_PROJECTION_OFFSET = 50.0 <pix>
SCALING_FACTOR = 0.5
`

func runCLI(args ...string) (int, string, string) {
	var out, errb bytes.Buffer
	rc := run(args, &out, &errb)
	return rc, out.String(), errb.String()
}

func TestMissingArgumentsExit2(t *testing.T) {
	rc, _, stderr := runCLI("--img", "a")
	if rc != 2 || !strings.Contains(stderr, "the following arguments are required: --label, --kernels-dir, --out-dir") {
		t.Errorf("rc=%d %q", rc, stderr)
	}
}

// The same fail-closed order as the Python: label -> SHA-256 of the DEM -> kernels.
func TestFailClosed(t *testing.T) {
	d := t.TempDir()
	lbl, img := filepath.Join(d, "x.lbl"), filepath.Join(d, "x.img")
	os.WriteFile(lbl, []byte(label), 0o644)
	os.WriteFile(img, make([]byte, 10202), 0o644)
	base := func(l, i string) []string {
		return []string{"--img", i, "--label", l, "--kernels-dir", d, "--out-dir", filepath.Join(d, "out")}
	}
	if rc, _, e := runCLI(base(lbl, img)...); rc != 1 || !strings.HasPrefix(e, "LOLA SHA-256 mismatch: ") {
		t.Errorf("sha mismatch must be a bare SystemExit message: rc=%d %q", rc, e)
	}
	if rc, _, e := runCLI(base(filepath.Join(d, "none.lbl"), img)...); rc != 1 || !strings.Contains(e, "FileNotFoundError") {
		t.Errorf("missing label: rc=%d %q", rc, e)
	}
	os.WriteFile(lbl, []byte(strings.Replace(label, "EAST", "WEST", 1)), 0o644)
	if rc, _, e := runCLI(base(lbl, img)...); rc != 1 || !strings.Contains(e, "ValueError: only planetocentric south-pole east-positive coverage supported") {
		t.Errorf("bad label: rc=%d %q", rc, e)
	}
	if _, err := os.Stat(filepath.Join(d, "out")); err == nil {
		t.Error("nothing may be written when an input check fails")
	}
}

func TestMetricsOnASyntheticSeries(t *testing.T) {
	horizon := make([]float64, 360) // flat 1 deg skyline
	for i := range horizon {
		horizon[i] = 1
	}
	mk := func(sunEl, earthEl float64) sample {
		return sample{sunAz: 10, sunEl: sunEl, earthAz: 200, earthEl: earthEl}
	}
	s := []sample{mk(2, 2), mk(2, 0), mk(1, 0), mk(0, 0), mk(0.5, 3), mk(3, 3)}
	m, err := computeMetrics(s, horizon, 30)
	if err != nil {
		t.Fatal(err)
	}
	// sun centre above the 1 deg horizon in samples 0,1,2 (margin 0 counts) and 5; earth in 0,4,5;
	// disc fractions 1, 1, 0.5, 0, 0, 1
	want := map[string]any{"sun_center_visible_pct": 66.67, "earth_center_visible_pct": 50.0, "sun_and_earth_visible_pct": 33.33,
		"longest_darkness_h": 1.0, "longest_continuous_sunlight_h": 1.5, "longest_earth_blackout_h": 1.5, "max_sun_elevation_deg": 3.0, "mean_solar_disc_visible_pct": 58.33,
		"samples": 6, "step_minutes": 30}
	got := m.obj()
	for k, v := range want {
		g, _ := got.Get(k)
		if g != v {
			t.Errorf("%s = %v, want %v", k, g, v)
		}
	}
	if s[1].sunMargin != 1 || s[3].sunMargin != -1 || s[5].sunDiscFract != 1 || s[3].sunDiscFract != 0 {
		t.Errorf("margins/disc: %+v", s)
	}
	if _, err := computeMetrics(nil, horizon, 60); err == nil || err.Error() != "ZeroDivisionError: float division by zero" {
		t.Errorf("empty series: %v", err)
	}
}

// Ported from science/tests/test_solar_disc_fraction.py (#291): a sun centre half a radius above a flat
// horizon is fully "centre visible" and shows 80.45 % of the disc (the inverted port reported 19.55 %).
func TestMetricsPreservePartialSolarDisc(t *testing.T) {
	horizon := make([]float64, 360)
	m, err := computeMetrics([]sample{{sunAz: 0, sunEl: sitevis.SunRadiusDeg / 2, earthAz: 0, earthEl: 1}}, horizon, 60)
	if err != nil {
		t.Fatal(err)
	}
	got := m.obj()
	if v, _ := got.Get("sun_center_visible_pct"); v != 100.0 {
		t.Errorf("sun_center_visible_pct = %v", v)
	}
	if v, _ := got.Get("mean_solar_disc_visible_pct"); v != 80.45 {
		t.Errorf("mean_solar_disc_visible_pct = %v, want 80.45", v)
	}
}

// With real inputs (NAIF_KERNEL_DIR and LOLA_DIR holding ldem_80s_80m.img/.lbl) the committed
// science/results/summary.json must be reproduced, apart from its generated_utc timestamp.
func TestReproducesCommittedSummary(t *testing.T) {
	kdir, ldir := os.Getenv("NAIF_KERNEL_DIR"), os.Getenv("LOLA_DIR")
	if kdir == "" || ldir == "" {
		t.Skip("NAIF_KERNEL_DIR / LOLA_DIR not set: NASA inputs are not in the repository; skipping")
	}
	img, lbl := filepath.Join(ldir, "ldem_80s_80m.img"), filepath.Join(ldir, "ldem_80s_80m.lbl")
	if _, err := os.Stat(img); err != nil {
		t.Skip("DEM missing in LOLA_DIR; skipping")
	}
	out := t.TempDir()
	rc, stdout, stderr := runCLI("--img", img, "--label", lbl, "--kernels-dir", kdir, "--out-dir", out,
		"--start-utc", "2025-01-01T00:00:00Z", "--hours", "35064")
	if rc != 0 {
		t.Fatalf("rc=%d %s", rc, stderr)
	}
	if n := strings.Count(stdout, "\n"); n != 5 {
		t.Errorf("expected one line per site, got %d", n)
	}
	strip := func(b []byte) string {
		var keep []string
		for _, l := range strings.Split(string(b), "\n") {
			if !strings.Contains(l, "generated_utc") {
				keep = append(keep, l)
			}
		}
		return strings.Join(keep, "\n")
	}
	got, _ := os.ReadFile(filepath.Join(out, "summary.json"))
	want, err := os.ReadFile("../../../science/results/summary.json")
	if err != nil {
		t.Fatal(err)
	}
	if strip(got) != strip(want) {
		t.Error("summary.json differs from the committed science/results/summary.json")
	}
}
