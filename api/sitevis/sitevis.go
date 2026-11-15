// Package sitevis holds the visibility helpers science/three_site_pipeline.py exported and
// science/horizon_reach_study.py imported: periodic horizon interpolation, the straight-horizon
// solar-disc fraction and run lengths. Same operation order as Python (no FMA fusion).
package sitevis

import (
	"math"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

// SunRadiusDeg is the mean apparent solar radius seen from the Moon.
const SunRadiusDeg = 0.2666

// HorizonAt is horizon_at(): periodic linear interpolation of an evenly sampled 0..360 skyline.
func HorizonAt(elev []float64, az float64) float64 {
	n := len(elev)
	step := 360.0 / float64(n)
	x := pyfmt.PyMod(az, 360.0) / step
	fl := math.Floor(x)
	i := int(fl) % n
	j := (i + 1) % n
	f := x - fl
	return float64(elev[i]*(1-f)) + float64(elev[j]*f)
}

// DiscFraction is disc_fraction(): the visible fraction of a uniform disc whose centre sits
// marginDeg above a locally straight horizon (circular-segment area).
func DiscFraction(marginDeg, radiusDeg float64) float64 {
	if marginDeg >= radiusDeg {
		return 1.0
	}
	if marginDeg <= -radiusDeg {
		return 0.0
	}
	d := -marginDeg / radiusDeg
	hidden := (math.Acos(d) - float64(d*math.Sqrt(1-float64(d*d)))) / math.Pi
	return 1.0 - hidden
}

// Runs is runs(): the lengths of the maximal runs of value in flags.
func Runs(flags []bool, value bool) []int {
	var out []int
	cur := 0
	for _, f := range flags {
		if f == value {
			cur++
		} else if cur > 0 {
			out = append(out, cur)
			cur = 0
		}
	}
	if cur > 0 {
		out = append(out, cur)
	}
	return out
}

// MaxRun is max(runs(flags, value), default=0).
func MaxRun(flags []bool, value bool) int {
	m := 0
	for _, r := range Runs(flags, value) {
		if r > m {
			m = r
		}
	}
	return m
}
