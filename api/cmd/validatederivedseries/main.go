// Command validatederivedseries is the fail-closed NASA/NAIF artifact integrity check (NOT
// independent science validation). Go port of scripts/validate_derived_series.py.
//
// Usage (from api/): go run ./cmd/validatederivedseries
//
// Failures print "Class: message" (the last line of the Python traceback) and exit 1.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"unicode/utf8"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// Paths are relative to api/ (the working directory of `go -C api run ./cmd/validatederivedseries`).
var (
	seriesPath  = "sitedata/series/connecting-ridge-NAIF-PRELIMINARY.json"
	metaPath    = "../science/evidence/connecting-ridge-NAIF-PRELIMINARY.metadata.json"
	catalogPath = "sitedata/catalog.json"
)

const (
	seriesSHA = "dcfc750d6237a73af29afb4c4c29a6feae4d8c39a6b1a6092032343bb227906a" // after PR #86 (LT+S)
	metaSHA   = "6afbedfbf199af943b39c5b3f6cd0d8506d38aba1d784ace6f309af904c6253a" // after PR #86 (LT+S)
	lolaSHA   = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"
)

var kernelSHA = map[string]string{
	"naif0012.tls":             "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
	"de440s.bsp":               "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2",
	"moon_pa_de440_200625.bpc": "60cd55aa401ea2ea97360636f567554bfe4e37bb829f901b4460a455dfaf783f",
	"moon_de440_250416.tf":     "a47c71e9c9f33796bdafb2c9d69a7ee447b6016ecad80f71cd6f3e479f9cf768",
}

// IntegrityError is the Python IntegrityError(ValueError).
type IntegrityError struct{ Reason string }

func (e *IntegrityError) Error() string   { return e.Reason }
func (e *IntegrityError) PyClass() string { return "IntegrityError" }

// pyCrash stands for an uncaught Python exception (AttributeError, KeyError, TypeError) that the
// original raises on structurally wrong input; it still ends the run with exit status 1.
type pyCrash struct{ class, msg string }

func (e *pyCrash) Error() string   { return e.msg }
func (e *pyCrash) PyClass() string { return e.class }

func require(cond bool, reason string) error {
	if !cond {
		return &IntegrityError{reason}
	}
	return nil
}

func parseStrict(data []byte) (map[string]any, error) {
	v, err := pyjson.LoadsBytes(data, &pyjson.Options{
		DupKey:   func(key string) error { return &IntegrityError{"duplicate key: " + key} },
		Constant: func(token string) error { return &IntegrityError{"JSON contains " + token} },
	})
	if err != nil {
		return nil, err
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, &IntegrityError{"expected top-level JSON object"}
	}
	return m, nil
}

func readPinned(path, expectedSHA string) (map[string]any, error) {
	raw, err := pyjson.ReadBytes(path)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	if hex.EncodeToString(sum[:]) != expectedSHA {
		return nil, &IntegrityError{"source byte SHA-256 mismatch: " + pyjson.PathStr(path)}
	}
	return parseStrict(raw)
}

// getMap is d.get(key, {}) followed by use as a dict: a non-dict value is an AttributeError.
func getMap(d map[string]any, key string) (map[string]any, error) {
	v, present := d[key]
	if !present {
		return map[string]any{}, nil
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, &pyCrash{"AttributeError", fmt.Sprintf("'%s' object has no attribute 'get'", pyjson.TypeName(v))}
	}
	return m, nil
}

func direction(v any) error {
	d, ok := v.(map[string]any)
	if err := require(ok, "direction missing"); err != nil {
		return err
	}
	a, aok := pyjson.Float(d["azimuth_deg"])
	if err := require(aok && !math.IsInf(a, 0) && !math.IsNaN(a) && 0 <= a && a < 360, "invalid azimuth"); err != nil {
		return err
	}
	e, eok := pyjson.Float(d["elevation_deg"])
	return require(eok && !math.IsInf(e, 0) && !math.IsNaN(e) && -90 <= e && e <= 90, "invalid elevation")
}

// validate runs the same checks, in the same order, as the Python validate(); a step that would
// raise a non-IntegrityError in Python returns a pyCrash at the same position.
func validate(series, meta, catalog map[string]any) error {
	eq, i := pyjson.Equal, pyjson.I
	f := func(x float64) any { return x }
	var prov, site, coord map[string]any
	var terrain, samples []any
	steps := []func() error{
		func() error { return require(series["schema"] == "braspace.site-series.v1", "unexpected schema") },
		func() error { return require(series["site_id"] == "connecting-ridge", "unexpected site") },
		func() error {
			return require(series["science_status"] == "UNVERIFIED", "source is not scientifically VALIDATED")
		},
		func() error {
			for _, flag := range []string{"validated_against_independent_reference", "lola_horizon_independently_validated", "nasa_mission_certified"} {
				if err := require(meta[flag] == false, "scientific validation claim not supported: "+flag); err != nil {
					return err
				}
			}
			return nil
		},
		func() error { return require(meta["sun_earth_center_not_disc"] == true, "solar disc caveat missing") },
		func() error {
			return require(meta["spice_aberration_correction"] == "LT+S from surface site (spkcpo); Horizons-airless convention", "aberration assumption changed")
		},
		func() error { return require(meta["spice_frame"] == "MOON_ME_DE440_ME421", "SPICE frame changed") },
		func() error { return require(meta["pds_sha256"] == lolaSHA, "LOLA digest changed") },
		func() error {
			digests := map[string]any{}
			for k, v := range kernelSHA {
				digests[k] = v
			}
			return require(eq(meta["jpl_naif_kernels_sha256"], digests), "NAIF kernel digests changed")
		},
		func() error {
			// set(meta.get("kernel_sources", {})) == set(KERNEL_SHA)
			names, extra := map[string]bool{}, false
			switch ks := meta["kernel_sources"].(type) {
			case nil:
				if _, present := meta["kernel_sources"]; present {
					return &pyCrash{"TypeError", "'NoneType' object is not iterable"}
				}
			case map[string]any:
				for k := range ks {
					names[k] = true
				}
			case []any:
				for _, e := range ks {
					switch x := e.(type) {
					case string:
						names[x] = true
					case []any, map[string]any:
						return &pyCrash{"TypeError", "unhashable type: '" + pyjson.TypeName(e) + "'"}
					default:
						extra = true
					}
				}
			case string:
				extra = ks != "" // a str iterates as characters, never as the kernel names
			default:
				return &pyCrash{"TypeError", "'" + pyjson.TypeName(ks) + "' object is not iterable"}
			}
			ok := !extra && len(names) == len(kernelSHA)
			for k := range kernelSHA {
				ok = ok && names[k]
			}
			return require(ok, "kernel source list incomplete")
		},
		func() error {
			var err error
			if prov, err = getMap(series, "provenance"); err != nil {
				return err
			}
			return require(prov["terrain_sha256"] == lolaSHA, "terrain provenance mismatch")
		},
		func() error { return require(prov["frame"] == "MOON_ME", "Go/Rust frame mismatch") },
		func() error {
			return require(eq(prov["terrain_dataset_id"], meta["pds_product"]), "PDS product mismatch")
		},
		func() error {
			return require(eq(series["start_utc"], meta["start_utc"]) && meta["start_utc"] == "2026-11-15T00:00:00Z", "UTC grid changed")
		},
		func() error {
			return require(eq(series["step_seconds"], i(3600)) && eq(meta["step_minutes"], i(60)), "time step changed")
		},
		func() error { return require(eq(series["observer_height_m"], i(2)), "observer height changed") },
		func() error { return require(eq(meta["samples"], i(72)), "metadata sample count changed") },
		func() error {
			return require(eq(meta["site_latitude_deg"], f(-89.4632)) && eq(meta["site_longitude_deg"], f(-137.49)), "coordinates changed")
		},
		func() error {
			var matches []map[string]any
			list, _ := catalog["sites"].([]any)
			for _, s := range list {
				m, ok := s.(map[string]any)
				if !ok {
					return &pyCrash{"AttributeError", "'" + pyjson.TypeName(s) + "' object has no attribute 'get'"}
				}
				if m["id"] == "connecting-ridge" {
					matches = append(matches, m)
				}
			}
			if err := require(len(matches) == 1, "catalog site missing or duplicate"); err != nil {
				return err
			}
			site = matches[0]
			return nil
		},
		// Since PR #143 the API serves series/connecting-ridge.json (SHA-pinned in the catalog);
		// this 72 h NAIF artifact is evidence, not the served series.
		func() error {
			return require(site["series_file"] == "series/connecting-ridge.json", "wrong catalog series association")
		},
		func() error {
			pin, isStr := site["series_sha256"].(string)
			return require(isStr && utf8.RuneCountInString(pin) == 64, "catalog series not SHA-pinned")
		},
		func() error {
			var err error
			if coord, err = getMap(site, "coordinate"); err != nil {
				return err
			}
			return require(coord["role"] == "feature_center", "feature center falsely promoted to touchdown")
		},
		func() error {
			for _, pair := range [][2]string{{"latitude_deg", "site_latitude_deg"}, {"longitude_deg", "site_longitude_deg"}} {
				v, present := coord[pair[0]]
				if !present {
					return &pyCrash{"KeyError", "'" + pair[0] + "'"}
				}
				if err := require(eq(v, meta[pair[1]]), "catalog coordinate mismatch"); err != nil {
					return err
				}
			}
			return nil
		},
		func() error {
			var isList bool
			terrain, isList = series["terrain_horizon"].([]any)
			if _, present := series["terrain_horizon"]; !present {
				terrain, isList = []any{}, true
			}
			return require(isList && len(terrain) == 36, "terrain grid not 36 rays")
		},
		func() error {
			for k, t := range terrain {
				if err := direction(t); err != nil {
					return err
				}
				if err := require(eq(t.(map[string]any)["azimuth_deg"], i(int64(10*k))), "terrain azimuth ordering changed"); err != nil {
					return err
				}
			}
			return nil
		},
		func() error {
			var isList bool
			if samples, isList = series["samples"].([]any); !isList || len(samples) != 72 {
				return &IntegrityError{"ephemeris grid not 72 hours"}
			}
			for _, s := range samples {
				item, ok := s.(map[string]any)
				if err := require(ok, "malformed sample"); err != nil {
					return err
				}
				if err := direction(item["sun"]); err != nil {
					return err
				}
				if err := direction(item["earth"]); err != nil {
					return err
				}
			}
			return nil
		},
		func() error {
			return require(eq(pyjson.Get(samples[0], "sun", "elevation_deg"), f(1.389712)), "first sample changed")
		},
		func() error {
			return require(eq(pyjson.Get(samples[len(samples)-1], "earth", "elevation_deg"), f(0.020623)), "last sample changed")
		},
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return err
		}
	}
	return nil
}

func validateFiles() error {
	series, err := readPinned(seriesPath, seriesSHA)
	if err != nil {
		return err
	}
	meta, err := readPinned(metaPath, metaSHA)
	if err != nil {
		return err
	}
	raw, err := pyjson.ReadBytes(catalogPath)
	if err != nil {
		return err
	}
	catalog, err := parseStrict(raw)
	if err != nil {
		return err
	}
	return validate(series, meta, catalog)
}

func run(stdout, stderr io.Writer) int {
	if err := validateFiles(); err != nil {
		fmt.Fprintln(stderr, pyjson.Describe(err))
		return 1
	}
	fmt.Fprintln(stdout, "PASS: exact artifact provenance and UNVERIFIED status. NOT independent NASA scientific validation.")
	return 0
}

// absolutize makes the pinned paths absolute with symlinks resolved, like the Python Path(__file__).resolve()
// root did, so error messages name the same files.
func absolutize(paths ...*string) {
	for _, p := range paths {
		abs, err := filepath.Abs(*p)
		if err != nil {
			continue
		}
		if dir, err := filepath.EvalSymlinks(filepath.Dir(abs)); err == nil {
			abs = filepath.Join(dir, filepath.Base(abs))
		}
		*p = abs
	}
}

func main() {
	absolutize(&seriesPath, &metaPath, &catalogPath)
	os.Exit(run(os.Stdout, os.Stderr))
}
