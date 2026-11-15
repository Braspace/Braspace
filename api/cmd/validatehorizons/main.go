// Command validatehorizons is an independent check: it compares SPICE Sun/Earth azimuth-elevation from
// three_site_pipeline.py output against JPL Horizons topocentric AZ-EL (quantity 4) for the same lunar
// site and UTC epochs. Go port of science/validate_vs_horizons.py (same stdout and report bytes).
//
// Horizons is queried over its public API; nothing is downloaded except text.
//
// Usage (from api/): go run ./cmd/validatehorizons [-samples 12] [-output FILE] site.json...
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Braspace/Braspace/api/internal/pyfmt"
)

const defaultAPI = "https://ssd.jpl.nasa.gov/api/horizons.api"

// Python computes math.radians as x*(pi/180) with a double quotient; keep it a runtime division,
// not an exact constant, so the rounding matches.
var (
	pi       = math.Pi
	degToRad = pi / 180.0
)

var numRe = regexp.MustCompile(`^-?\d+(\.\d+)?$`)

type azel struct{ az, el float64 }

func horizonsAzel(client *http.Client, api, body string, lat, lon, altKm float64, times []string) ([]azel, error) {
	quoted := make([]string, len(times))
	for i, t := range times {
		quoted[i] = "'" + strings.TrimRight(strings.ReplaceAll(t, "T", " "), "Z") + "'"
	}
	params := [][2]string{
		{"format", "json"}, {"COMMAND", "'" + body + "'"}, {"MAKE_EPHEM", "YES"}, {"EPHEM_TYPE", "OBSERVER"},
		{"CENTER", "'coord@301'"}, {"COORD_TYPE", "'GEODETIC'"},
		{"SITE_COORD", fmt.Sprintf("'%.6f,%.6f,%.4f'", pyfmt.PyMod(lon, 360), lat, altKm)},
		{"TLIST", strings.Join(quoted, " ")}, {"TLIST_TYPE", "'CAL'"}, {"TIME_TYPE", "'UT'"},
		{"QUANTITIES", "'4'"}, {"ANG_FORMAT", "'DEG'"}, {"APPARENT", "'AIRLESS'"}, {"CSV_FORMAT", "'YES'"},
	}
	parts := make([]string, len(params))
	for i, p := range params {
		parts[i] = url.QueryEscape(p[0]) + "=" + url.QueryEscape(p[1])
	}
	resp, err := client.Get(api + "?" + strings.Join(parts, "&"))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP Error %d: %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	doc, err := pyfmt.Parse(raw)
	if err != nil {
		return nil, err
	}
	obj, _ := doc.(pyfmt.Obj)
	rv, ok := obj.Get("result")
	if !ok {
		return nil, errors.New("KeyError: 'result'")
	}
	text, _ := rv.(string)
	if !strings.Contains(text, "$$SOE") {
		tail := text
		if r := []rune(tail); len(r) > 1500 {
			tail = string(r[len(r)-1500:])
		}
		return nil, errors.New("Horizons returned no ephemeris:\n" + tail)
	}
	block := strings.SplitN(text, "$$SOE", 3)[1]
	block = strings.Split(block, "$$EOE")[0]
	var out []azel
	for _, line := range splitLines(strings.TrimSpace(block)) {
		cols := strings.Split(line, ",")
		var nums []string
		for _, c := range cols[1:] {
			if c = strings.TrimSpace(c); numRe.MatchString(c) {
				nums = append(nums, c)
			}
		}
		if len(nums) < 2 {
			return nil, errors.New("IndexError: Horizons row has fewer than two numeric columns: " + line)
		}
		az, _ := strconv.ParseFloat(nums[0], 64)
		el, _ := strconv.ParseFloat(nums[1], 64)
		out = append(out, azel{az, el})
	}
	return out, nil
}

// splitLines is str.splitlines() (without keepends).
func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); {
		r, w := utf8.DecodeRuneInString(s[i:])
		switch r {
		case '\n', '\v', '\f', '\r', 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029:
			lines = append(lines, s[start:i])
			if r == '\r' && i+w < len(s) && s[i+w] == '\n' {
				w++
			}
			i += w
			start = i
			continue
		}
		i += w
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func angdiff(a, b float64) float64 { return pyfmt.PyMod(a-b+180, 360) - 180 }

func field(o any, k string) (any, error) {
	obj, ok := o.(pyfmt.Obj)
	if !ok {
		return nil, fmt.Errorf("expected object reading %q", k)
	}
	v, ok := obj.Get(k)
	if !ok {
		return nil, fmt.Errorf("KeyError: %q", k)
	}
	return v, nil
}

func floatField(o any, k string) (float64, error) {
	v, err := field(o, k)
	if err != nil {
		return 0, err
	}
	return pyfmt.Float(v)
}

func report(client *http.Client, api, path string, samples int, stdout io.Writer) (pyfmt.Obj, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	rec, err := pyfmt.Parse(b)
	if err != nil {
		return nil, err
	}
	site, err := field(rec, "site")
	if err != nil {
		return nil, err
	}
	seriesV, err := field(rec, "series")
	if err != nil {
		return nil, err
	}
	series, ok := seriesV.([]any)
	if !ok {
		return nil, errors.New("series is not a list")
	}
	if samples == 1 {
		return nil, errors.New("ZeroDivisionError: division by zero")
	}
	var picks []any
	var times []any
	timeStr := []string{}
	for i := 0; i < samples; i++ {
		ix := int(math.RoundToEven(float64(i*(len(series)-1)) / float64(samples-1)))
		if ix < 0 || ix >= len(series) {
			return nil, errors.New("IndexError: list index out of range")
		}
		p := series[ix]
		picks = append(picks, p)
		t, err := field(p, "t")
		if err != nil {
			return nil, err
		}
		times = append(times, t)
		ts, _ := t.(string)
		timeStr = append(timeStr, ts)
	}
	elev, err1 := floatField(site, "site_elevation_m")
	obsH, err2 := floatField(site, "observer_height_m")
	lat, err3 := floatField(site, "latitude_deg")
	lon, err4 := floatField(site, "longitude_deg")
	for _, e := range []error{err1, err2, err3, err4} {
		if e != nil {
			return nil, e
		}
	}
	altKm := (elev + obsH) / 1000
	id, _ := field(site, "id")
	var comparisons []any
	for _, bk := range [][2]string{{"10", "sun"}, {"399", "earth"}} {
		refs, err := horizonsAzel(client, api, bk[0], lat, lon, altKm, timeStr)
		if err != nil {
			return nil, err
		}
		if len(refs) != len(picks) {
			return nil, fmt.Errorf("Horizons returned %d rows for %d epochs", len(refs), len(picks))
		}
		var worstAz, worstEl float64
		for i, s := range picks {
			sAz, e1 := floatField(s, bk[1]+"_az")
			sEl, e2 := floatField(s, bk[1]+"_el")
			if e1 != nil || e2 != nil {
				return nil, errors.New("KeyError: series sample without sun/earth az/el")
			}
			daz := float64(angdiff(sAz, refs[i].az) * math.Cos(refs[i].el*degToRad))
			dele := sEl - refs[i].el
			worstAz, worstEl = math.Max(worstAz, math.Abs(daz)), math.Max(worstEl, math.Abs(dele))
		}
		comparisons = append(comparisons, pyfmt.Obj{{K: "body", V: bk[1]}, {K: "n", V: len(refs)},
			{K: "max_abs_az_diff_deg_cos_el", V: pyfmt.Round(worstAz, 5)},
			{K: "max_abs_el_diff_deg", V: pyfmt.Round(worstEl, 5)}})
	}
	res := pyfmt.Obj{{K: "site", V: id}, {K: "epochs", V: times}, {K: "comparisons", V: comparisons}}
	line, err := pyfmt.Marshal(pyfmt.Obj{{K: "site", V: id}, {K: "comparisons", V: comparisons}}, pyfmt.Options{Spaced: true, EnsureASCII: true})
	if err != nil {
		return nil, err
	}
	fmt.Fprintln(stdout, line)
	return res, nil
}

func run(args []string, stdout, stderr io.Writer, api string) int {
	fs := flag.NewFlagSet("validatehorizons", flag.ContinueOnError)
	fs.SetOutput(stderr)
	samples := fs.Int("samples", 12, "epochs compared per site")
	output := fs.String("output", "", "write the report here")
	apiURL := fs.String("api-url", api, "Horizons endpoint (tests use a local server)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() == 0 {
		fmt.Fprintln(stderr, "the following arguments are required: site_json")
		return 2
	}
	client := &http.Client{Timeout: 60 * time.Second}
	results := []any{}
	for _, p := range fs.Args() {
		r, err := report(client, *apiURL, p, *samples, stdout)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		results = append(results, r)
	}
	if *output != "" {
		txt, err := pyfmt.Marshal(pyfmt.Obj{{K: "reference", V: "JPL Horizons API, topocentric AZ-EL quantity 4, airless"}, {K: "results", V: results}},
			pyfmt.Options{Indent: 2, EnsureASCII: true})
		if err == nil {
			err = os.WriteFile(*output, []byte(txt+"\n"), 0o644)
		}
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
	}
	return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, defaultAPI)) }
