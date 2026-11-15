package lolahorizon

// Port of science/tests/test_lola_horizon.py, one test per Python test, same
// inputs and assertions. Fast reproducible geometry tests on a labelled
// *synthetic* tiny DEM; the real LOLA PDS binary is intentionally not required.
//
// Float tolerance: where the Python test compared floats with assertEqual
// (exact), these compare with |diff| <= 1e-6, approved by the project owner
// (Gustavo) for this port only. assertAlmostEqual keeps its own `places`.

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

const pdsTestLabel = `
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

const tol = 1e-6

type fixture struct {
	t      *testing.T
	grid   Grid
	dir    string
	path   string
	pixels []int16
}

// setUp mirrors LOLAScienceTests.setUp (writes 101*101 zero pixels).
func setUp(t *testing.T) *fixture {
	t.Helper()
	g, err := FromLabel(pdsTestLabel)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	f := &fixture{t: t, grid: g, dir: dir, path: filepath.Join(dir, "small-synthetic.img"), pixels: make([]int16, 10201)}
	f.write()
	return f
}

func (f *fixture) write() {
	b := make([]byte, len(f.pixels)*2)
	for i, p := range f.pixels {
		binary.LittleEndian.PutUint16(b[i*2:], uint16(p))
	}
	if err := os.WriteFile(f.path, b, 0o644); err != nil {
		f.t.Fatal(err)
	}
}

func (f *fixture) dem() *DEM {
	d, err := NewDEM(f.path, f.grid)
	if err != nil {
		f.t.Fatal(err)
	}
	return d
}

func near(t *testing.T, got, want, eps float64, what string) {
	t.Helper()
	if !(math.Abs(got-want) <= eps) {
		t.Errorf("%s: got %v want %v (eps %g)", what, got, want, eps)
	}
}

// almostEqual is unittest's assertAlmostEqual: round(abs(a-b), places) == 0.
func almostEqual(t *testing.T, a, b float64, places int, what string) {
	t.Helper()
	if pyfmt.Round(math.Abs(a-b), places) != 0 {
		t.Errorf("%s: %v != %v within %d places", what, a, b, places)
	}
}

func mustPixel(t *testing.T, g Grid, lat, lon float64) (float64, float64) {
	t.Helper()
	c, r, err := g.LocationToPixel(lat, lon)
	if err != nil {
		t.Fatal(err)
	}
	return c, r
}

func TestCoordinateRegistrationAndInvertibility(t *testing.T) {
	f := setUp(t)
	c, r := mustPixel(t, f.grid, -90, 0)
	near(t, c, 50, tol, "pole col") // Python: assertEqual((50.,50.)); tolerance per owner approval
	near(t, r, 50, tol, "pole row")
	for _, p := range [][2]float64{{-89.5, 0}, {-89.65, 90}, {-89.7, -135}, {-89.25, 179.75}} {
		col, row := mustPixel(t, f.grid, p[0], p[1])
		bl, bo := f.grid.PixelToLocation(col, row)
		almostEqual(t, p[0], bl, 9, "lat")
		almostEqual(t, p[1], bo, 9, "lon")
	}
	if _, r := mustPixel(t, f.grid, -89.9, 0); !(r < 50) {
		t.Errorf("row %v not < 50", r)
	}
	if c, _ := mustPixel(t, f.grid, -89.9, 90); !(c > 50) {
		t.Errorf("col %v not > 50", c)
	}
}

func TestPDSCatalogPixelCentreFormula(t *testing.T) {
	// DSMAP_POLAR.CAT, N=7600, MAP_SCALE=80: X=(I-N/2-0.5)*80 with 1-indexed I.
	// Zero-indexed col 1000 is I=1001 -> X=-223960 m; row 3799.5 -> Y=0.
	g := Grid{7600, 7600, 80., 1737400., 3799.5, 3799.5, 0.5}
	c, r := mustPixel(t, g, -90, 0)
	near(t, c, 3799.5, tol, "col") // Python assertEqual; tolerance per owner approval
	near(t, r, 3799.5, tol, "row")
	lat, lon := g.PixelToLocation(1000, 3799.5)
	almostEqual(t, lon, -90., 9, "lon")
	rho := 2 * 1737400. * math.Tan(radians(lat+90)/2)
	almostEqual(t, rho, 223960., 3, "rho")
}

func TestFlatSphericalMoonHorizonBelowTangent(t *testing.T) {
	f := setUp(t)
	res, err := SampleHorizon(f.dem(), -90, 0, 0, 640, 80, 30)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Horizon) != 12 {
		t.Fatalf("len %d", len(res.Horizon))
	}
	if res.Complete != 12 {
		t.Errorf("complete_azimuths %d", res.Complete)
	}
	for _, h := range res.Horizon {
		if !(h.ElevationDeg < 0) { // lunar curvature
			t.Errorf("elevation %v not < 0", h.ElevationDeg)
		}
		if !(h.ElevationDeg > -1.0) {
			t.Errorf("elevation %v not > -1", h.ElevationDeg)
		}
		if h.SampleCount != 8 {
			t.Errorf("sample_count %d", h.SampleCount)
		}
	}
	if _, err := pyfmt.Marshal(res.Obj(), pyfmt.Options{Indent: 2, EnsureASCII: true}); err != nil { // json.dumps(res, allow_nan=False)
		t.Error(err)
	}
}

func TestHillAlongNorthIncreasesHorizonAngle(t *testing.T) {
	f := setUp(t)
	f.pixels[48*101+50] = 400 // 200 m above 0 m at ~160 m along az 0
	f.write()
	res, err := SampleHorizon(f.dem(), -90, 0, 2, 640, 80, 30)
	if err != nil {
		t.Fatal(err)
	}
	northern, southern := res.Horizon[0], res.Horizon[6]
	if !(northern.ElevationDeg > 15) {
		t.Errorf("northern %v", northern.ElevationDeg)
	}
	if !(southern.ElevationDeg < 0) {
		t.Errorf("southern %v", southern.ElevationDeg)
	}
	if !(northern.ElevationDeg > southern.ElevationDeg) {
		t.Errorf("northern %v <= southern %v", northern.ElevationDeg, southern.ElevationDeg)
	}
}

func TestMissingSamplesFailNotSilentlyZero(t *testing.T) {
	f := setUp(t)
	f.pixels[50*101+50] = -32768
	f.write()
	dem := f.dem()
	if _, ok := dem.Height(-90, 0); ok {
		t.Error("expected no height at the nodata pole")
	}
	_, err := SampleHorizon(dem, -90, 0, 0, 640, 80, 30)
	if err == nil || !strings.Contains(err.Error(), "no DEM data at observer") {
		t.Errorf("err = %v", err)
	}
}

func TestRejectWrongRasterSizeAndProjection(t *testing.T) {
	f := setUp(t)
	broken := filepath.Join(f.dir, "bad.img")
	if err := os.WriteFile(broken, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewDEM(broken, f.grid); err == nil || !strings.Contains(err.Error(), "byte count") {
		t.Errorf("err = %v", err)
	}
	if _, err := FromLabel(strings.Replace(pdsTestLabel, "POLAR STEREOGRAPHIC", "EQUIRECTANGULAR", -1)); err == nil || !strings.Contains(err.Error(), "polar stereographic") {
		t.Errorf("err = %v", err)
	}
	if _, err := FromLabel(strings.Replace(pdsTestLabel, "MEAN EARTH/POLAR AXIS OF DE421", "MOON_PA", -1)); err == nil || !strings.Contains(err.Error(), "reference frame") {
		t.Errorf("err = %v", err)
	}
	if _, _, err := f.grid.LocationToPixel(-79, 3); err == nil {
		t.Error("expected out-of-coverage error")
	}
}

func TestChecksumIsOfExactBytes(t *testing.T) {
	f := setUp(t)
	b, _ := os.ReadFile(f.path)
	sum := sha256.Sum256(b)
	got, err := Digest(f.path)
	if err != nil {
		t.Fatal(err)
	}
	if got != hex.EncodeToString(sum[:]) {
		t.Errorf("digest %s", got)
	}
	if len(got) != 64 {
		t.Errorf("len %d", len(got))
	}
}

func TestBasisOrthonormal(t *testing.T) {
	for _, p := range [][2]float64{{-90, 0}, {-89.2, -137.49}, {-88.8, 123.69}} {
		up, north, east := SiteBasis(p[0], p[1])
		almostEqual(t, Dot(up, up), 1, 7, "up.up")
		almostEqual(t, Dot(up, north), 0, 10, "up.north")
		almostEqual(t, Dot(up, east), 0, 10, "up.east")
		almostEqual(t, Dot(north, east), 0, 10, "north.east")
	}
}
