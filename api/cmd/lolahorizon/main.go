// Command lolahorizon is the Go port of the CLI in science/lola_horizon.py
// (same flags, JSON output and exit codes). Python stays the library used by the
// SPICE pipeline; this command only reproduces main().
//
// Usage: go -C api run ./cmd/lolahorizon --img IMG --label LBL --lat -89.4632 --lon -137.49 [--output FILE]
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
	"github.com/Braspace/Braspace/api/lolahorizon"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("lolahorizon", flag.ContinueOnError)
	fs.SetOutput(stderr)
	img := fs.String("img", "", "PDS IMG (required)")
	label := fs.String("label", "", "PDS label (required)")
	lat := fs.Float64("lat", 0, "latitude, degrees (required)")
	lon := fs.Float64("lon", 0, "longitude, degrees (required)")
	obs := fs.Float64("observer-height-m", 2, "observer height, m")
	maxD := fs.Int("max-distance-m", 30000, "ray range, m")
	step := fs.Int("step-m", 160, "ray step, m")
	az := fs.Int("azimuth-step-deg", 5, "azimuth step, degrees")
	sha := fs.String("expected-sha256", lolahorizon.KnownReviewedSHA256, "expected IMG SHA-256")
	out := fs.String("output", "", "write JSON here instead of stdout")
	if err := fs.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2 // argparse also exits 2 on bad usage
	}
	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var missing []string
	for _, n := range []string{"img", "label", "lat", "lon"} {
		if !set[n] {
			missing = append(missing, "--"+n)
		}
	}
	if len(missing) > 0 {
		fmt.Fprintf(stderr, "error: the following arguments are required: %s\n", strings.Join(missing, ", "))
		return 2
	}
	exit := func(msg string) int { fmt.Fprintln(stderr, msg); return 1 }
	// Uncaught Python exceptions end with "<Type>: msg" on stderr and exit 1.
	valueErr := func(err error) int { return exit("ValueError: " + err.Error()) }

	text, err := lolahorizon.ReadLabel(*label)
	if err != nil {
		return exit(err.Error())
	}
	if !strings.Contains(text, lolahorizon.ExpectedProduct) {
		return exit("product label does not identify " + lolahorizon.ExpectedProduct)
	}
	grid, err := lolahorizon.FromLabel(text)
	if err != nil {
		return valueErr(err)
	}
	if grid.Width != 7600 || grid.Height != 7600 || grid.PixelSizeM != 80 {
		return exit("unexpected NASA LOLA raster geometry")
	}
	computed, err := lolahorizon.Digest(*img)
	if err != nil {
		return exit(err.Error())
	}
	if strings.ToLower(computed) != strings.ToLower(*sha) {
		return exit("PDS data SHA-256 mismatch: refusing untrusted geometry")
	}
	dem, err := lolahorizon.NewDEM(*img, grid)
	if err != nil {
		return valueErr(err)
	}
	res, err := lolahorizon.SampleHorizon(dem, *lat, *lon, *obs, *maxD, *step, *az)
	if err != nil {
		return valueErr(err)
	}
	doc := res.Obj()
	doc = append(doc, pyfmt.KV{K: "provenance", V: pyfmt.Obj{
		{K: "terrain_dataset", V: "LRO-L-LOLA-4-GDR-V1.0/LDEM_80S_80M.IMG V2.0"},
		{K: "terrain_sha256", V: computed}, {K: "pds_label", V: filepath.Base(*label)},
		{K: "reference_frame", V: "MEAN EARTH/POLAR AXIS OF DE421"},
		{K: "source", V: lolahorizon.PDSPage}, {K: "actual_nasa_dem_bytes_used", V: true},
		{K: "terrain_geometry_validation", V: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"},
		{K: "ephemerides_integrated", V: false},
		{K: "sun_earth_visibility_calculated", V: false},
		{K: "nasa_certified", V: false},
	}})
	txt, err := pyfmt.Marshal(doc, pyfmt.Options{Indent: 2, EnsureASCII: true})
	if err != nil {
		return valueErr(err)
	}
	txt += "\n"
	if set["output"] {
		if err := os.WriteFile(*out, []byte(txt), 0o644); err != nil {
			return exit(err.Error())
		}
	} else {
		io.WriteString(stdout, txt)
	}
	return 0
}
