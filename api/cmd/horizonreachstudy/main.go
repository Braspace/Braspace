// Command horizonreachstudy is the Go port of science/horizon_reach_study.py: how far must the terrain
// horizon be traced? Sunlight at the five sites for several ray reaches.
//
// The site series (cmd/threesitepipeline) trace the LOLA horizon out to 100 km, the limit lolahorizon
// enforces. This study repeats the same ray march without that limit and recounts Sun and Earth
// visibility from the committed hourly series (web/data/sites/<id>.bin), so the only thing that changes
// between columns is the reach of the rays.
//
// Same geometry as SampleHorizon: great-circle steps of 160 m, bilinear LOLA heights, apparent elevation
// from the observer 2 m above ground, one ray per degree of azimuth. Each ray is marched once and its
// running maximum is recorded at every requested reach. A ray that leaves LDEM_80S_80M (north of 80 S)
// gets no more samples; such azimuths are counted as partial for that reach.
//
// Usage (from api/): go run ./cmd/horizonreachstudy --img ../data/raw/lola/ldem_80s_80m.img --label ../data/raw/lola/ldem_80s_80m.lbl
// Repository files (web/data/sites, science/results) are read relative to api/, like the other commands.
package main

import (
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
	"github.com/Braspace/Braspace/api/lolahorizon"
	"github.com/Braspace/Braspace/api/sitevis"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

const stepM = 160

// root is the repository root relative to the working directory (api/).
var root = ".."

var siteIDs = []string{"mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton"}

var (
	piF      = math.Pi
	degToRad = piF / 180.0
	radToDeg = 180.0 / piF
)

type pyErr struct{ typ, msg string }

func (e *pyErr) Error() string { return e.typ + ": " + e.msg }

type exitMsg string

func (e exitMsg) Error() string { return string(e) }

// march returns, for every reach, the 360 horizon elevations and the number of partial azimuths,
// from one march per azimuth.
func march(dem *lolahorizon.DEM, lat, lon, observerHeightM float64, reaches []int) (map[int][]float64, map[int]int, error) {
	grid := dem.Grid
	base, ok := dem.Height(lat, lon)
	if !ok {
		return nil, nil, &pyErr{"ValueError", "no DEM data at observer"}
	}
	up, north, east := lolahorizon.SiteBasis(lat, lon)
	height0 := grid.RadiusM + base + observerHeightM
	horizons := map[int][]float64{}
	partial := map[int]int{}
	for _, r := range reaches {
		horizons[r] = nil
		partial[r] = 0
	}
	last := reaches[len(reaches)-1]
	for az := 0; az < 360; az++ {
		angle := float64(az) * degToRad
		ca, sa := math.Cos(angle), math.Sin(angle)
		var bearing [3]float64
		for i := range bearing {
			bearing[i] = float64(north[i]*ca) + float64(east[i]*sa)
		}
		maximum, incomplete := -90.0, false
		pending := append([]int(nil), reaches...)
		for dist := stepM; dist <= last; dist += stepM {
			gamma := float64(dist) / grid.RadiusM
			cg, sg := math.Cos(gamma), math.Sin(gamma)
			var target [3]float64
			for i := range target {
				target[i] = float64(cg*up[i]) + float64(sg*bearing[i])
			}
			tlat := float64(math.Asin(math.Max(-1.0, math.Min(1.0, target[2]))) * radToDeg)
			tlon := float64(math.Atan2(target[1], target[0]) * radToDeg)
			elev, ok := dem.Height(tlat, tlon)
			if !ok {
				incomplete = true
			} else {
				r := grid.RadiusM + elev
				apparent := float64(math.Atan2(float64(r*lolahorizon.Dot(target, up))-height0, float64(r*lolahorizon.Dot(target, bearing))) * radToDeg)
				maximum = math.Max(maximum, apparent)
			}
			if dist+stepM > pending[0] { // last step inside this reach
				reach := pending[0]
				pending = pending[1:]
				horizons[reach] = append(horizons[reach], pyfmt.Round(maximum, 6))
				if incomplete {
					partial[reach]++
				}
				if len(pending) == 0 {
					break
				}
			}
		}
	}
	return horizons, partial, nil
}

type series struct {
	n              int
	sunAz, earthAz []uint16
	sunEl, earthEl []int16
}

// recount is recount(): visibility metrics of the committed series against a given horizon.
func recount(s series, horizon []float64) pyfmt.Obj {
	var sun, earth []bool
	disc := 0.0
	for i := 0; i < s.n; i++ {
		sm := float64(s.sunEl[i])/100 - sitevis.HorizonAt(horizon, float64(s.sunAz[i])/100)
		sun = append(sun, sm >= 0)
		earth = append(earth, float64(s.earthEl[i])/100-sitevis.HorizonAt(horizon, float64(s.earthAz[i])/100) >= 0)
		disc += sitevis.DiscFraction(sm, sitevis.SunRadiusDeg)
	}
	count := func(f []bool) int {
		c := 0
		for _, b := range f {
			if b {
				c++
			}
		}
		return c
	}
	n := float64(s.n)
	return pyfmt.Obj{
		{K: "sun_center_visible_pct", V: pyfmt.Round(float64(100*count(sun))/n, 2)},
		{K: "mean_solar_disc_visible_pct", V: pyfmt.Round(float64(100*disc)/n, 2)},
		{K: "earth_center_visible_pct", V: pyfmt.Round(float64(100*count(earth))/n, 2)},
		{K: "longest_darkness_h", V: float64(sitevis.MaxRun(sun, false))},
		{K: "longest_earth_blackout_h", V: float64(sitevis.MaxRun(earth, false))},
	}
}

type intList []int

func (l *intList) String() string { return fmt.Sprint(*l) }
func (l *intList) Set(v string) error {
	n, err := strconv.Atoi(v)
	if err != nil {
		return err
	}
	*l = append(*l, n)
	return nil
}

func readJSON(path string) (any, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, &pyErr{"FileNotFoundError", "[Errno 2] No such file or directory: '" + path + "'"}
	}
	v, err := pyfmt.Parse([]byte(pyfmt.ToValidUTF8(b)))
	if err != nil {
		return nil, &pyErr{"JSONDecodeError", err.Error()}
	}
	return v, nil
}

func obj(v any) (pyfmt.Obj, error) {
	o, ok := v.(pyfmt.Obj)
	if !ok {
		return nil, &pyErr{"TypeError", "expected a JSON object"}
	}
	return o, nil
}

func key(o pyfmt.Obj, k string) (any, error) {
	v, ok := o.Get(k)
	if !ok {
		return nil, &pyErr{"KeyError", "'" + k + "'"}
	}
	return v, nil
}

func float(v any) (float64, error) {
	f, err := pyfmt.Float(v)
	if err != nil {
		return 0, &pyErr{"TypeError", err.Error()}
	}
	return f, nil
}

// expandNargs rewrites argparse's `--reaches-km 100 150 200` (nargs="+") into one flag per value,
// which is what package flag understands.
func expandNargs(args []string) []string {
	var out []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a != "--reaches-km" && a != "-reaches-km" {
			out = append(out, a)
			continue
		}
		out = append(out, a)
		if i+1 < len(args) && !isFlag(args[i+1]) {
			out = append(out, args[i+1])
			i++
			for i+1 < len(args) && !isFlag(args[i+1]) {
				out = append(out, a, args[i+1])
				i++
			}
		}
	}
	return out
}

// isFlag is true for tokens argparse would read as an option (a leading '-' that is not a negative number).
func isFlag(s string) bool {
	if !strings.HasPrefix(s, "-") || len(s) == 1 {
		return false
	}
	_, err := strconv.ParseFloat(s, 64)
	return err != nil
}

func run(args []string, stdout, stderr io.Writer) int {
	args = expandNargs(args)
	fs := flag.NewFlagSet("horizon_reach_study", flag.ContinueOnError)
	fs.SetOutput(stderr)
	img := fs.String("img", "", "LDEM_80S_80M.IMG (required)")
	label := fs.String("label", "", "PDS label (required)")
	var reachesKm intList
	fs.Var(&reachesKm, "reaches-km", "ray reaches in km, one or more values (default 100 150 200 250 300)")
	out := fs.String("out", filepath.Join("..", "science", "results", "horizon_reach.json"), "output JSON")
	if err := fs.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var missing []string
	for _, n := range []string{"img", "label"} {
		if !set[n] {
			missing = append(missing, "--"+n)
		}
	}
	if len(missing) > 0 {
		fmt.Fprintf(stderr, "error: the following arguments are required: %s\n", strings.Join(missing, ", "))
		return 2
	}
	if len(reachesKm) == 0 {
		reachesKm = intList{100, 150, 200, 250, 300}
	}
	if err := study(stdout, *img, *label, reachesKm, *out); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}

func study(stdout io.Writer, imgPath, labelPath string, reachesKm []int, outPath string) error {
	sha, err := lolahorizon.Digest(imgPath)
	if err != nil {
		return &pyErr{"FileNotFoundError", "[Errno 2] No such file or directory: '" + imgPath + "'"}
	}
	if sha != lolahorizon.KnownReviewedSHA256 {
		return exitMsg("LDEM_80S_80M.IMG does not match the reviewed SHA-256")
	}
	reaches := make([]int, len(reachesKm))
	for i, k := range reachesKm {
		reaches[i] = k * 1000
	}
	sort.Ints(reaches)
	pg, err := readJSON(filepath.Join(root, "science/results/validation_pgda.json"))
	if err != nil {
		return err
	}
	pgo, err := obj(pg)
	if err != nil {
		return err
	}
	resv, err := key(pgo, "results")
	if err != nil {
		return err
	}
	pgda := map[string]float64{}
	resList, ok := resv.([]any)
	if !ok {
		return &pyErr{"TypeError", "results is not a list"}
	}
	for _, r := range resList {
		ro, err := obj(r)
		if err != nil {
			return err
		}
		sv, err := key(ro, "site")
		if err != nil {
			return err
		}
		pv, err := key(ro, "pgda_avg_solar_disc_pct")
		if err != nil {
			return err
		}
		f, err := float(pv)
		if err != nil {
			return err
		}
		pgda[pyfmt.Str(sv)] = f
	}
	reachObj := make([]any, len(reaches))
	for i, r := range reaches {
		reachObj[i] = r
	}
	doc := pyfmt.Obj{
		{K: "schema", V: "braspace.horizon-reach-study.v1"}, {K: "science_status", V: "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED"},
		{K: "terrain_sha256", V: lolahorizon.KnownReviewedSHA256}, {K: "ray_step_m", V: stepM}, {K: "azimuth_step_deg", V: 1},
		{K: "reaches_m", V: reachObj},
		{K: "note", V: "Sun/Earth angles are the committed hourly series; only the horizon changes between reaches. " +
			"The DEM ends at 80 S: 'partial_azimuths' counts rays that left it before the reach."},
		{K: "sites", V: nil},
	}
	text, err := readLabel(labelPath)
	if err != nil {
		return err
	}
	grid, err := lolahorizon.FromLabel(text)
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	dem, err := lolahorizon.NewDEM(imgPath, grid)
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	sites := []any{}
	for _, sid := range siteIDs {
		mv, err := readJSON(filepath.Join(root, "web/data/sites", sid+".json"))
		if err != nil {
			return err
		}
		meta, err := obj(mv)
		if err != nil {
			return err
		}
		blob, err := os.ReadFile(filepath.Join(root, "web/data/sites", sid+".bin"))
		if err != nil {
			return &pyErr{"FileNotFoundError", "[Errno 2] No such file or directory: '" + filepath.Join(root, "web/data/sites", sid+".bin") + "'"}
		}
		sv, err := key(meta, "series")
		if err != nil {
			return err
		}
		so, err := obj(sv)
		if err != nil {
			return err
		}
		cv, err := key(so, "count")
		if err != nil {
			return err
		}
		cf, err := float(cv)
		if err != nil {
			return err
		}
		n := int(cf)
		if len(blob) < 8*n {
			return &pyErr{"ValueError", "series .bin is shorter than 8 bytes per sample"}
		}
		s := series{n: n, sunAz: make([]uint16, n), sunEl: make([]int16, n), earthAz: make([]uint16, n), earthEl: make([]int16, n)}
		for i := 0; i < n; i++ {
			s.sunAz[i] = binary.LittleEndian.Uint16(blob[2*i:])
			s.sunEl[i] = int16(binary.LittleEndian.Uint16(blob[2*n+2*i:]))
			s.earthAz[i] = binary.LittleEndian.Uint16(blob[4*n+2*i:])
			s.earthEl[i] = int16(binary.LittleEndian.Uint16(blob[6*n+2*i:]))
		}
		stv, err := key(meta, "site")
		if err != nil {
			return err
		}
		site, err := obj(stv)
		if err != nil {
			return err
		}
		latV, _ := site.Get("latitude_deg")
		lonV, _ := site.Get("longitude_deg")
		ohV, _ := site.Get("observer_height_m")
		lat, err1 := float(latV)
		lon, err2 := float(lonV)
		oh, err3 := float(ohV)
		if err := errors.Join(err1, err2, err3); err != nil {
			return err
		}
		horizons, partial, err := march(dem, lat, lon, oh, reaches)
		if err != nil {
			return err
		}
		thv, err := key(meta, "terrain_horizon")
		if err != nil {
			return err
		}
		th, ok := thv.([]any)
		if !ok {
			return &pyErr{"TypeError", "terrain_horizon is not a list"}
		}
		committed := make([]float64, 0, len(th))
		for _, h := range th {
			ho, err := obj(h)
			if err != nil {
				return err
			}
			ev, err := key(ho, "el")
			if err != nil {
				return err
			}
			f, err := float(ev)
			if err != nil {
				return err
			}
			committed = append(committed, f)
		}
		base := horizons[reaches[0]]
		if len(base) == 0 || len(committed) == 0 {
			return &pyErr{"ValueError", "max() arg is an empty sequence"}
		}
		control := 0.0
		for i := 0; i < len(base) && i < len(committed); i++ {
			control = math.Max(control, math.Abs(base[i]-committed[i]))
		}
		control = pyfmt.Round(control, 6)
		pgv, ok := pgda[sid]
		if !ok {
			return &pyErr{"KeyError", "'" + sid + "'"}
		}
		entry := pyfmt.Obj{{K: "site", V: sid}, {K: "latitude_deg", V: lat}, {K: "longitude_deg", V: lon},
			{K: "control_max_abs_diff_deg_vs_committed_100km_horizon", V: control}, {K: "pgda_avg_solar_disc_pct", V: pgv}}
		var rows []any
		var printed []string
		for _, r := range reaches {
			hz := horizons[r]
			maxRise := math.Inf(-1)
			var raised []int
			for az := 0; az < len(hz) && az < len(base); az++ {
				d := hz[az] - base[az]
				maxRise = math.Max(maxRise, d)
				if d > 0.005 {
					raised = append(raised, az)
				}
			}
			m := recount(s, hz)
			disc, _ := m.Get("mean_solar_disc_visible_pct")
			diff := pyfmt.Round(disc.(float64)-pgv, 2)
			var rng any
			if len(raised) > 0 {
				rng = []any{raised[0], raised[len(raised)-1]}
			}
			row := append(pyfmt.Obj{{K: "reach_m", V: r}}, m...)
			row = append(row, pyfmt.KV{K: "diff_solar_disc_vs_pgda_pp", V: diff}, pyfmt.KV{K: "azimuths_raised_vs_100km", V: len(raised)},
				pyfmt.KV{K: "max_rise_deg", V: pyfmt.Round(maxRise, 4)}, pyfmt.KV{K: "raised_azimuth_range_deg", V: rng},
				pyfmt.KV{K: "partial_azimuths", V: partial[r]})
			rows = append(rows, row)
			sc, _ := m.Get("sun_center_visible_pct")
			printed = append(printed, fmt.Sprintf("(%d, %s, %s, %s, %d, %d)", r/1000, pyfmt.FloatRepr(sc.(float64)),
				pyfmt.FloatRepr(disc.(float64)), pyfmt.FloatRepr(diff), len(raised), partial[r]))
		}
		entry = append(entry, pyfmt.KV{K: "reaches", V: rows})
		sites = append(sites, entry)
		fmt.Fprintf(stdout, "%s control %s [%s]\n", sid, pyfmt.FloatRepr(control), strings.Join(printed, ", "))
	}
	doc[len(doc)-1].V = sites
	txt, err := pyfmt.Marshal(doc, pyfmt.Options{Indent: 1, EnsureASCII: true})
	if err != nil {
		return &pyErr{"ValueError", err.Error()}
	}
	if err := os.WriteFile(outPath, []byte(txt+"\n"), 0o644); err != nil {
		return &pyErr{"OSError", err.Error()}
	}
	return nil
}

// readLabel is Path.read_text(errors="replace"): UTF-8 with replacement characters, universal newlines.
func readLabel(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", &pyErr{"FileNotFoundError", "[Errno 2] No such file or directory: '" + path + "'"}
	}
	s := strings.ReplaceAll(pyfmt.ToValidUTF8(b), "\r\n", "\n")
	return strings.ReplaceAll(s, "\r", "\n"), nil
}
