// Command exportapiseries exports the five LOLA+SPICE precomputed site series to the API ingest format.
// Go port of science/export_api_series.py (same output bytes).
//
// Reads the artefacts written by science/build_web_assets.py (web/data/sites/<id>.bin + .json),
// verifies the .bin against the SHA-256 recorded by that generator, and writes
// <out>/<id>.json (schema braspace.site-series.v1, science_status PRELIMINARY)
// plus prints the catalog series_sha256 of each output. Angles are copied unchanged
// (0.01 deg quantisation of the generator); nothing is interpolated or promoted.
//
// Usage (from api/): go run ./cmd/exportapiseries -web-data ../web/data -out sitedata/series
package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

var sites = []string{"mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton",
	"haworth", "nobile-rim-2", "connecting-ridge-extension", "de-gerlache-rim-1", "de-gerlache-rim-2", "de-gerlache-kocher-massif", "leibnitz-beta-plateau", "faustini-rim-a", "amundsen-rim"}

// fail is Python's SystemExit(message): message on stderr, exit status 1.
type fail string

func (f fail) Error() string { return string(f) }

func member(o any, key string) (any, error) {
	obj, ok := o.(pyfmt.Obj)
	if !ok {
		return nil, fmt.Errorf("expected object when reading %q", key)
	}
	v, ok := obj.Get(key)
	if !ok {
		return nil, fmt.Errorf("KeyError: %q", key)
	}
	return v, nil
}

func path(o any, keys ...string) (any, error) {
	for _, k := range keys {
		var err error
		if o, err = member(o, k); err != nil {
			return nil, err
		}
	}
	return o, nil
}

func export(web, out, siteID string) (string, error) {
	metaBytes, err := os.ReadFile(filepath.Join(web, "sites", siteID+".json"))
	if err != nil {
		return "", err
	}
	meta, err := pyfmt.Parse(metaBytes)
	if err != nil {
		return "", err
	}
	raw, err := os.ReadFile(filepath.Join(web, "sites", siteID+".bin"))
	if err != nil {
		return "", err
	}
	get := func(keys ...string) any {
		if err != nil {
			return nil
		}
		var v any
		v, err = path(meta, keys...)
		return v
	}
	ser := get("series")
	recorded, _ := get("series", "sha256").(string)
	countV := get("series", "count")
	startUTC, _ := get("series", "start_utc").(string)
	quant := get("series", "quantisation_deg")
	step := get("series", "step_seconds")
	prov := get("provenance")
	terrain := get("provenance", "terrain")
	terrainSHA := get("provenance", "terrain_sha256")
	ephem := get("provenance", "ephemeris")
	generator, _ := get("provenance", "generator").(string)
	maxDist := get("provenance", "ray_parameters", "max_distance_m")
	aberr := get("provenance", "aberration_correction")
	obsH := get("site", "observer_height_m")
	horizon, _ := get("terrain_horizon").([]any)
	if err != nil {
		return "", err
	}
	_ = ser
	_ = prov

	sum := sha256.Sum256(raw)
	binSHA := hex.EncodeToString(sum[:])
	if binSHA != recorded {
		return "", fail(fmt.Sprintf("%s: .bin SHA-256 %s != recorded %s", siteID, binSHA, recorded))
	}
	cn, ok := countV.(pyfmt.Num)
	if !ok {
		return "", errors.New("series.count is not a number")
	}
	var n int
	if _, err := fmt.Sscanf(string(cn), "%d", &n); err != nil || n < 0 {
		return "", errors.New("series.count is not an integer")
	}
	if len(raw) != n*8 {
		return "", fail(fmt.Sprintf("%s: expected %d bytes, got %d", siteID, n*8, len(raw)))
	}
	if _, err := time.Parse("2006-01-02T15:04:05Z", startUTC); err != nil {
		return "", fmt.Errorf("ValueError: time data %q does not match format", startUTC)
	}
	u16 := func(off int, i int) float64 { return float64(binary.LittleEndian.Uint16(raw[off+2*i:])) / 100 }
	i16 := func(off int, i int) float64 { return float64(int16(binary.LittleEndian.Uint16(raw[off+2*i:]))) / 100 }
	samples := make([]any, n)
	for i := 0; i < n; i++ {
		samples[i] = pyfmt.Obj{
			{K: "sun", V: pyfmt.Obj{{K: "azimuth_deg", V: u16(0, i)}, {K: "elevation_deg", V: i16(2*n, i)}}},
			{K: "earth", V: pyfmt.Obj{{K: "azimuth_deg", V: u16(4*n, i)}, {K: "elevation_deg", V: i16(6*n, i)}}},
		}
	}
	hz := make([]any, len(horizon))
	for i, h := range horizon {
		az, e1 := member(h, "az")
		el, e2 := member(h, "el")
		if e1 != nil || e2 != nil {
			return "", errors.New("terrain_horizon entry without az/el")
		}
		hz[i] = pyfmt.Obj{{K: "azimuth_deg", V: az}, {K: "elevation_deg", V: el}}
	}
	note := fmt.Sprintf("PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED; derived from LOLA + SPICE, not NASA-reviewed. "+
		"source_file=web/data/sites/%s.bin source_sha256=%s "+
		"quantisation_deg=%s step_seconds=%s "+
		"terrain_resolution=80 m/px ray_max_distance_m=%s "+
		"aberration=%s", siteID, binSHA, pyfmt.Str(quant), pyfmt.Str(step), pyfmt.Str(maxDist), pyfmt.Str(aberr))
	doc := pyfmt.Obj{
		{K: "schema", V: "braspace.site-series.v1"},
		{K: "site_id", V: siteID},
		{K: "science_status", V: "PRELIMINARY"},
		{K: "provenance", V: pyfmt.Obj{
			{K: "terrain_dataset_id", V: terrain},
			{K: "terrain_sha256", V: terrainSHA},
			{K: "ephemeris_id", V: ephem},
			{K: "frame", V: "MOON_ME"},
			{K: "generator", V: generator + " -> science/export_api_series.py"},
			{K: "note", V: note},
		}},
		{K: "observer_height_m", V: obsH},
		{K: "terrain_horizon", V: hz},
		{K: "start_utc", V: startUTC},
		{K: "step_seconds", V: step},
		{K: "samples", V: samples},
	}
	txt, err := pyfmt.Marshal(doc, pyfmt.Options{EnsureASCII: true})
	if err != nil {
		return "", err
	}
	data := []byte(txt + "\n")
	if err := os.MkdirAll(out, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(out, siteID+".json"), data, 0o644); err != nil {
		return "", err
	}
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:]), nil
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("exportapiseries", flag.ContinueOnError)
	fs.SetOutput(stderr)
	web := fs.String("web-data", "../web/data", "directory holding sites/<id>.bin + .json")
	out := fs.String("out", "sitedata/series", "output directory")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	for _, sid := range sites {
		sha, err := export(*web, *out, sid)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		fmt.Fprintln(stdout, sid, sha)
	}
	return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }
