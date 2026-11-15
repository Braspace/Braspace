// Package lolahorizon is the Go port of science/lola_horizon.py: a source-aware,
// terrain-only NASA LRO/LOLA polar DEM horizon prototype.
//
// It implements one documented PDS3 south-polar stereographic mapping, spherical
// Moon line-of-sight geometry and pixel-interpolated terrain sampling. It does NOT
// compute NASA Sun/Earth ephemerides, mission windows or a certified landing site.
// Only use with a PDS IMG and its matching label; verify exact asset SHA-256.
//
// Numerics follow the Python reference operation by operation. Every product that
// feeds an addition is wrapped in float64(...) so arm64 never fuses it into an FMA
// (the Go spec allows that unless an explicit conversion rounds first).
package lolahorizon

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

const (
	ExpectedProduct     = "LDEM_80S_80M.IMG"
	KnownReviewedSHA256 = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"
	PDSPage             = "https://pds-geosciences.wustl.edu/missions/lro/lola.htm"
	Model               = "braspace.lola-polar-horizon.v0.1"
)

// Python's math.radians / math.degrees multiply by a precomputed (pi/180.0) /
// (180.0/pi), both rounded to float64; Go constants would be exact, so use vars.
var (
	piF       = math.Pi
	degToRad  = piF / 180.0
	radToDeg  = 180.0 / piF
	pyWhite   = " \t\n\r\f\v\x1c\x1d\x1e\x1f"
	errNoData = errors.New("no DEM data at observer")
)

func radians(x float64) float64 { return float64(x * degToRad) }
func degrees(x float64) float64 { return float64(x * radToDeg) }

type valueError string

func fail(msg string) { panic(valueError(msg)) }

func recoverValue(err *error) {
	if r := recover(); r != nil {
		if v, ok := r.(valueError); ok {
			*err = errors.New(string(v))
			return
		}
		panic(r)
	}
}

// Grid is the PDS raster geometry read from the label.
type Grid struct {
	Width, Height int
	PixelSizeM    float64
	RadiusM       float64
	LineOffset    float64
	SampleOffset  float64
	ScaleMPerDN   float64
}

func pyFloat(s string) float64 {
	t := strings.Trim(s, pyWhite)
	if strings.ContainsAny(t, "xXpP") {
		fail("could not convert string to float: '" + s + "'")
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		var ne *strconv.NumError
		if !(errors.As(err, &ne) && errors.Is(ne.Err, strconv.ErrRange)) {
			fail("could not convert string to float: '" + s + "'")
		}
	}
	return f
}

func pyInt(s string) int {
	t := strings.Trim(s, pyWhite)
	i, err := strconv.Atoi(t)
	if err != nil {
		fail("invalid literal for int() with base 10: '" + s + "'")
	}
	return i
}

// FromLabel parses a PDS3 label (text already newline-normalised like Python's read_text).
func FromLabel(text string) (g Grid, err error) {
	defer recoverValue(&err)
	get := func(key string) string {
		re := regexp.MustCompile(`(?m)^[ \t\n\r\f\v]*` + regexp.QuoteMeta(key) + `[ \t\n\r\f\v]*=[ \t\n\r\f\v]*(.+?)[ \t\n\r\f\v]*$`)
		m := re.FindStringSubmatch(text)
		if m == nil {
			fail("missing PDS label field " + key)
		}
		v := strings.Trim(strings.Trim(m[1], pyWhite), `"`)
		if i := strings.Index(v, " <"); i >= 0 {
			v = v[:i]
		}
		return strings.Trim(v, pyWhite)
	}
	if get("MAP_PROJECTION_TYPE") != "POLAR STEREOGRAPHIC" {
		fail("only PDS3 polar stereographic DEMs are supported")
	}
	if get("POSITIVE_LONGITUDE_DIRECTION") != "EAST" || pyFloat(get("CENTER_LATITUDE")) != -90 {
		fail("only planetocentric south-pole east-positive coverage supported")
	}
	if pyFloat(get("CENTER_LONGITUDE")) != 0 || pyFloat(get("MAP_PROJECTION_ROTATION")) != 0 {
		fail("unsupported projection rotation or central meridian")
	}
	if get("SAMPLE_TYPE") != "LSB_INTEGER" || pyInt(get("SAMPLE_BITS")) != 16 {
		fail("only little-endian signed 16-bit data supported")
	}
	if get("COORDINATE_SYSTEM_NAME") != "MEAN EARTH/POLAR AXIS OF DE421" {
		fail("unexpected lunar reference frame")
	}
	if get("KEYWORD_LATITUDE_TYPE") != "PLANETOCENTRIC" {
		fail("unexpected latitude convention")
	}
	g.Width = pyInt(get("LINE_SAMPLES"))
	g.Height = pyInt(get("LINES"))
	g.PixelSizeM = pyFloat(get("MAP_SCALE"))
	g.RadiusM = float64(1000 * pyFloat(get("A_AXIS_RADIUS")))
	g.LineOffset = pyFloat(get("LINE_PROJECTION_OFFSET"))
	g.SampleOffset = pyFloat(get("SAMPLE_PROJECTION_OFFSET"))
	g.ScaleMPerDN = pyFloat(get("SCALING_FACTOR"))
	if g.Width < 3 || g.Height < 3 || g.PixelSizeM <= 0 || g.RadiusM <= 0 || g.ScaleMPerDN <= 0 {
		fail("invalid PDS raster dimensions, geometry or scaling")
	}
	return g, nil
}

// LocationToPixel returns zero-indexed pixel-centre coordinates.
//
// LOLA DSMAP_POLAR.CAT: X=(I-N/2-0.5)*MAP_SCALE, Y=-(J-N/2-0.5)*MAP_SCALE with
// 1-indexed I,J. For N=7600 the pole is at zero-indexed 3799.5, which equals the
// label PROJECTION_OFFSET directly (no extra -0.5).
func (g Grid) LocationToPixel(lat, lon float64) (col, row float64, err error) {
	if !(lat >= -90 && lat <= -80) || !(lon >= -360 && lon <= 360) || math.IsInf(lat+lon, 0) || math.IsNaN(lat+lon) {
		return 0, 0, errors.New("outside south polar coverage or invalid coordinate")
	}
	rho := 2 * g.RadiusM * math.Tan(radians(lat+90)/2)
	theta := radians(lon)
	x, y := rho*math.Sin(theta), rho*math.Cos(theta)
	return g.SampleOffset + x/g.PixelSizeM, g.LineOffset - y/g.PixelSizeM, nil
}

// PixelToLocation inverts LocationToPixel.
func (g Grid) PixelToLocation(col, row float64) (lat, lon float64) {
	x := (col - g.SampleOffset) * g.PixelSizeM
	y := (g.LineOffset - row) * g.PixelSizeM
	rho := math.Hypot(x, y)
	colat := 2 * math.Atan(rho/(2*g.RadiusM))
	return degrees(colat) - 90, degrees(math.Atan2(x, y))
}

// DEM is a little-endian int16 raster. ponytail: whole file read into memory
// (115 MB for the real LOLA product) instead of mmap; switch to syscall.Mmap
// only if that ever matters.
type DEM struct {
	Grid Grid
	data []byte
}

// NewDEM validates the byte count and loads the raster.
func NewDEM(file string, g Grid) (*DEM, error) {
	st, err := os.Stat(file)
	if err != nil {
		return nil, err
	}
	if st.Size() != int64(g.Width)*int64(g.Height)*2 {
		return nil, errors.New("unexpected PDS raster byte count")
	}
	b, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	return &DEM{Grid: g, data: b}, nil
}

// Value returns the scaled sample, or ok=false outside the raster or on the
// reserved all-bits-low sentinel.
func (d *DEM) Value(col, row int) (float64, bool) {
	if col < 0 || row < 0 || col >= d.Grid.Width || row >= d.Grid.Height {
		return 0, false
	}
	dn := int16(binary.LittleEndian.Uint16(d.data[(row*d.Grid.Width+col)*2:]))
	if dn == -32768 {
		return 0, false
	}
	return float64(dn) * d.Grid.ScaleMPerDN, true
}

// Height bilinearly interpolates terrain height at a planetocentric location.
func (d *DEM) Height(lat, lon float64) (float64, bool) {
	col, row, err := d.Grid.LocationToPixel(lat, lon)
	if err != nil {
		return 0, false
	}
	x, y := math.Floor(col), math.Floor(row)
	dx, dy := col-x, row-y
	xi, yi := int(x), int(y)
	a, oka := d.Value(xi, yi)
	b, okb := d.Value(xi+1, yi)
	c, okc := d.Value(xi, yi+1)
	e, okd := d.Value(xi+1, yi+1)
	if !(oka && okb && okc && okd) {
		return 0, false
	}
	return float64(a*(1-dx)*(1-dy)) + float64(b*dx*(1-dy)) + float64(c*(1-dx)*dy) + float64(e*dx*dy), true
}

// Dot is Python's sum(x*y for ...), accumulated left to right from 0.
func Dot(a, b [3]float64) float64 {
	s := 0.0
	for i := range a {
		s += float64(a[i] * b[i])
	}
	return s
}

// SiteBasis returns the (up, north, east) unit vectors at a site.
func SiteBasis(lat, lon float64) (up, north, east [3]float64) {
	la, lo := radians(lat), radians(lon)
	up = [3]float64{math.Cos(la) * math.Cos(lo), math.Cos(la) * math.Sin(lo), math.Sin(la)}
	north = [3]float64{-math.Sin(la) * math.Cos(lo), -math.Sin(la) * math.Sin(lo), math.Cos(la)}
	east = [3]float64{-math.Sin(lo), math.Cos(lo), 0.}
	return
}

// Sample is one azimuth of the terrain horizon.
type Sample struct {
	AzimuthDeg   float64
	ElevationDeg float64
	SampleCount  int
	Partial      bool
}

// Result mirrors the dict returned by sample_horizon.
type Result struct {
	Lat, Lon, ObserverHeightM, SiteElevationM float64
	MaxDistanceM, StepM, AzimuthStepDeg       int
	Missing, Complete                         int
	Horizon                                   []Sample
}

// Obj renders the result in Python dict order, ready for pyfmt.Marshal.
func (r *Result) Obj() pyfmt.Obj {
	hz := make([]any, len(r.Horizon))
	for i, h := range r.Horizon {
		hz[i] = pyfmt.Obj{{K: "azimuth_deg", V: h.AzimuthDeg}, {K: "elevation_deg", V: h.ElevationDeg},
			{K: "sample_count", V: h.SampleCount}, {K: "partial_coverage", V: h.Partial}}
	}
	return pyfmt.Obj{
		{K: "site", V: pyfmt.Obj{{K: "latitude_deg", V: r.Lat}, {K: "longitude_deg", V: r.Lon},
			{K: "observer_height_m", V: r.ObserverHeightM}, {K: "site_elevation_m", V: r.SiteElevationM}}},
		{K: "model", V: Model},
		{K: "ray_parameters", V: pyfmt.Obj{{K: "max_distance_m", V: r.MaxDistanceM}, {K: "step_m", V: r.StepM},
			{K: "azimuth_step_deg", V: r.AzimuthStepDeg}}},
		{K: "coverage", V: pyfmt.Obj{{K: "azimuths_with_missing_samples", V: r.Missing}, {K: "complete_azimuths", V: r.Complete}}},
		{K: "terrain_horizon", V: hz},
	}
}

// SampleHorizon casts great-circle rays over the DEM (lunar curvature included).
func SampleHorizon(dem *DEM, lat, lon, observerHeightM float64, maxDistanceM, stepM, azimuthStepDeg int) (*Result, error) {
	if s := lon + lat + observerHeightM; !(lat >= -90 && lat <= -80) || math.IsNaN(s) || math.IsInf(s, 0) {
		return nil, errors.New("invalid south-polar location / observer height")
	}
	if observerHeightM < 0 || observerHeightM > 100 || stepM < 40 || maxDistanceM < stepM || maxDistanceM > 100000 {
		return nil, errors.New("invalid observer height / ray range")
	}
	switch azimuthStepDeg {
	case 1, 2, 5, 10, 15, 30:
	default:
		return nil, errors.New("unsupported azimuth resolution")
	}
	base, ok := dem.Height(lat, lon)
	if !ok {
		return nil, errNoData
	}
	radius := dem.Grid.RadiusM
	up, north, east := SiteBasis(lat, lon)
	height0 := radius + base + observerHeightM
	res := &Result{Lat: lat, Lon: lon, ObserverHeightM: observerHeightM, SiteElevationM: pyfmt.Round(base, 3),
		MaxDistanceM: maxDistanceM, StepM: stepM, AzimuthStepDeg: azimuthStepDeg}
	for az := 0; az < 360; az += azimuthStepDeg {
		angle := radians(float64(az))
		ca, sa := math.Cos(angle), math.Sin(angle)
		var bearing [3]float64
		for i := range bearing {
			bearing[i] = float64(north[i]*ca) + float64(east[i]*sa)
		}
		maximum := -90.
		visible := 0
		incomplete := false
		for dist := stepM; dist <= maxDistanceM; dist += stepM {
			gamma := float64(dist) / radius
			cg, sg := math.Cos(gamma), math.Sin(gamma)
			var target [3]float64
			for i := range target {
				target[i] = float64(cg*up[i]) + float64(sg*bearing[i])
			}
			tlat := degrees(math.Asin(math.Max(-1., math.Min(1., target[2]))))
			tlon := degrees(math.Atan2(target[1], target[0]))
			elev, ok := dem.Height(tlat, tlon)
			if !ok {
				incomplete = true
				continue
			}
			r := radius + elev
			above := float64(r*Dot(target, up)) - height0
			across := r * Dot(target, bearing)
			apparent := degrees(math.Atan2(above, across))
			if apparent > maximum {
				maximum = apparent
			}
			visible++
		}
		if visible == 0 {
			return nil, errors.New("no valid ray samples for azimuth " + strconv.Itoa(az))
		}
		if incomplete {
			res.Missing++
		}
		res.Horizon = append(res.Horizon, Sample{AzimuthDeg: float64(az), ElevationDeg: pyfmt.Round(maximum, 6),
			SampleCount: visible, Partial: incomplete})
	}
	res.Complete = len(res.Horizon) - res.Missing
	return res, nil
}

// Digest is the SHA-256 hex of the exact file bytes.
func Digest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ReadLabel reads a label like Python's Path.read_text(encoding="ascii"):
// non-ASCII bytes are an error and newlines are normalised to "\n".
func ReadLabel(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	for i, c := range b {
		if c >= 0x80 {
			return "", fmt.Errorf("'ascii' codec can't decode byte 0x%02x in position %d: ordinal not in range(128)", c, i)
		}
	}
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	return strings.ReplaceAll(s, "\r", "\n"), nil
}
