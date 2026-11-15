package sitevis

import (
	"math"
	"reflect"
	"testing"
)

func TestHorizonAtInterpolatesPeriodically(t *testing.T) {
	h := make([]float64, 360)
	for i := range h {
		h[i] = float64(i % 10)
	}
	for _, c := range []struct{ az, want float64 }{{0, 0}, {5.5, 5.5}, {9.5, 4.5}, {359.5, 4.5}, {-0.5, 4.5}, {720.25, 0.25}} {
		if got := HorizonAt(h, c.az); math.Abs(got-c.want) > 1e-12 {
			t.Errorf("HorizonAt(%v)=%v want %v", c.az, got, c.want)
		}
	}
	// coarser skyline: 4 samples every 90 deg
	if got := HorizonAt([]float64{0, 10, 20, 30}, 45); got != 5 {
		t.Errorf("coarse skyline: %v", got)
	}
}

func TestDiscFraction(t *testing.T) {
	r := SunRadiusDeg
	if DiscFraction(r, r) != 1 || DiscFraction(2*r, r) != 1 || DiscFraction(-r, r) != 0 || DiscFraction(-2*r, r) != 0 {
		t.Error("saturation")
	}
	if got := DiscFraction(0, r); math.Abs(got-0.5) > 1e-15 {
		t.Errorf("half disc: %v", got)
	}
	// KNOWN DEFECT PRESERVED, NOT ENDORSED. science/three_site_pipeline.py disc_fraction() (which this ports
	// bit for bit, because the committed results depend on it) is inverted between -r and +r: a centre
	// 0.5 r above the horizon should show ~0.80 of the disc, it returns 0.196, and 0.804 at -0.5 r. These are
	// the Python values (python3.11); a future fix must change them here deliberately and regenerate every
	// artefact that carries mean_solar_disc_visible_pct.
	for _, c := range []struct{ m, want float64 }{{-0.5 * r, 0.8044988905221147}, {-0.1 * r, 0.5635557142152309},
		{0.1 * r, 0.4364442857847691}, {0.5 * r, 0.19550110947788524}} {
		if got := DiscFraction(c.m, r); math.Abs(got-c.want) > 1e-15 {
			t.Errorf("DiscFraction(%v r) = %v, Python gives %v", c.m/r, got, c.want)
		}
	}
}

func TestRuns(t *testing.T) {
	f := []bool{true, true, false, true, false, false, false, true}
	if got := Runs(f, true); !reflect.DeepEqual(got, []int{2, 1, 1}) {
		t.Errorf("true runs %v", got)
	}
	if got := Runs(f, false); !reflect.DeepEqual(got, []int{1, 3}) {
		t.Errorf("false runs %v", got)
	}
	if MaxRun(f, false) != 3 || MaxRun(nil, true) != 0 || len(Runs(nil, true)) != 0 {
		t.Error("MaxRun / empty")
	}
}
