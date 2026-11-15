package main

import (
	"bytes"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Braspace/Braspace/api/spicelunar"
)

// Port of science/tests/test_spice_lunar_angles.py: same cases, same expectations.

func almost5(t *testing.T, got, want float64) {
	t.Helper() // unittest assertAlmostEqual(places=5): round(|diff|, 5) == 0
	if math.Round(math.Abs(got-want)*1e5) != 0 {
		t.Errorf("got %v want %v (places=5)", got, want)
	}
}

func look(t *testing.T, body [3]float64, lat, lon, r float64) (az, el float64) {
	t.Helper()
	az, el, err := spicelunar.LookAngles(body, lat, lon, r)
	if err != nil {
		t.Fatal(err)
	}
	return
}

func TestLocalCardinalDirectionsAtSouthPole(t *testing.T) {
	nAz, nEl := look(t, [3]float64{1e7, 0, 0}, -90, 0, 1737.4)
	eAz, eEl := look(t, [3]float64{0, 1e7, 0}, -90, 0, 1737.4)
	_, upEl := look(t, [3]float64{0, 0, -1e7}, -90, 0, 1737.4)
	almost5(t, nAz, 0)
	almost5(t, eAz, 90)
	if !(upEl > 89.99) {
		t.Errorf("up elevation %v", upEl)
	}
	for _, e := range []float64{nEl, eEl, upEl} {
		if !(-90 <= e && e <= 90) {
			t.Errorf("elevation out of range: %v", e)
		}
	}
}

func TestLocalBelowHorizonAndMoonRotation(t *testing.T) {
	_, bad := look(t, [3]float64{0, 0, 1e7}, -90, 0, 1737.4)
	if !(bad < -89.99) {
		t.Errorf("below-horizon elevation %v", bad)
	}
	for _, s := range [][2]float64{{-89.4632, -137.49}, {-88.81, 123.69}} {
		az, el := look(t, [3]float64{384400, 19000, 7500}, s[0], s[1], 1739.35)
		if !(0 <= az && az < 360) || !(-90 <= el && el <= 90) {
			t.Errorf("site %v: az %v el %v", s, az, el)
		}
	}
}

func TestUTCTimezoneAndConstraints(t *testing.T) {
	a, err := fromUTC("2026-11-15T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if _, off := a.Zone(); off != 0 || a.Location() != time.UTC {
		t.Errorf("not UTC: %v", a)
	}
	b, err := fromUTC("2026-11-14T21:00:00-03:00")
	if err != nil || !b.Equal(a) {
		t.Errorf("offset conversion: %v %v", b, err)
	}
	if _, err := fromUTC("2026-11-15T00:00:00"); err == nil || err.Error() != "ValueError: UTC time zone is required" {
		t.Errorf("time zone mandatory: %v", err) // ValueError, like Python
	}
	for _, bad := range []string{"", "2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "tomorrow", "2026-11-15T25:00:00Z"} {
		if _, err := fromUTC(bad); err == nil || !strings.HasPrefix(err.Error(), "ValueError: ") {
			t.Errorf("fromUTC(%q) = %v, want ValueError", bad, err)
		}
	}
	if c, err := fromUTC("2026-11-15T00:00:00.5+00:00"); err != nil || c.Nanosecond() != 500000000 {
		t.Errorf("fractional seconds: %v %v", c, err)
	}
}

func TestNonfiniteOrZeroVectorRejected(t *testing.T) {
	if _, _, err := spicelunar.LookAngles([3]float64{math.NaN(), 0, 0}, -90, 0, 1737); err == nil || err.Error() != "nonfinite position" {
		t.Errorf("NaN: %v", err)
	}
	if _, _, err := spicelunar.LookAngles([3]float64{0, 0, -1737}, -90, 0, 1737); err == nil || err.Error() != "undefined look direction" {
		t.Errorf("zero vector: %v", err)
	}
	if _, _, err := spicelunar.LookAngles([3]float64{1, 1, 1}, -91, 0, 1737); err == nil || err.Error() != "invalid lunar surface geometry" {
		t.Errorf("latitude: %v", err)
	}
	if spicelunar.Frame != "MOON_ME_DE440_ME421" {
		t.Errorf("frame %q", spicelunar.Frame)
	}
	if len(spicelunar.KernelNames) != 4 {
		t.Errorf("kernels %v", spicelunar.KernelNames)
	}
}

func TestHypot2IsCorrectlyRounded(t *testing.T) {
	for _, c := range [][3]float64{{3, 4, 5}, {1e-200, 1e-200, 1.414213562373095e-200}, {1e200, 1e200, 1.4142135623730951e200}, {0, 0, 0}, {5, 0, 5}} {
		if got := spicelunar.Hypot2(c[0], c[1]); math.Abs(got-c[2]) > 1e-15*c[2] {
			t.Errorf("hypot(%v,%v)=%v want %v", c[0], c[1], got, c[2])
		}
	}
}

// ---- CLI contract (fail-closed paths do not need kernels) ----

const evidence = "../../../science/evidence/connecting-ridge-LOLA-PRELIMINARY.json"
const committedSeries = "../../sitedata/series/connecting-ridge-NAIF-PRELIMINARY.json"
const committedMeta = "../../../science/evidence/connecting-ridge-NAIF-PRELIMINARY.metadata.json"

func runCLI(args ...string) (int, string, string) {
	var out, errb bytes.Buffer
	rc := run(args, &out, &errb)
	return rc, out.String(), errb.String()
}

func TestCLIMissingArgumentsExit2(t *testing.T) {
	rc, _, stderr := runCLI("--horizon", "x")
	if rc != 2 || !strings.Contains(stderr, "the following arguments are required: --kernels-dir, --output-series, --output-metadata") {
		t.Errorf("rc=%d stderr=%q", rc, stderr)
	}
	if rc, _, _ := runCLI("--horizon", "a", "--kernels-dir", "b", "--output-series", "c", "--output-metadata", "d", "--hours", "x"); rc != 2 {
		t.Errorf("bad --hours: rc=%d", rc)
	}
}

func TestCLIFailClosed(t *testing.T) {
	dir := t.TempDir()
	base := []string{"--kernels-dir", dir, "--output-series", filepath.Join(dir, "s.json"), "--output-metadata", filepath.Join(dir, "m.json")}
	cases := []struct {
		name string
		args []string
		want string
	}{
		{"hours range", []string{"--horizon", evidence, "--hours", "241"}, "ValueError: hours 1..240 and whole-step UTC grid required"},
		{"step grid", []string{"--horizon", evidence, "--hours", "1", "--step-minutes", "7"}, "ValueError: hours 1..240 and whole-step UTC grid required"},
		{"naive start", []string{"--horizon", evidence, "--start-utc", "2026-11-15T00:00:00"}, "ValueError: UTC time zone is required"},
		{"missing kernel", []string{"--horizon", evidence}, "FileNotFoundError: missing required JPL/NAIF kernel: naif0012.tls"},
		{"missing horizon", []string{"--horizon", filepath.Join(dir, "nope.json")}, "FileNotFoundError: "},
	}
	for _, c := range cases {
		rc, _, stderr := runCLI(append(c.args, base...)...)
		if rc != 1 || !strings.Contains(stderr, c.want) {
			t.Errorf("%s: rc=%d stderr=%q want %q", c.name, rc, stderr, c.want)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "s.json")); err == nil {
		t.Error("no output may be written on failure")
	}
	src, err := os.ReadFile(evidence)
	if err != nil {
		t.Fatal(err)
	}
	tamper := func(old, new string) string {
		p := filepath.Join(dir, "h.json")
		if !strings.Contains(string(src), old) {
			t.Fatalf("evidence no longer contains %q", old)
		}
		os.WriteFile(p, []byte(strings.Replace(string(src), old, new, 1)), 0o644)
		return p
	}
	for _, c := range []struct{ name, old, new, want string }{
		{"sha", `"terrain_sha256": "e659`, `"terrain_sha256": "0659`, "source horizon does not contain expected NASA PDS provisional evidence"},
		{"validated claim", `"PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"`, `"VALIDATED"`, "source horizon does not contain expected NASA PDS provisional evidence"},
		{"site", `"latitude_deg": -89.4632`, `"latitude_deg": -89.4`, "only the provenanced Connecting Ridge site is allowed in this prototype"},
	} {
		rc, _, stderr := runCLI(append([]string{"--horizon", tamper(c.old, c.new)}, base...)...)
		if rc != 1 || !strings.Contains(stderr, "ValueError: "+c.want) {
			t.Errorf("%s: rc=%d stderr=%q", c.name, rc, stderr)
		}
	}
}

// With the real NAIF kernels (NAIF_KERNEL_DIR) the committed 72 h evidence must be reproduced
// byte for byte, as the old workflow did with spiceypy (by parsed equality).
func TestReproducesCommittedSeries(t *testing.T) {
	kdir := os.Getenv("NAIF_KERNEL_DIR")
	if kdir == "" {
		t.Skip("NAIF_KERNEL_DIR not set: NAIF kernels are not in the repository; skipping")
	}
	if _, err := os.Stat(filepath.Join(kdir, "de440s.bsp")); err != nil {
		t.Skip("kernels missing in NAIF_KERNEL_DIR; skipping")
	}
	dir := t.TempDir()
	rc, stdout, stderr := runCLI("--horizon", evidence, "--kernels-dir", kdir, "--start-utc", "2026-11-15T00:00:00Z",
		"--hours", "72", "--step-minutes", "60", "--output-series", filepath.Join(dir, "sub", "s.json"), "--output-metadata", filepath.Join(dir, "m.json"))
	if rc != 0 || stdout != "NAIF/LOLA preliminary series generated; NOT independently validated; samples: 72\n" {
		t.Fatalf("rc=%d stdout=%q stderr=%q", rc, stdout, stderr)
	}
	for _, c := range [][2]string{{filepath.Join(dir, "sub", "s.json"), committedSeries}, {filepath.Join(dir, "m.json"), committedMeta}} {
		got, _ := os.ReadFile(c[0])
		want, err := os.ReadFile(c[1])
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, want) {
			t.Errorf("%s differs from committed %s", filepath.Base(c[0]), c[1])
		}
	}
}
