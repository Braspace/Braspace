// Command spicelunarangles is the Go port of science/spice_lunar_angles.py: the preliminary
// NASA/JPL NAIF SPICE lunar Sun/Earth-centre look-angle series for the Connecting Ridge site
// (LT+S apparent directions from the surface site, spkcpo), now computed by api/naif instead of
// spiceypy. Same flags, JSON bytes and exit codes. Output scientific status stays UNVERIFIED.
//
// Usage: go -C api run ./cmd/spicelunarangles --horizon ../science/evidence/connecting-ridge-LOLA-PRELIMINARY.json \
//
//	--kernels-dir DIR --output-series OUT.json --output-metadata META.json [--start-utc ... --hours 72 --step-minutes 60]
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
	"github.com/Braspace/Braspace/api/lolahorizon"
	"github.com/Braspace/Braspace/api/spicelunar"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

// pyErr is an uncaught Python exception: "<Type>: msg" on stderr, exit status 1.
type pyErr struct{ typ, msg string }

func (e *pyErr) Error() string { return e.typ + ": " + e.msg }

func valueErr(msg string) error { return &pyErr{"ValueError", msg} }

// fromUTC is from_utc(): ISO 8601 with a mandatory UTC offset ("Z" accepted), returned in UTC.
func fromUTC(value string) (time.Time, error) {
	t, hasTZ, err := spicelunar.ParseISO(value, time.UTC)
	if err != nil {
		return time.Time{}, valueErr(err.Error())
	}
	if !hasTZ {
		return time.Time{}, valueErr("UTC time zone is required")
	}
	return t, nil
}

func num(o pyfmt.Obj, key string) (any, error) {
	v, ok := o.Get(key)
	if !ok {
		return nil, &pyErr{"KeyError", "'" + key + "'"}
	}
	return v, nil
}

func obj(v any, what string) (pyfmt.Obj, error) {
	o, ok := v.(pyfmt.Obj)
	if !ok {
		return nil, &pyErr{"TypeError", what + " is not an object"}
	}
	return o, nil
}

func f64(v any) (float64, error) {
	f, err := pyfmt.Float(v)
	if err != nil {
		return 0, &pyErr{"TypeError", err.Error()}
	}
	return f, nil
}

// is reports Python's `v is expected` for a JSON boolean.
func is(v any, expected bool) bool { b, ok := v.(bool); return ok && b == expected }

// generate builds the series and the metadata documents.
func generate(kernelDir, horizonJSON, startUTC string, hours, stepMinutes int) (series, metadata pyfmt.Obj, nsamples int, err error) {
	if !(1 <= hours && hours <= 240) || !(1 <= stepMinutes && stepMinutes <= 360) || 60*hours%stepMinutes != 0 {
		return nil, nil, 0, valueErr("hours 1..240 and whole-step UTC grid required")
	}
	raw, err := os.ReadFile(horizonJSON)
	if err != nil {
		return nil, nil, 0, &pyErr{"FileNotFoundError", err.Error()}
	}
	doc, err := pyfmt.Parse([]byte(string(pyfmt.ToValidUTF8(raw))))
	if err != nil {
		return nil, nil, 0, &pyErr{"JSONDecodeError", err.Error()}
	}
	h, err := obj(doc, "horizon JSON")
	if err != nil {
		return nil, nil, 0, err
	}
	p := pyfmt.Obj{}
	if pv, ok := h.Get("provenance"); ok {
		if p, err = obj(pv, "provenance"); err != nil {
			return nil, nil, 0, err
		}
	}
	get := func(key string) any { v, _ := p.Get(key); return v }
	if pyfmt.Str(get("terrain_sha256")) != lolahorizon.KnownReviewedSHA256 ||
		get("terrain_geometry_validation") != "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED" ||
		!is(get("actual_nasa_dem_bytes_used"), true) || !is(get("sun_earth_visibility_calculated"), false) {
		return nil, nil, 0, valueErr("source horizon does not contain expected NASA PDS provisional evidence")
	}
	sv, err := num(h, "site")
	if err != nil {
		return nil, nil, 0, err
	}
	site, err := obj(sv, "site")
	if err != nil {
		return nil, nil, 0, err
	}
	latV, err := num(site, "latitude_deg")
	if err != nil {
		return nil, nil, 0, err
	}
	lonV, err := num(site, "longitude_deg")
	if err != nil {
		return nil, nil, 0, err
	}
	lat, err := f64(latV)
	if err != nil {
		return nil, nil, 0, err
	}
	lon, err := f64(lonV)
	if err != nil {
		return nil, nil, 0, err
	}
	if lat != -89.4632 || lon != -137.49 {
		return nil, nil, 0, valueErr("only the provenanced Connecting Ridge site is allowed in this prototype")
	}
	thv, err := num(h, "terrain_horizon")
	if err != nil {
		return nil, nil, 0, err
	}
	th, ok := thv.([]any)
	if !ok {
		return nil, nil, 0, &pyErr{"TypeError", "terrain_horizon is not a list"}
	}
	if len(th) < 2 {
		return nil, nil, 0, valueErr("invalid terrain horizon")
	}
	t0, err := fromUTC(startUTC)
	if err != nil {
		return nil, nil, 0, err
	}
	k, sums, err := spicelunar.Load(kernelDir)
	if err != nil {
		var mk *spicelunar.MissingKernelError
		if errors.As(err, &mk) {
			return nil, nil, 0, &pyErr{"FileNotFoundError", mk.Error()}
		}
		return nil, nil, 0, &pyErr{"RuntimeError", err.Error()}
	}
	ids := pyfmt.Obj{}
	for i, n := range spicelunar.KernelNames {
		ids = append(ids, pyfmt.KV{K: n, V: sums[i]})
	}
	elevV, err := num(site, "site_elevation_m")
	if err != nil {
		return nil, nil, 0, err
	}
	obsV, err := num(site, "observer_height_m")
	if err != nil {
		return nil, nil, 0, err
	}
	elev, err := f64(elevV)
	if err != nil {
		return nil, nil, 0, err
	}
	obsH, err := f64(obsV)
	if err != nil {
		return nil, nil, 0, err
	}
	r, obsKm := spicelunar.ObserverKm(lat, lon, elev, obsH)
	n := hours * 60 / stepMinutes
	samples := make([]any, 0, n)
	for i := 0; i < n; i++ {
		epoch := t0.Add(time.Duration(i*stepMinutes) * time.Minute)
		et, err := k.Str2ET(epoch.Format("2006 Jan 02 15:04:05") + " UTC")
		if err != nil {
			return nil, nil, 0, &pyErr{"SpiceyError", err.Error()}
		}
		sa, se, ea, ee, err := spicelunar.SunEarthLook(k, et, lat, lon, r, obsKm)
		if err != nil {
			return nil, nil, 0, valueErr(err.Error())
		}
		samples = append(samples, pyfmt.Obj{
			{K: "sun", V: pyfmt.Obj{{K: "azimuth_deg", V: sa}, {K: "elevation_deg", V: se}}},
			{K: "earth", V: pyfmt.Obj{{K: "azimuth_deg", V: ea}, {K: "elevation_deg", V: ee}}},
		})
	}
	horizon := make([]any, 0, len(th))
	for _, e := range th {
		eo, err := obj(e, "terrain_horizon item")
		if err != nil {
			return nil, nil, 0, err
		}
		az, err := num(eo, "azimuth_deg")
		if err != nil {
			return nil, nil, 0, err
		}
		el, err := num(eo, "elevation_deg")
		if err != nil {
			return nil, nil, 0, err
		}
		horizon = append(horizon, pyfmt.Obj{{K: "azimuth_deg", V: az}, {K: "elevation_deg", V: el}})
	}
	ds, err := num(p, "terrain_dataset")
	if err != nil {
		return nil, nil, 0, err
	}
	sha, _ := p.Get("terrain_sha256")
	start := t0.Format("2006-01-02T15:04:05Z")
	series = pyfmt.Obj{
		{K: "schema", V: "braspace.site-series.v1"}, {K: "site_id", V: "connecting-ridge"},
		{K: "science_status", V: "UNVERIFIED"},
		{K: "provenance", V: pyfmt.Obj{
			{K: "terrain_dataset_id", V: ds}, {K: "terrain_sha256", V: sha},
			{K: "ephemeris_id", V: "NAIF DE440s + moon_pa_de440_200625.bpc + moon_de440_250416.tf + naif0012.tls"},
			{K: "frame", V: "MOON_ME"},
			{K: "generator", V: "science/spice_lunar_angles.py v0.1"},
			{K: "note", V: "NASA LOLA terrain + JPL/NAIF SPICE Sun/Earth centers; UNVERIFIED independent science; not NASA-approved."},
		}},
		{K: "observer_height_m", V: obsV}, {K: "terrain_horizon", V: horizon},
		{K: "start_utc", V: start}, {K: "step_seconds", V: stepMinutes * 60}, {K: "samples", V: samples},
	}
	metadata = pyfmt.Obj{
		{K: "status", V: "REAL_NASA_LOLA_AND_NAIF_INPUTS_PRELIMINARY"},
		{K: "validated_against_independent_reference", V: false},
		{K: "pds_product", V: ds}, {K: "pds_sha256", V: sha},
		{K: "jpl_naif_kernels_sha256", V: ids}, {K: "kernel_sources", V: spicelunar.KernelSources},
		{K: "spice_frame", V: spicelunar.Frame},
		{K: "spice_aberration_correction", V: "LT+S from surface site (spkcpo); Horizons-airless convention"},
		{K: "site_position_km", V: r}, {K: "site_latitude_deg", V: latV}, {K: "site_longitude_deg", V: lonV},
		{K: "start_utc", V: start}, {K: "samples", V: len(samples)}, {K: "step_minutes", V: stepMinutes},
		{K: "sun_earth_center_not_disc", V: true},
		{K: "lola_horizon_independently_validated", V: false}, {K: "nasa_mission_certified", V: false},
	}
	return series, metadata, len(samples), nil
}

func writeJSON(path string, doc pyfmt.Obj) error {
	txt, err := pyfmt.Marshal(doc, pyfmt.Options{Indent: 2, EnsureASCII: true})
	if err != nil {
		return valueErr(err.Error())
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(txt+"\n"), 0o644)
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("spice_lunar_angles", flag.ContinueOnError)
	fs.SetOutput(stderr)
	horizon := fs.String("horizon", "", "terrain horizon JSON (required)")
	kdir := fs.String("kernels-dir", "", "directory with the NAIF kernels (required)")
	start := fs.String("start-utc", "2026-11-15T00:00:00Z", "start, ISO 8601 with UTC offset")
	hours := fs.Int("hours", 72, "hours of series")
	step := fs.Int("step-minutes", 60, "step, minutes")
	outS := fs.String("output-series", "", "series JSON (required)")
	outM := fs.String("output-metadata", "", "metadata JSON (required)")
	if err := fs.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var missing []string
	for _, n := range []string{"horizon", "kernels-dir", "output-series", "output-metadata"} {
		if !set[n] {
			missing = append(missing, "--"+n)
		}
	}
	if len(missing) > 0 {
		fmt.Fprintf(stderr, "error: the following arguments are required: %s\n", strings.Join(missing, ", "))
		return 2
	}
	series, metadata, n, err := generate(*kdir, *horizon, *start, *hours, *step)
	if err == nil {
		if err = writeJSON(*outS, series); err == nil {
			err = writeJSON(*outM, metadata)
		}
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	fmt.Fprintln(stdout, "NAIF/LOLA preliminary series generated; NOT independently validated; samples:", n)
	return 0
}
