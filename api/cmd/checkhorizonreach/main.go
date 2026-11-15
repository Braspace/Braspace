// Command checkhorizonreach runs fail-closed structural checks for PRELIMINARY horizon reach studies.
// Go port of scripts/check_horizon_reach.py (same messages and exit codes).
//
// Does not independently reproduce NASA data or ray marching.
// Usage: go run ./cmd/checkhorizonreach result.json
package main

import (
	"fmt"
	"io"
	"math"
	"math/big"
	"os"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

var metrics = []string{"sun_center_visible_pct", "mean_solar_disc_visible_pct", "earth_center_visible_pct"}

// finite reports whether v is an int or float (never a bool) with a finite value.
func finite(v any) (float64, bool) {
	f, ok := pyjson.Float(v)
	return f, ok && !math.IsInf(f, 0) && !math.IsNaN(f)
}

func check(data any) []string {
	m, ok := data.(map[string]any)
	if !ok || m["schema"] != "braspace.horizon-reach-study.v1" {
		return []string{"invalid horizon reach schema"}
	}
	var errs []string
	if m["science_status"] != "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED" {
		errs = append(errs, "scientific status must remain PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")
	}
	reaches, isList := m["reaches_m"].([]any)
	okReaches := isList && len(reaches) >= 2
	for i, r := range reaches {
		n, isInt := r.(*big.Int)
		if !isInt || n.Sign() <= 0 || (i > 0 && n.Cmp(reaches[i-1].(*big.Int)) <= 0) {
			okReaches = false
			break
		}
	}
	if !okReaches {
		return append(errs, "reaches_m must be strictly increasing positive integers")
	}
	sites, _ := m["sites"].([]any)
	if len(sites) == 0 {
		return append(errs, "sites must be a nonempty list")
	}
	names := map[string]bool{}
	for _, s := range sites {
		site, _ := s.(map[string]any)
		name, isStr := site["site"].(string)
		if site == nil || !isStr || name == "" || names[name] {
			errs = append(errs, "site identifier missing or duplicate")
			continue
		}
		names[name] = true
		rows, isList := site["reaches"].([]any)
		match := isList && len(rows) == len(reaches)
		for i := 0; match && i < len(rows); i++ {
			r, _ := rows[i].(map[string]any)
			match = r != nil && pyjson.Equal(r["reach_m"], reaches[i])
		}
		if !match {
			errs = append(errs, name+": reach rows do not match declared reaches")
			continue
		}
		for _, metric := range metrics {
			prev, havePrev := 0.0, false
			for _, row := range rows {
				v, ok := finite(row.(map[string]any)[metric])
				if !ok || v < 0 || v > 100 {
					errs = append(errs, name+": invalid "+metric)
					break
				}
				if havePrev && v > prev+0.011 {
					errs = append(errs, name+": "+metric+" increases with horizon reach")
					break
				}
				prev, havePrev = v, true
			}
		}
		for _, metric := range []string{"longest_darkness_h", "longest_earth_blackout_h"} {
			prev, havePrev := 0.0, false
			for _, row := range rows {
				v, ok := finite(row.(map[string]any)[metric])
				if !ok || v < 0 {
					errs = append(errs, name+": invalid "+metric)
					break
				}
				// With identical epochs, adding terrain cannot shorten the longest blackout.
				if havePrev && v < prev-0.011 {
					errs = append(errs, name+": "+metric+" decreases with horizon reach")
					break
				}
				prev, havePrev = v, true
			}
		}
	}
	return errs
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 2 {
		fmt.Fprintln(stderr, "usage: check_horizon_reach.py result.json")
		return 2
	}
	text, err := pyjson.ReadText(args[1])
	var data any
	if err == nil {
		data, err = pyjson.LoadsStr(text, nil)
	}
	if err != nil {
		fmt.Fprintf(stderr, "BLOCKED: cannot read JSON: %v\n", err)
		return 2
	}
	errs := check(data)
	for _, e := range errs {
		fmt.Fprintln(stderr, "BLOCKED:", e)
	}
	if len(errs) > 0 {
		return 1
	}
	fmt.Fprintln(stdout, "Structural invariants PASS; science remains PRELIMINARY/UNVERIFIED")
	return 0
}

func main() { os.Exit(run(os.Args, os.Stdout, os.Stderr)) }
