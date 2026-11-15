package main

// Port of science/tests/test_reference_tolerances.py (same cases, same tolerances).
//
// Tolerances for the committed reference comparisons (issue #65 BS-061, issue #153).
//
// These tests read science/results/*.json as committed. They do not call JPL Horizons or re-read the PGDA
// rasters; they make the recorded residuals fail the run when they exceed a stated tolerance, which
// validatehorizons itself does not do. Limits and their reasons: docs/SCIENCE_REVIEW_ONBOARD_BS061.md.

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

const resultsDir = "../../../science/results"

// referenceSites have JPL Horizons cross-checks (the five original candidates).
var referenceSites = []string{"connecting-ridge", "malapert-massif", "mons-mouton-im2", "nobile-rim-1", "peak-near-shackleton"}

// pgdaSites are every real catalog site with a LOLA + SPICE series (14 since the 9 remaining catalog sites got series).
var pgdaSites = []string{"amundsen-rim", "connecting-ridge", "connecting-ridge-extension", "de-gerlache-kocher-massif", "de-gerlache-rim-1",
	"de-gerlache-rim-2", "faustini-rim-a", "haworth", "leibnitz-beta-plateau", "malapert-massif", "mons-mouton-im2", "nobile-rim-1",
	"nobile-rim-2", "peak-near-shackleton"}

const (
	// The site series is stored at 0.01 deg; a direction error ten times smaller cannot change a stored sample.
	horizonsToleranceDeg = 0.001
	// PGDA averages a different (much longer) period and uses its own horizon, so only a loose band is meaningful.
	pgdaSunTolerancePP = 5.0
)

// Sites whose recorded difference is outside the band. Their Sun figures must be presented as unconfirmed.
// Science review 2026-11-15: all three are high-illumination ridges/massifs near Shackleton where the 100 km ray
// reach under-counts the distant horizon (the reach study already shows Peak dropping 4.2 pp at 150 km); the other
// 11 sites agree with PGDA within +/-3.5 pp. The UI marks these as SUN_UPPER_BOUND (web/moonproof/core/data.ts).
var pgdaSunOutside = []string{"de-gerlache-kocher-massif", "de-gerlache-rim-1", "peak-near-shackleton"}

func load(t *testing.T, name string) pyfmt.Obj {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(resultsDir, name))
	if err != nil {
		t.Fatal(err)
	}
	v, err := pyfmt.Parse(b)
	if err != nil {
		t.Fatal(err)
	}
	return v.(pyfmt.Obj)
}

func num(t *testing.T, v any) float64 {
	t.Helper()
	f, err := pyfmt.Float(v)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func sortedSites(results []any) []string {
	var s []string
	for _, r := range results {
		v, _ := r.(pyfmt.Obj).Get("site")
		s = append(s, v.(string))
	}
	sort.Strings(s)
	return s
}

func equal(a, b []string) bool { return strings.Join(a, "\x00") == strings.Join(b, "\x00") }

func TestSunAndEarthDirectionsMatchJPLHorizons(t *testing.T) {
	doc := load(t, "validation_horizons.json")
	ref, _ := doc.Get("reference")
	if !strings.Contains(ref.(string), "JPL Horizons") {
		t.Fatalf("reference %q", ref)
	}
	rv, _ := doc.Get("results")
	results := rv.([]any)
	if got := sortedSites(results); !equal(got, referenceSites) {
		t.Fatalf("sites %v != %v", got, referenceSites)
	}
	for _, r := range results {
		res := r.(pyfmt.Obj)
		site, _ := res.Get("site")
		ep, _ := res.Get("epochs")
		if len(ep.([]any)) != 12 {
			t.Errorf("%v: expected 12 epochs", site)
		}
		cv, _ := res.Get("comparisons")
		var bodies []string
		for _, c := range cv.([]any) {
			co := c.(pyfmt.Obj)
			b, _ := co.Get("body")
			bodies = append(bodies, b.(string))
			n, _ := co.Get("n")
			if num(t, n) != 12 {
				t.Errorf("%v %v: n=%v", site, b, n)
			}
			for _, key := range []string{"max_abs_el_diff_deg", "max_abs_az_diff_deg_cos_el"} {
				v, _ := co.Get(key)
				if num(t, v) > horizonsToleranceDeg {
					t.Errorf("%v %v %s = %v exceeds %v", site, b, key, v, horizonsToleranceDeg)
				}
			}
		}
		sort.Strings(bodies)
		if !equal(bodies, []string{"earth", "sun"}) {
			t.Errorf("%v: bodies %v", site, bodies)
		}
	}
}

func TestSunlightFractionAgainstPGDAIsInsideTheBandExceptTheListedSite(t *testing.T) {
	doc := load(t, "validation_pgda.json")
	rv, _ := doc.Get("results")
	results := rv.([]any)
	if got := sortedSites(results); !equal(got, pgdaSites) {
		t.Fatalf("sites %v != %v", got, pgdaSites)
	}
	var outside []string
	for _, r := range results {
		res := r.(pyfmt.Obj)
		d, _ := res.Get("diff_sun_pp")
		s, _ := res.Get("site")
		if f := num(t, d); f > pgdaSunTolerancePP || f < -pgdaSunTolerancePP {
			outside = append(outside, s.(string))
		}
	}
	sort.Strings(outside)
	if !equal(outside, pgdaSunOutside) {
		t.Fatalf("the set of sites outside the PGDA band changed: update the science review before the UI numbers (%v)", outside)
	}
	for _, r := range results {
		res := r.(pyfmt.Obj)
		d, _ := res.Get("diff_sun_pp")
		p, _ := res.Get("pipeline_mean_solar_disc_pct")
		g, _ := res.Get("pgda_avg_solar_disc_pct")
		// assertAlmostEqual(places=2): round(first - second, 2) == 0
		if pyfmt.Round(num(t, d)-(num(t, p)-num(t, g)), 2) != 0 {
			s, _ := res.Get("site")
			t.Errorf("%v: diff_sun_pp %v != %v - %v", s, d, p, g)
		}
	}
}
