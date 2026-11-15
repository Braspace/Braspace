package main

import (
	"bytes"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
	"github.com/Braspace/Braspace/api/lolahorizon"
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

func synthDEM(t *testing.T) *lolahorizon.DEM {
	t.Helper()
	g, err := lolahorizon.FromLabel(label)
	if err != nil {
		t.Fatal(err)
	}
	raw := make([]byte, 101*101*2)
	for r := 0; r < 101; r++ {
		for c := 0; c < 101; c++ {
			dn := int16(200 + 60*math.Sin(float64(c)/7)*math.Cos(float64(r)/5) + float64(c+r))
			binary.LittleEndian.PutUint16(raw[(r*101+c)*2:], uint16(dn))
		}
	}
	p := filepath.Join(t.TempDir(), "synth.img")
	os.WriteFile(p, raw, 0o644)
	dem, err := lolahorizon.NewDEM(p, g)
	if err != nil {
		t.Fatal(err)
	}
	return dem
}

// The study's control: its 100 km (here 1.6 km) march is exactly the library's SampleHorizon.
func TestMarchReproducesSampleHorizonAndCountsPartialRays(t *testing.T) {
	dem := synthDEM(t)
	h, partial, err := march(dem, -89.95, 0, 2, []int{1600, 3200})
	if err != nil {
		t.Fatal(err)
	}
	ref, err := lolahorizon.SampleHorizon(dem, -89.95, 0, 2, 1600, 160, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(h[1600]) != 360 || len(h[3200]) != 360 {
		t.Fatalf("360 azimuths per reach, got %d and %d", len(h[1600]), len(h[3200]))
	}
	for az, s := range ref.Horizon {
		if h[1600][az] != s.ElevationDeg {
			t.Fatalf("azimuth %d: march %v, SampleHorizon %v", az, h[1600][az], s.ElevationDeg)
		}
	}
	if partial[1600] != 0 || partial[3200] == 0 {
		t.Errorf("partial azimuths: %v (the 3.2 km reach leaves the 4 km raster on some azimuths)", partial)
	}
	for az := range h[3200] {
		if h[3200][az] < h[1600][az] {
			t.Fatalf("a longer reach can only raise the running maximum (az %d)", az)
		}
	}
	if _, _, err := march(dem, -80.0, 0, 2, []int{1600}); err == nil || err.Error() != "ValueError: no DEM data at observer" {
		t.Errorf("observer outside the raster: %v", err)
	}
}

func TestRecountOnASyntheticSeries(t *testing.T) {
	flat := make([]float64, 360)
	for i := range flat {
		flat[i] = 1
	}
	s := series{n: 4, sunAz: []uint16{0, 100, 200, 300}, sunEl: []int16{300, 100, 0, -50}, earthAz: []uint16{0, 0, 0, 0}, earthEl: []int16{500, -10, -10, 500}}
	m := recount(s, flat)
	want := pyfmt.Obj{{K: "sun_center_visible_pct", V: 50.0}, {K: "mean_solar_disc_visible_pct", V: 37.5}, {K: "earth_center_visible_pct", V: 50.0},
		{K: "longest_darkness_h", V: 2.0}, {K: "longest_earth_blackout_h", V: 2.0}}
	if len(m) != len(want) {
		t.Fatalf("keys: %v", m)
	}
	for i := range want {
		if m[i].K != want[i].K || m[i].V != want[i].V {
			t.Errorf("%s = %v, want %v", m[i].K, m[i].V, want[i].V)
		}
	}
}

func runCLI(args ...string) (int, string, string) {
	var out, errb bytes.Buffer
	rc := run(args, &out, &errb)
	return rc, out.String(), errb.String()
}

func TestCLIContract(t *testing.T) {
	if rc, _, e := runCLI("--img", "x"); rc != 2 || !strings.Contains(e, "the following arguments are required: --label") {
		t.Errorf("missing args: %d %q", rc, e)
	}
	d := t.TempDir()
	img, lbl := filepath.Join(d, "x.img"), filepath.Join(d, "x.lbl")
	os.WriteFile(img, make([]byte, 10202), 0o644)
	os.WriteFile(lbl, []byte(label), 0o644)
	out := filepath.Join(d, "o.json")
	if rc, _, e := runCLI("--img", img, "--label", lbl, "--out", out); rc != 1 || e != "LDEM_80S_80M.IMG does not match the reviewed SHA-256\n" {
		t.Errorf("sha mismatch must be a bare SystemExit message: %d %q", rc, e)
	}
	if _, err := os.Stat(out); err == nil {
		t.Error("nothing may be written when the DEM is not the reviewed one")
	}
	if got := expandNargs([]string{"--img", "a", "--reaches-km", "100", "200", "300", "--out", "o", "--reaches-km", "50"}); strings.Join(got, " ") !=
		"--img a --reaches-km 100 --reaches-km 200 --reaches-km 300 --out o --reaches-km 50" {
		t.Errorf("nargs expansion: %v", got)
	}
}

// With the real LOLA raster (LOLA_DIR) the committed science/results/horizon_reach.json is reproduced byte for byte.
func TestReproducesCommittedStudy(t *testing.T) {
	ldir := os.Getenv("LOLA_DIR")
	if ldir == "" {
		t.Skip("LOLA_DIR not set: the 115 MB NASA raster is not in the repository; skipping")
	}
	img, lbl := filepath.Join(ldir, "ldem_80s_80m.img"), filepath.Join(ldir, "ldem_80s_80m.lbl")
	if _, err := os.Stat(img); err != nil {
		t.Skip("DEM missing in LOLA_DIR; skipping")
	}
	root = "../../.."
	defer func() { root = ".." }()
	out := filepath.Join(t.TempDir(), "hr.json")
	rc, stdout, stderr := runCLI("--img", img, "--label", lbl, "--out", out)
	if rc != 0 {
		t.Fatalf("rc=%d %s", rc, stderr)
	}
	if !strings.HasPrefix(stdout, "mons-mouton-im2 control 0.0 [(100, 45.22, 45.57, -0.86, 0, 0), (150, ") || strings.Count(stdout, "\n") != 5 {
		t.Errorf("stdout: %q", stdout)
	}
	got, _ := os.ReadFile(out)
	want, err := os.ReadFile("../../../science/results/horizon_reach.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Error("horizon_reach.json differs from the committed science/results/horizon_reach.json")
	}
}
