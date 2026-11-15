package main

import (
	"os"
	"testing"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

// Port of science/tests/test_horizon_reach_results.py: the committed result of the study, what it
// found and what makes it trustworthy. Reads science/results/horizon_reach.json only (the 115 MB
// LOLA file is not in the repository).

type doc struct{ sites map[string]pyfmt.Obj }

func loadDoc(t *testing.T) doc {
	t.Helper()
	b, err := os.ReadFile("../../../science/results/horizon_reach.json")
	if err != nil {
		t.Fatal(err)
	}
	v, err := pyfmt.Parse(b)
	if err != nil {
		t.Fatal(err)
	}
	root, _ := v.(pyfmt.Obj)
	list, _ := root.Get("sites")
	d := doc{sites: map[string]pyfmt.Obj{}}
	for _, s := range list.([]any) {
		so := s.(pyfmt.Obj)
		id, _ := so.Get("site")
		d.sites[id.(string)] = so
	}
	return d
}

func num(t *testing.T, o pyfmt.Obj, k string) float64 {
	t.Helper()
	v, ok := o.Get(k)
	if !ok {
		t.Fatalf("missing %q", k)
	}
	f, err := pyfmt.Float(v)
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func (d doc) reaches(site string) []pyfmt.Obj {
	rs, _ := d.sites[site].Get("reaches")
	var out []pyfmt.Obj
	for _, r := range rs.([]any) {
		out = append(out, r.(pyfmt.Obj))
	}
	return out
}

// at is at(site, km).
func (d doc) at(t *testing.T, site string, km int) pyfmt.Obj {
	t.Helper()
	for _, r := range d.reaches(site) {
		if int(num(t, r, "reach_m")) == km*1000 {
			return r
		}
	}
	t.Fatalf("no %d km reach for %s", km, site)
	return nil
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func TestControlThe100KmMarchReproducesTheCommittedHorizonsExactly(t *testing.T) {
	d := loadDoc(t)
	if len(d.sites) != 5 {
		t.Fatalf("len(SITES) = %d", len(d.sites))
	}
	for id, site := range d.sites {
		if num(t, site, "control_max_abs_diff_deg_vs_committed_100km_horizon") != 0.0 {
			t.Errorf("%s: control difference is not 0.0", id)
		}
		first := d.reaches(id)[0]
		if num(t, first, "reach_m") != 100000 {
			t.Errorf("%s: first reach %v", id, num(t, first, "reach_m"))
		}
		if num(t, first, "azimuths_raised_vs_100km") != 0 {
			t.Errorf("%s: 100 km march raises azimuths against itself", id)
		}
	}
}

func TestTwoElevatedSitesLoseSunlightWhenTheRaysGoPast100Km(t *testing.T) {
	d := loadDoc(t)
	for _, c := range []struct {
		site      string
		low, high float64
	}{{"peak-near-shackleton", 4.5, 5.2}, {"malapert-massif", 4.3, 4.9}} {
		drop := num(t, d.at(t, c.site, 100), "sun_center_visible_pct") - num(t, d.at(t, c.site, 200), "sun_center_visible_pct")
		if !(c.low < drop && drop < c.high) {
			t.Errorf("%s: %v pp", c.site, drop)
		}
		if !(num(t, d.at(t, c.site, 200), "azimuths_raised_vs_100km") > 60) {
			t.Errorf("%s: raised azimuths at 200 km", c.site)
		}
		// ... and both move toward NASA PGDA.
		if !(abs(num(t, d.at(t, c.site, 200), "diff_solar_disc_vs_pgda_pp")) < abs(num(t, d.at(t, c.site, 100), "diff_solar_disc_vs_pgda_pp"))) {
			t.Errorf("%s: 200 km is not closer to PGDA than 100 km", c.site)
		}
	}
	if !(num(t, d.at(t, "malapert-massif", 200), "longest_darkness_h") > 4*num(t, d.at(t, "malapert-massif", 100), "longest_darkness_h")) {
		t.Error("malapert longest darkness at 200 km is not more than 4x the 100 km one")
	}
}

func TestThreeSitesDoNotChange(t *testing.T) {
	d := loadDoc(t)
	for _, site := range []string{"mons-mouton-im2", "nobile-rim-1", "connecting-ridge"} {
		for _, k := range []string{"sun_center_visible_pct", "mean_solar_disc_visible_pct", "earth_center_visible_pct", "longest_darkness_h"} {
			if num(t, d.at(t, site, 100), k) != num(t, d.at(t, site, 250), k) {
				t.Errorf("%s %s changes between 100 and 250 km", site, k)
			}
		}
	}
}

func TestConvergedWhereTheDemCoversEveryRay(t *testing.T) {
	d := loadDoc(t)
	p200, p250 := d.at(t, "peak-near-shackleton", 200), d.at(t, "peak-near-shackleton", 250)
	if num(t, p200, "partial_azimuths") != 0 || num(t, p250, "partial_azimuths") != 0 {
		t.Error("peak-near-shackleton must have no partial azimuths at 200 and 250 km")
	}
	if num(t, p200, "sun_center_visible_pct") != num(t, p250, "sun_center_visible_pct") {
		t.Error("peak-near-shackleton sun visibility must be converged between 200 and 250 km")
	}
	// Farther from the pole the DEM (80 S) ends before the reach: those rows are lower bounds on the change.
	if !(num(t, d.at(t, "malapert-massif", 200), "partial_azimuths") > 0) {
		t.Error("malapert-massif at 200 km must have partial azimuths")
	}
}
