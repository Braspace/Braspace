package main

import (
	"bytes"
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

func cli(t *testing.T, lbl string, extra ...string) (int, string) {
	t.Helper()
	d := t.TempDir()
	l, i := filepath.Join(d, "x.lbl"), filepath.Join(d, "x.img")
	os.WriteFile(l, []byte(lbl), 0o644)
	os.WriteFile(i, make([]byte, 10202), 0o644)
	var out, errb bytes.Buffer
	code := run(append([]string{"--img", i, "--label", l, "--lat", "-89", "--lon", "0"}, extra...), &out, &errb)
	return code, errb.String()
}

// Fail-closed paths of lola_horizon.main(): same exit codes and messages as Python.
func TestFailClosed(t *testing.T) {
	if c, m := cli(t, strings.Replace(label, "LDEM_80S_80M.IMG", "OTHER.IMG", 1)); c != 1 || !strings.Contains(m, "product label does not identify LDEM_80S_80M.IMG") {
		t.Errorf("product: %d %q", c, m)
	}
	if c, m := cli(t, label); c != 1 || !strings.Contains(m, "unexpected NASA LOLA raster geometry") {
		t.Errorf("geometry: %d %q", c, m)
	}
	big := strings.NewReplacer("= 101", "= 7600").Replace(label)
	if c, m := cli(t, big); c != 1 || !strings.Contains(m, "PDS data SHA-256 mismatch: refusing untrusted geometry") {
		t.Errorf("sha: %d %q", c, m)
	}
	if c, m := cli(t, strings.Replace(label, "EAST", "WEST", 1)); c != 1 || !strings.Contains(m, "ValueError: only planetocentric south-pole east-positive coverage supported") {
		t.Errorf("label: %d %q", c, m)
	}
	var out, errb bytes.Buffer
	if c := run([]string{"--lat", "-89"}, &out, &errb); c != 2 || !strings.Contains(errb.String(), "the following arguments are required: --img, --label, --lon") {
		t.Errorf("missing args: %d %q", c, errb.String())
	}
}
