// Command threesitepipeline is the Go port of science/three_site_pipeline.py: the BRASPACE offline
// pipeline combining the real NASA LOLA terrain horizon with JPL/NAIF SPICE Sun/Earth look angles
// for the five lunar south-pole sites. Same flags, per-site JSON bytes, summary.json and exit codes;
// SPICE comes from api/naif and the terrain from api/lolahorizon.
//
// Inputs (downloaded separately, never committed): LRO/LOLA LDEM_80S_80M.IMG + .LBL (PDS) and the NAIF
// kernels naif0012.tls, de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf.
//
// Scientific status: PRELIMINARY. Sun and Earth are treated as points (their centres); the solar disc
// (~0.27 deg radius) is reported separately as a partial-visibility fraction. No refraction (no atmosphere).
//
// Usage: go -C api run ./cmd/threesitepipeline --img IMG --label LBL --kernels-dir DIR --out-dir DIR
//
//	[--start-utc 2027-01-01T00:00:00Z --hours 8760 --step-minutes 60 --observer-height-m 2.0
//	 --max-distance-m 100000 --ray-step-m 160 --azimuth-step-deg 1 --site ID ...]
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
	"github.com/Braspace/Braspace/api/lolahorizon"
	"github.com/Braspace/Braspace/api/naif"
	"github.com/Braspace/Braspace/api/sitevis"
	"github.com/Braspace/Braspace/api/spicelunar"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

type site struct {
	ID, Name, Source, SourceURL string
	Lat, Lon                    float64
}

// sites are the real catalog sites: the original five Artemis III candidates first, then the remaining
// catalog feature centres (NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2).
var sites = []site{
	{"mons-mouton-im2", "Mons Mouton (IM-2 Athena target)", "LROC image 1401, IM-2 intended landing site (approx.)", "https://www.lroc.asu.edu/images/1401", -84.78, 29.13},
	{"malapert-massif", "Malapert Massif", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R23", "", -85.9948, -0.23578},
	{"nobile-rim-1", "Nobile Rim 1", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R06", "", -85.4381, 37.36667},
	{"connecting-ridge", "Connecting Ridge (Shackleton–de Gerlache)", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2 (catalog feature centre)", "", -89.4632, -137.49},
	{"peak-near-shackleton", "Peak Near Shackleton", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R07", "", -88.811, 123.6901},
	// Remaining real catalog sites (api/sitedata/catalog.json, NASA Lunar Surface Data Book coordinates); same pipeline, same PRELIMINARY status.
	{"haworth", "Haworth", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row Haworth", "", -86.7639, -22.777},
	{"nobile-rim-2", "Nobile Rim 2", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row DM2", "", -83.954, 58.82206},
	{"connecting-ridge-extension", "Connecting Ridge Extension", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row SL3", "", -89.0324, -101.999},
	{"de-gerlache-rim-1", "de Gerlache Rim 1", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R11", "", -88.6834, -67.9321},
	{"de-gerlache-rim-2", "de Gerlache Rim 2", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row SL2", "", -88.23, -64.6284},
	{"de-gerlache-kocher-massif", "de Gerlache-Kocher Massif", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R42", "", -85.8296, -116.322},
	{"leibnitz-beta-plateau", "Leibnitz Beta Plateau", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row R20", "", -85.4266, 31.74276},
	{"faustini-rim-a", "Faustini Rim A", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row LM7", "", -87.8897, 90.0},
	{"amundsen-rim", "Amundsen Rim", "NASA Lunar Surface Data Book ACD-50044 Rev. A, App. A2, row DM1", "", -84.2287, 69.44396},
}

// sample is one hourly (or stepped) row of the series with the margins metrics() adds.
type sample struct {
	t                                    string
	sunAz, sunEl, earthAz, earthEl       float64
	sunMargin, earthMargin, sunDiscFract float64
}

type metricsT struct {
	sunVis, disc, earthVis, both      float64
	longestDark, longestSun, blackout float64
	maxSunEl                          float64
	n, stepMinutes                    int
}

func (m metricsT) obj() pyfmt.Obj {
	return pyfmt.Obj{
		{K: "sun_center_visible_pct", V: m.sunVis}, {K: "mean_solar_disc_visible_pct", V: m.disc},
		{K: "earth_center_visible_pct", V: m.earthVis}, {K: "sun_and_earth_visible_pct", V: m.both},
		{K: "longest_darkness_h", V: m.longestDark}, {K: "longest_continuous_sunlight_h", V: m.longestSun},
		{K: "longest_earth_blackout_h", V: m.blackout}, {K: "max_sun_elevation_deg", V: m.maxSunEl},
		{K: "samples", V: m.n}, {K: "step_minutes", V: m.stepMinutes},
	}
}

// computeMetrics is metrics(): it also writes the margins and disc fraction into samples.
func computeMetrics(samples []sample, horizon []float64, stepMinutes int) (metricsT, error) {
	var sunVis, earthVis, both []bool
	var disc []float64
	for i := range samples {
		s := &samples[i]
		sm := s.sunEl - sitevis.HorizonAt(horizon, s.sunAz)
		em := s.earthEl - sitevis.HorizonAt(horizon, s.earthAz)
		s.sunMargin = pyfmt.Round(sm, 4)
		s.earthMargin = pyfmt.Round(em, 4)
		s.sunDiscFract = pyfmt.Round(sitevis.DiscFraction(sm, sitevis.SunRadiusDeg), 4)
		sunVis = append(sunVis, sm >= 0)
		earthVis = append(earthVis, em >= 0)
		both = append(both, sm >= 0 && em >= 0)
		disc = append(disc, s.sunDiscFract)
	}
	n := len(samples)
	if n == 0 {
		return metricsT{}, &pyErr{"ZeroDivisionError", "float division by zero"}
	}
	h := float64(stepMinutes) / 60.0
	count := func(f []bool) int {
		c := 0
		for _, b := range f {
			if b {
				c++
			}
		}
		return c
	}
	pct := func(f []bool) float64 { return pyfmt.Round(float64(100.0*float64(count(f)))/float64(n), 2) }
	longest := func(f []bool, v bool) float64 { return pyfmt.Round(float64(float64(sitevis.MaxRun(f, v))*h), 1) }
	sum := 0.0
	for _, d := range disc { // sum(): left to right from 0
		sum += d
	}
	maxEl := samples[0].sunEl
	for _, s := range samples {
		maxEl = math.Max(maxEl, s.sunEl)
	}
	return metricsT{
		sunVis: pct(sunVis), disc: pyfmt.Round(float64(100.0*sum)/float64(n), 2), earthVis: pct(earthVis), both: pct(both),
		longestDark: longest(sunVis, false), longestSun: longest(sunVis, true), blackout: longest(earthVis, false),
		maxSunEl: pyfmt.Round(maxEl, 3), n: n, stepMinutes: stepMinutes,
	}, nil
}

// pyErr is an uncaught Python exception: "<Type>: msg" on stderr, exit status 1.
type pyErr struct{ typ, msg string }

func (e *pyErr) Error() string { return e.typ + ": " + e.msg }

// exitMsg is Python's SystemExit(message): the bare message on stderr, exit status 1.
type exitMsg string

func (e exitMsg) Error() string { return string(e) }

type multiFlag []string

func (m *multiFlag) String() string     { return strings.Join(*m, ",") }
func (m *multiFlag) Set(v string) error { *m = append(*m, v); return nil }

func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

func computeSeries(k *naif.Kernels, s site, rKm float64, start time.Time, hours, step int) ([]sample, error) {
	if step == 0 {
		return nil, &pyErr{"ZeroDivisionError", "integer division or modulo by zero"}
	}
	up, _, _ := lolahorizon.SiteBasis(s.Lat, s.Lon)
	obs := [3]float64{float64(rKm * up[0]), float64(rKm * up[1]), float64(rKm * up[2])}
	n := floorDiv(hours*60, step)
	var out []sample
	for i := 0; i < n; i++ {
		epoch := start.Add(time.Duration(i*step) * time.Minute)
		et, err := k.Str2ET(epoch.Format("2006 Jan 02 15:04:05") + " UTC")
		if err != nil {
			return nil, &pyErr{"SpiceyError", err.Error()}
		}
		sa, se, ea, ee, err := spicelunar.SunEarthLook(k, et, s.Lat, s.Lon, rKm, obs)
		if err != nil {
			return nil, &pyErr{"ValueError", err.Error()}
		}
		out = append(out, sample{t: epoch.Format("2006-01-02T15:04Z"), sunAz: sa, sunEl: se, earthAz: ea, earthEl: ee})
	}
	return out, nil
}

func sampleObj(s sample) pyfmt.Obj {
	return pyfmt.Obj{{K: "t", V: s.t}, {K: "sun_az", V: s.sunAz}, {K: "sun_el", V: s.sunEl}, {K: "earth_az", V: s.earthAz},
		{K: "earth_el", V: s.earthEl}, {K: "sun_margin", V: s.sunMargin}, {K: "earth_margin", V: s.earthMargin},
		{K: "sun_disc_fraction", V: s.sunDiscFract}}
}

func fileErr(path string, err error) error {
	if errors.Is(err, os.ErrNotExist) {
		return &pyErr{"FileNotFoundError", "[Errno 2] No such file or directory: '" + path + "'"}
	}
	return &pyErr{"OSError", err.Error()}
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("three_site_pipeline", flag.ContinueOnError)
	fs.SetOutput(stderr)
	img := fs.String("img", "", "LDEM_80S_80M.IMG (required)")
	label := fs.String("label", "", "PDS label (required)")
	kdir := fs.String("kernels-dir", "", "NAIF kernels directory (required)")
	outDir := fs.String("out-dir", "", "output directory (required)")
	startUTC := fs.String("start-utc", "2027-01-01T00:00:00Z", "start, ISO 8601")
	hours := fs.Int("hours", 24*365, "hours of series")
	step := fs.Int("step-minutes", 60, "step, minutes")
	obsH := fs.Float64("observer-height-m", 2.0, "observer height, m")
	maxD := fs.Int("max-distance-m", 100000, "ray range, m")
	rayStep := fs.Int("ray-step-m", 160, "ray step, m")
	azStep := fs.Int("azimuth-step-deg", 1, "azimuth step, degrees")
	var only multiFlag
	fs.Var(&only, "site", "limit to these site ids (repeatable)")
	if err := fs.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var missing []string
	for _, n := range []string{"img", "label", "kernels-dir", "out-dir"} {
		if !set[n] {
			missing = append(missing, "--"+n)
		}
	}
	if len(missing) > 0 {
		fmt.Fprintf(stderr, "error: the following arguments are required: %s\n", strings.Join(missing, ", "))
		return 2
	}
	if err := pipeline(stdout, *img, *label, *kdir, *outDir, *startUTC, *hours, *step, *obsH, *maxD, *rayStep, *azStep, only); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}

func pipeline(stdout io.Writer, img, label, kdir, outDir, startUTC string, hours, step int, obsH float64, maxD, rayStep, azStep int, only []string) error {
	text, err := lolahorizon.ReadLabel(label)
	if err != nil {
		return fileErr(label, err)
	}
	grid, err := lolahorizon.FromLabel(text)
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	demSHA, err := lolahorizon.Digest(img)
	if err != nil {
		return fileErr(img, err)
	}
	if demSHA != lolahorizon.KnownReviewedSHA256 {
		return exitMsg("LOLA SHA-256 mismatch: " + demSHA)
	}
	kernelSHA := pyfmt.Obj{}
	for _, n := range spicelunar.KernelNames {
		s, err := lolahorizon.Digest(filepath.Join(kdir, n))
		if err != nil {
			return fileErr(filepath.Join(kdir, n), err)
		}
		kernelSHA = append(kernelSHA, pyfmt.KV{K: n, V: s})
	}
	start, _, err := spicelunar.ParseISO(startUTC, time.Local) // naive input is local time, as astimezone() does
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return &pyErr{"OSError", err.Error()}
	}
	summarySites := []any{}
	summary := pyfmt.Obj{
		{K: "generated_utc", V: generatedUTC(os.Getenv, time.Now)},
		{K: "window", V: pyfmt.Obj{{K: "start_utc", V: start.Format("2006-01-02T15:04:05Z")}, {K: "hours", V: hours}, {K: "step_minutes", V: step}}},
		{K: "science_status", V: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"},
		{K: "sites", V: nil},
	}
	k := naif.New()
	for _, n := range spicelunar.KernelNames {
		if err := k.Furnsh(filepath.Join(kdir, n)); err != nil {
			return &pyErr{"SpiceyError", err.Error()}
		}
	}
	dem, err := lolahorizon.NewDEM(img, grid)
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	for _, s := range sites {
		if len(only) > 0 && !contains(only, s.ID) {
			continue
		}
		hz, err := lolahorizon.SampleHorizon(dem, s.Lat, s.Lon, obsH, maxD, rayStep, azStep)
		if err != nil {
			return &pyErr{"ValueError", err.Error()}
		}
		elev := make([]float64, len(hz.Horizon))
		hzObj := make([]any, len(hz.Horizon))
		maxH := math.Inf(-1)
		for i, h := range hz.Horizon {
			elev[i] = h.ElevationDeg
			hzObj[i] = pyfmt.Obj{{K: "az", V: h.AzimuthDeg}, {K: "el", V: h.ElevationDeg}}
			maxH = math.Max(maxH, h.ElevationDeg)
		}
		rKm := (grid.RadiusM + hz.SiteElevationM + obsH) / 1000
		samples, err := computeSeries(k, s, rKm, start, hours, step)
		if err != nil {
			return err
		}
		m, err := computeMetrics(samples, elev, step)
		if err != nil {
			return err
		}
		series := make([]any, len(samples))
		for i, sm := range samples {
			series[i] = sampleObj(sm)
		}
		hzFull := hz.Obj()
		get := func(key string) any { v, _ := hzFull.Get(key); return v }
		record := pyfmt.Obj{
			{K: "schema", V: "braspace.site-visibility.v1"},
			{K: "site", V: pyfmt.Obj{{K: "id", V: s.ID}, {K: "name", V: s.Name}, {K: "latitude_deg", V: s.Lat}, {K: "longitude_deg", V: s.Lon},
				{K: "source", V: s.Source}, {K: "source_url", V: s.SourceURL}, {K: "site_elevation_m", V: hz.SiteElevationM}, {K: "observer_height_m", V: obsH}}},
			{K: "science_status", V: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"},
			{K: "metrics", V: m.obj()},
			{K: "terrain_horizon", V: hzObj},
			{K: "horizon_coverage", V: get("coverage")},
			{K: "series", V: series},
			{K: "provenance", V: pyfmt.Obj{
				{K: "terrain", V: "LRO-L-LOLA-4-GDR-V1.0 / LDEM_80S_80M.IMG V2.0 (80 m/px)"},
				{K: "terrain_sha256", V: demSHA},
				{K: "ray_parameters", V: get("ray_parameters")},
				{K: "ephemeris", V: "NAIF " + strings.Join(spicelunar.KernelNames, ", ")},
				{K: "kernel_sha256", V: kernelSHA}, {K: "kernel_sources", V: spicelunar.KernelSources},
				{K: "spice_frame", V: spicelunar.Frame},
				{K: "aberration_correction", V: "LT+S (apparent) from the surface site via spkcpo"},
				{K: "point_targets", V: "Sun and Earth centres; solar disc fraction from straight-horizon approximation"},
				{K: "generator", V: "science/three_site_pipeline.py v0.1"},
				{K: "nasa_certified", V: false},
			}},
		}
		txt, err := pyfmt.Marshal(record, pyfmt.Options{EnsureASCII: true})
		if err != nil {
			return &pyErr{"ValueError", err.Error()}
		}
		if err := os.WriteFile(filepath.Join(outDir, s.ID+".json"), []byte(txt), 0o644); err != nil {
			return &pyErr{"OSError", err.Error()}
		}
		entry := pyfmt.Obj{{K: "id", V: s.ID}, {K: "name", V: s.Name}, {K: "latitude_deg", V: s.Lat}, {K: "longitude_deg", V: s.Lon},
			{K: "site_elevation_m", V: hz.SiteElevationM}, {K: "max_horizon_deg", V: pyfmt.Round(maxH, 3)}}
		entry = append(entry, m.obj()...)
		summarySites = append(summarySites, entry)
		ms, _ := pyfmt.Marshal(m.obj(), pyfmt.Options{Spaced: true, EnsureASCII: true})
		fmt.Fprintln(stdout, s.ID, ms)
	}
	summary[len(summary)-1].V = summarySites
	txt, err := pyfmt.Marshal(summary, pyfmt.Options{Indent: 2, EnsureASCII: true})
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	if err := os.WriteFile(filepath.Join(outDir, "summary.json"), []byte(txt+"\n"), 0o644); err != nil {
		return &pyErr{"OSError", err.Error()}
	}
	return nil
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

// generatedUTC stamps summary.json. SOURCE_DATE_EPOCH (reproducible-builds.org)
// pins it, so regenerating with the same inputs gives the same bytes (#157);
// without it the stamp is the wall clock, as before. A malformed value is an
// error the operator must see, so it panics instead of silently using now.
func generatedUTC(getenv func(string) string, now func() time.Time) string {
	t := now()
	if v := strings.TrimSpace(getenv("SOURCE_DATE_EPOCH")); v != "" {
		sec, err := strconv.ParseInt(v, 10, 64)
		if err != nil || sec < 0 {
			panic(fmt.Sprintf("SOURCE_DATE_EPOCH=%q is not a non-negative integer of seconds", v))
		}
		t = time.Unix(sec, 0)
	}
	return t.UTC().Format("2006-01-02T15:04:05Z")
}
