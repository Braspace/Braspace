// Package spicelunar holds what science/spice_lunar_angles.py exported and
// science/three_site_pipeline.py imported: the frame and kernel constants, the
// look-angle geometry and the kernel checksums. Numerics follow the Python operation by
// operation (products feeding additions are wrapped in float64 so arm64 never fuses them).
package spicelunar

import (
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
	"github.com/Braspace/Braspace/api/lolahorizon"
	"github.com/Braspace/Braspace/api/naif"
)

const (
	Frame    = "MOON_ME_DE440_ME421"
	Abcorr   = "LT+S"
	baseNAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
)

var (
	// KernelNames are the four kernels the pipeline loads, in load order.
	KernelNames = []string{"naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"}
	// KernelSources is the NAIF download URL of each kernel, in the same order.
	KernelSources = pyfmt.Obj{
		{K: "naif0012.tls", V: baseNAIF + "lsk/naif0012.tls"},
		{K: "de440s.bsp", V: baseNAIF + "spk/planets/de440s.bsp"},
		{K: "moon_pa_de440_200625.bpc", V: baseNAIF + "pck/moon_pa_de440_200625.bpc"},
		{K: "moon_de440_250416.tf", V: baseNAIF + "fk/satellites/moon_de440_250416.tf"},
	}
	// RadiusKm is a var on purpose: Python evaluates RADIUS_KM*1000 in float64, Go constants would be exact.
	RadiusKm = 1737.4

	piF      = math.Pi
	radToDeg = 180.0 / piF
)

// Rounded is round(v, 6) after a finiteness check.
func Rounded(v float64) (float64, error) {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, errors.New("nonfinite ephemeris geometry")
	}
	return pyfmt.Round(v, 6), nil
}

// Hypot2 is Python's math.hypot(x, y): correctly rounded in practice (double-double
// correction), unlike a plain sqrt(x*x+y*y) or Go's math.Hypot.
func Hypot2(x, y float64) float64 {
	x, y = math.Abs(x), math.Abs(y)
	if math.IsInf(x, 0) || math.IsInf(y, 0) {
		return math.Inf(1)
	}
	if x < y {
		x, y = y, x
	}
	if x == 0 {
		return 0
	}
	// scale by a power of two so squares neither overflow nor underflow
	_, e := math.Frexp(x)
	x, y = math.Ldexp(x, -e), math.Ldexp(y, -e)
	p := x * x
	pe := math.FMA(x, x, -p)
	q := y * y
	qe := math.FMA(y, y, -q)
	s := p + q
	bb := s - p
	se := (p - (s - bb)) + (q - bb)
	h := math.Sqrt(s)
	r := math.FMA(-h, h, s) + (pe + qe + se)
	h += r / (2 * h)
	return math.Ldexp(h, e)
}

// LookAngles is look_angles(): geometric point-body azimuth clockwise from local north and
// elevation. The body vector and the observer radius are in the SAME lunar ME body-fixed frame.
func LookAngles(body [3]float64, latDeg, lonDeg, observerRadiusKm float64) (az, el float64, err error) {
	for _, v := range []float64{body[0], body[1], body[2], latDeg, lonDeg, observerRadiusKm} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, 0, errors.New("nonfinite position")
		}
	}
	if observerRadiusKm <= 0 || !(-90 <= latDeg && latDeg <= 90) {
		return 0, 0, errors.New("invalid lunar surface geometry")
	}
	up, north, east := lolahorizon.SiteBasis(latDeg, lonDeg)
	var diff [3]float64
	for i := range diff {
		diff[i] = body[i] - float64(observerRadiusKm*up[i])
	}
	u, n, e := lolahorizon.Dot(diff, up), lolahorizon.Dot(diff, north), lolahorizon.Dot(diff, east)
	if math.Sqrt(float64(u*u)+float64(n*n)+float64(e*e)) < 1e-9 {
		return 0, 0, errors.New("undefined look direction")
	}
	az, err = Rounded(pyfmt.PyMod(float64(math.Atan2(e, n)*radToDeg), 360))
	if err != nil {
		return 0, 0, err
	}
	el, err = Rounded(float64(math.Atan2(u, Hypot2(n, e)) * radToDeg))
	return az, el, err
}

// Load furnishes the four pipeline kernels from dir, failing closed on a missing or empty file,
// and returns their SHA-256 in KernelNames order.
func Load(dir string) (*naif.Kernels, []string, error) {
	paths := make([]string, len(KernelNames))
	for i, n := range KernelNames {
		paths[i] = filepath.Join(dir, n)
		st, err := os.Stat(paths[i])
		if err != nil || !st.Mode().IsRegular() || st.Size() == 0 {
			return nil, nil, &MissingKernelError{Name: n}
		}
	}
	sums := make([]string, len(paths))
	for i, p := range paths {
		s, err := lolahorizon.Digest(p)
		if err != nil {
			return nil, nil, err
		}
		sums[i] = s
	}
	k := naif.New()
	for _, p := range paths {
		if err := k.Furnsh(p); err != nil {
			return nil, nil, err
		}
	}
	if k.Namfrm(Frame) == 0 {
		return nil, nil, errors.New("moon reference frame not defined by loaded NAIF FK/PCK")
	}
	return k, sums, nil
}

// MissingKernelError is Python's FileNotFoundError for a kernel.
type MissingKernelError struct{ Name string }

func (e *MissingKernelError) Error() string { return "missing required JPL/NAIF kernel: " + e.Name }

// ObserverKm is observer_radius_km and obs_km of a site: (RADIUS_KM*1000+elevation+height)/1000 along "up".
func ObserverKm(latDeg, lonDeg, siteElevationM, observerHeightM float64) (float64, [3]float64) {
	r := (float64(RadiusKm*1000) + siteElevationM + observerHeightM) / 1000
	up, _, _ := lolahorizon.SiteBasis(latDeg, lonDeg)
	return r, [3]float64{float64(r * up[0]), float64(r * up[1]), float64(r * up[2])}
}

// SunEarthLook returns the rounded (sun, earth) azimuth/elevation seen from the site at et:
// LT+S apparent directions via spkcpo, converted back to a Moon-centred vector.
func SunEarthLook(k *naif.Kernels, et, latDeg, lonDeg, observerRadiusKm float64, obsKm [3]float64) (sunAz, sunEl, earthAz, earthEl float64, err error) {
	var out [2][2]float64
	for i, body := range []string{"SUN", "EARTH"} {
		rel, _, err := k.Spkcpo(body, et, Frame, "OBSERVER", Abcorr, obsKm, "MOON", Frame)
		if err != nil {
			return 0, 0, 0, 0, err
		}
		v := [3]float64{rel[0] + obsKm[0], rel[1] + obsKm[1], rel[2] + obsKm[2]}
		az, el, err := LookAngles(v, latDeg, lonDeg, observerRadiusKm)
		if err != nil {
			return 0, 0, 0, 0, fmt.Errorf("%w", err)
		}
		out[i] = [2]float64{az, el}
	}
	return out[0][0], out[0][1], out[1][0], out[1][1], nil
}

var isoRE = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?)?(?:([+-])(\d{2})(?::?(\d{2})(?::?(\d{2}))?)?)?$`)

// ParseISO is datetime.fromisoformat(value.replace("Z", "+00:00")) followed by astimezone(UTC).
// A value without an offset is read as wall-clock time in naive (Python's astimezone() assumes the
// system local zone) and hasTZ is false. Errors carry Python's ValueError messages.
func ParseISO(value string, naive *time.Location) (t time.Time, hasTZ bool, err error) {
	s := strings.ReplaceAll(value, "Z", "+00:00")
	g := isoRE.FindStringSubmatch(s)
	if g == nil {
		return time.Time{}, false, errors.New("Invalid isoformat string: '" + s + "'")
	}
	atoi := func(x string) int { n, _ := strconv.Atoi(x); return n }
	y, mo, d := atoi(g[1]), atoi(g[2]), atoi(g[3])
	h, mi, sec := atoi(g[4]), atoi(g[5]), atoi(g[6])
	nsec := 0
	if g[7] != "" {
		nsec = atoi((g[7] + "000000")[:6]) * 1000
	}
	if mo < 1 || mo > 12 {
		return time.Time{}, false, errors.New("month must be in 1..12")
	}
	if d < 1 || h > 23 || mi > 59 || sec > 59 || time.Date(y, time.Month(mo), d, 0, 0, 0, 0, time.UTC).Day() != d {
		return time.Time{}, false, errors.New("day is out of range for month")
	}
	if g[8] == "" {
		return time.Date(y, time.Month(mo), d, h, mi, sec, nsec, naive).UTC(), false, nil
	}
	off := atoi(g[9])*3600 + atoi(g[10])*60 + atoi(g[11])
	if g[8] == "-" {
		off = -off
	}
	return time.Date(y, time.Month(mo), d, h, mi, sec, nsec, time.UTC).Add(-time.Duration(off) * time.Second), true, nil
}
