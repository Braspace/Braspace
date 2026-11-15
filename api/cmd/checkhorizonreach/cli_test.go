package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// CLI boundary regression tests (port of tests/test_horizon_cli_fail_closed.py); synthetic
// fixtures, not lunar science validation.

const cliFixture = `{
  "schema": "braspace.horizon-reach-study.v1",
  "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
  "reaches_m": [100000, 200000],
  "sites": [{"site": "SYNTHETIC_ONLY", "reaches": [
    {"reach_m": 100000, "sun_center_visible_pct": 40.0, "mean_solar_disc_visible_pct": 40.0,
     "earth_center_visible_pct": 40.0, "longest_darkness_h": 10.0, "longest_earth_blackout_h": 10.0},
    {"reach_m": 200000, "sun_center_visible_pct": 35.0, "mean_solar_disc_visible_pct": 35.0,
     "earth_center_visible_pct": 35.0, "longest_darkness_h": 12.0, "longest_earth_blackout_h": 12.0}
  ]}]
}`

func runCLI(args ...string) (int, string, string) {
	var out, errb bytes.Buffer
	rc := run(append([]string{"check_horizon_reach"}, args...), &out, &errb)
	return rc, out.String(), errb.String()
}

func writeTemp(t *testing.T, name, body string) string {
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestNoArgumentReturnsUsageError(t *testing.T) {
	rc, _, stderr := runCLI()
	if rc != 2 || !strings.Contains(stderr, "usage:") {
		t.Fatalf("rc=%d stderr=%q", rc, stderr)
	}
}

func TestMissingFileReturnsBlocked(t *testing.T) {
	rc, _, stderr := runCLI(filepath.Join(t.TempDir(), "absent.json"))
	if rc != 2 || !strings.Contains(stderr, "BLOCKED:") {
		t.Fatalf("rc=%d stderr=%q", rc, stderr)
	}
}

func TestInvalidJSONReturnsBlocked(t *testing.T) {
	rc, _, stderr := runCLI(writeTemp(t, "invalid.json", "{bad"))
	if rc != 2 || !strings.Contains(stderr, "BLOCKED:") {
		t.Fatalf("rc=%d stderr=%q", rc, stderr)
	}
}

func TestVerifiedClaimReturnsBlocked(t *testing.T) {
	body := strings.Replace(cliFixture, "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED", "VERIFIED", 1)
	rc, _, stderr := runCLI(writeTemp(t, "invalid-science.json", body))
	if rc != 1 || !strings.Contains(stderr, "PRELIMINARY") {
		t.Fatalf("rc=%d stderr=%q", rc, stderr)
	}
}

func TestValidSyntheticFixtureDoesNotClaimScienceValidation(t *testing.T) {
	rc, stdout, stderr := runCLI(writeTemp(t, "synthetic.json", cliFixture))
	if rc != 0 || !strings.Contains(stdout, "PRELIMINARY/UNVERIFIED") {
		t.Fatalf("rc=%d stdout=%q stderr=%q", rc, stdout, stderr)
	}
}
