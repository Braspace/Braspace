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
	// Analytical circular-segment areas (ported from the #291 regression, science/tests/test_solar_disc_fraction.py):
	// a centre 0.5 r BELOW the horizon shows the segment 1/3 - sqrt(3)/(4 pi) ~ 0.1955 of the disc, 0.5 r ABOVE
	// shows the complement ~ 0.8045. The previous port returned these swapped (inverted between -r and +r).
	halfMinus := 1.0/3 - math.Sqrt(3)/(4*math.Pi)
	for _, c := range []struct{ m, want float64 }{{-0.5 * r, halfMinus}, {0.5 * r, 1 - halfMinus}} {
		if got := DiscFraction(c.m, r); math.Abs(got-c.want) > 1e-12 {
			t.Errorf("DiscFraction(%v r) = %v, want %v", c.m/r, got, c.want)
		}
	}
	// Monotonic non-decreasing, bounded, continuous to the saturation limits, and symmetric f(m)+f(-m)=1.
	prev := -1.0
	for i := -120; i <= 120; i++ {
		f := DiscFraction(r*float64(i)/100, r)
		if f < 0 || f > 1 || f < prev {
			t.Fatalf("not monotonic/bounded at %d/100 r: %v after %v", i, f, prev)
		}
		prev = f
		if i >= -100 && i <= 100 {
			if s := f + DiscFraction(-r*float64(i)/100, r); math.Abs(s-1) > 1e-12 {
				t.Errorf("asymmetric at %d/100 r: sum %v", i, s)
			}
		}
	}
	if DiscFraction(-r*(1-1e-6), r) > 1e-6 || DiscFraction(r*(1-1e-6), r) < 1-1e-6 {
		t.Error("discontinuous at the saturation limits")
	}
	// Centre above the horizon always shows more than half of the disc (the inverted port gave 0.436 at +0.1 r).
	if DiscFraction(0.1*r, r) <= 0.5 {
		t.Errorf("centre 0.1 r above the horizon shows %v of the disc", DiscFraction(0.1*r, r))
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
