// Command validatepolarsource runs offline, fail-closed structural checks for the BRASPACE
// lunar-source inventory (data/POLAR_SOURCE_EVIDENCE.json). Go port of
// scripts/validate_polar_source_evidence.py (same messages, exit codes and argparse behaviour).
//
// This validates provenance metadata, not the underlying scientific accuracy.
// Usage (from api/): go run ./cmd/validatepolarsource [--catalog PATH] [--verify-uploads DIR]
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/netip"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/Braspace/Braspace/api/internal/pyjson"
)

// defaultCatalog is relative to api/ (the working directory of `go -C api run ./cmd/validatepolarsource`).
const defaultCatalog = "../data/POLAR_SOURCE_EVIDENCE.json"

// CatalogError is the Python CatalogError(ValueError).
type CatalogError struct{ msg string }

func (e *CatalogError) Error() string { return e.msg }

// crash stands for an uncaught Python AttributeError (the original does not catch it: traceback, exit 1).
type crash struct{ msg string }

func (e *crash) Error() string   { return e.msg }
func (e *crash) PyClass() string { return "AttributeError" }

func must(cond bool, description string) error {
	if !cond {
		return &CatalogError{description}
	}
	return nil
}

// dict is obj.get(...) on a value that must be a dict.
func dict(v any) (map[string]any, error) {
	m, ok := v.(map[string]any)
	if !ok {
		return nil, &crash{fmt.Sprintf("'%s' object has no attribute 'get'", pyjson.TypeName(v))}
	}
	return m, nil
}

var schemeChars = regexp.MustCompile(`^[A-Za-z0-9+.\-]+$`)

// httpsURL is _https: urllib.parse.urlparse(value).scheme == "https" with a netloc. It follows
// CPython 3.11/3.12 urlsplit for scheme, netloc and bracketed hosts; a non-ASCII netloc is accepted
// without the NFKC check (ceiling).
func httpsURL(value any) (bool, error) {
	raw, ok := value.(string)
	if !ok {
		return false, nil
	}
	url := strings.TrimLeft(raw, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	url = strings.NewReplacer("\t", "", "\r", "", "\n", "").Replace(url)
	scheme, netloc := "", ""
	if i := strings.Index(url, ":"); i > 0 && ((url[0] >= 'a' && url[0] <= 'z') || (url[0] >= 'A' && url[0] <= 'Z')) && schemeChars.MatchString(url[:i]) {
		scheme, url = strings.ToLower(url[:i]), url[i+1:]
	}
	if strings.HasPrefix(url, "//") {
		end := len(url)
		for _, c := range "/?#" {
			if j := strings.IndexRune(url[2:], c); j >= 0 && j+2 < end {
				end = j + 2
			}
		}
		netloc = url[2:end]
		hasOpen, hasClose := strings.Contains(netloc, "["), strings.Contains(netloc, "]")
		if hasOpen != hasClose {
			return false, errors.New("Invalid IPv6 URL")
		}
		if hasOpen {
			_, rest, _ := strings.Cut(netloc, "[")
			host, _, _ := strings.Cut(rest, "]")
			if strings.HasPrefix(host, "v") {
				if !regexp.MustCompile(`^v[a-fA-F0-9]+\..+$`).MatchString(host) {
					return false, errors.New("IPvFuture address is invalid")
				}
			} else if addr, err := netip.ParseAddr(host); err != nil {
				return false, fmt.Errorf("%s does not appear to be an IPv4 or IPv6 address", pyjson.Repr(host))
			} else if addr.Is4() {
				return false, errors.New("An IPv4 address cannot be in brackets")
			}
		}
	}
	return scheme == "https" && netloc != "", nil
}

func isHex64(v any) bool {
	s, ok := v.(string)
	if !ok || utf8.RuneCountInString(s) != 64 {
		return false
	}
	for _, c := range s {
		if !strings.ContainsRune("0123456789abcdef", c) {
			return false
		}
	}
	return true
}

// positiveInt is isinstance(v, int) and v > 0 (a bool counts as an int, as in Python).
func positiveInt(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case *big.Int:
		return x.Sign() > 0
	}
	return false
}

func validateCatalog(catalogAny any) (int, int, error) {
	catalog, err := dict(catalogAny)
	if err != nil {
		return 0, 0, err
	}
	if err := must(catalog["schema_version"] == "1.0.0", "Unsupported catalog schema"); err != nil {
		return 0, 0, err
	}
	if err := must(catalog["integration_state"] == "CATALOG_ONLY", "Catalog must not claim integration"); err != nil {
		return 0, 0, err
	}
	rules := map[string]any{}
	if v, present := catalog["quality_rules"]; present {
		if rules, err = dict(v); err != nil {
			return 0, 0, err
		}
	}
	if err := must(rules["no_scientific_validation_by_catalog"] == true, "Source inventory must not imply scientific certification"); err != nil {
		return 0, 0, err
	}
	if err := must(rules["source_images_committed_to_git"] == false, "Reference images may not be silently embedded"); err != nil {
		return 0, 0, err
	}
	sources, isList := catalog["sources"].([]any)
	if err := must(isList && len(sources) >= 5, "Missing science sources"); err != nil {
		return 0, 0, err
	}
	visuals, isList := catalog["user_supplied_visual_references"].([]any)
	if err := must(isList && len(visuals) == 5, "Expected five uploaded references"); err != nil {
		return 0, 0, err
	}
	// Order of the checks below mirrors the Python function (the first failure wins).
	seen := map[string]bool{}
	for _, s := range sources {
		source, err := dict(s)
		if err != nil {
			return 0, 0, err
		}
		id, isStr := source["id"].(string)
		if err := must(isStr && !seen[id], "Duplicate/invalid source ID"); err != nil {
			return 0, 0, err
		}
		seen[id] = true
		if _, isStr := source["status"].(string); !isStr {
			return 0, 0, &CatalogError{id + ": missing status"}
		}
		if !pyjson.Truthy(source["source_url"]) && !pyjson.Truthy(source["data_url"]) {
			return 0, 0, &CatalogError{id + ": missing URL"}
		}
		for _, key := range []string{"source_url", "data_url", "label_url", "terms_url", "pds_url"} {
			if v, present := source[key]; present {
				ok, err := httpsURL(v)
				if err != nil {
					return 0, 0, err
				}
				if err := must(ok, id+"."+key+": invalid HTTPS URL"); err != nil {
					return 0, 0, err
				}
			}
		}
		if v, present := source["sha256"]; present {
			if err := must(isHex64(v), id+": invalid source sha256"); err != nil {
				return 0, 0, err
			}
		}
	}
	var excluded map[string]any
	for _, s := range sources {
		if m := s.(map[string]any); m["id"] == "USGS-SLDEM2015" {
			excluded = m
			break
		}
	}
	if err := must(excluded != nil && excluded["status"] == "coverage_mismatch" && excluded["priority"] == "EXCLUDE_AT_SOUTH_POLE",
		"SLDEM2015 must not be used as polar DEM"); err != nil {
		return 0, 0, err
	}
	for _, v := range visuals {
		visual, err := dict(v)
		if err != nil {
			return 0, 0, err
		}
		id, isStr := visual["id"].(string)
		if err := must(isStr && !seen[id], "Duplicate/invalid visual ID"); err != nil {
			return 0, 0, err
		}
		seen[id] = true
		if err := must(visual["usage"] == "reference_only", id+": screenshot cannot be training ground truth"); err != nil {
			return 0, 0, err
		}
		if rights := visual["rights_status"]; rights == nil || rights == "approved" {
			return 0, 0, &CatalogError{id + ": rights not verified"}
		}
		if _, isStr := visual["source_filename"].(string); !isStr {
			return 0, 0, &CatalogError{id + ": missing filename"}
		}
		if err := must(positiveInt(visual["width_px"]) && positiveInt(visual["height_px"]) && positiveInt(visual["bytes"]), id+": invalid size"); err != nil {
			return 0, 0, err
		}
		digest, present := visual["sha256"]
		if !present {
			digest = ""
		}
		if err := must(isHex64(digest), id+": invalid SHA-256"); err != nil {
			return 0, 0, err
		}
	}
	return len(sources), len(visuals), nil
}

// uploadPath is Path(uploadsDir) / name, and uploadName its .name.
func uploadPath(dir, name string) string {
	if strings.HasPrefix(name, "/") {
		return pyjson.PathStr(name)
	}
	return pyjson.PathStr(pyjson.PathStr(dir) + "/" + name)
}

func uploadName(path string) string {
	if path == "." || path == "/" {
		return ""
	}
	return path[strings.LastIndex(path, "/")+1:]
}

func verifyUploadedFiles(catalog map[string]any, dir string) error {
	for _, e := range catalog["user_supplied_visual_references"].([]any) {
		entry := e.(map[string]any)
		path := uploadPath(dir, entry["source_filename"].(string))
		st, err := os.Stat(path)
		if err := must(err == nil && st.Mode().IsRegular(), "Missing original upload: "+uploadName(path)); err != nil {
			return err
		}
		if err := must(pyjson.Equal(pyjson.I(st.Size()), entry["bytes"]), "Size mismatch: "+uploadName(path)); err != nil {
			return err
		}
		raw, err := pyjson.ReadBytes(path)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(raw)
		if err := must(hex.EncodeToString(sum[:]) == entry["sha256"], "SHA-256 mismatch: "+uploadName(path)); err != nil {
			return err
		}
	}
	return nil
}

const usage = `usage: validate_polar_source_evidence.py [-h] [--catalog CATALOG]
                                         [--verify-uploads VERIFY_UPLOADS]
`

const help = usage + `
Offline, fail-closed structural checks for the BRASPACE lunar-source
inventory. This validates provenance metadata, not the underlying scientific
accuracy.

options:
  -h, --help            show this help message and exit
  --catalog CATALOG
  --verify-uploads VERIFY_UPLOADS
                        Optionally validate all five originals; no image bytes
                        are uploaded
`

var negativeNumber = regexp.MustCompile(`^-\d+$|^-\d*\.\d+$`)

// parseArgs reproduces the argparse behaviour (abbreviated long options, --opt=value, errors
// with exit status 2) of the original two-option parser. done is true when the process must exit.
func parseArgs(args []string, stdout, stderr io.Writer) (catalog string, verify *string, exit int, done bool) {
	catalog = defaultCatalog
	fail := func(msg string) (string, *string, int, bool) {
		fmt.Fprint(stderr, usage+"validate_polar_source_evidence.py: error: "+msg+"\n")
		return "", nil, 2, true
	}
	longs := []string{"--help", "--catalog", "--verify-uploads"}
	// optionLike is argparse's classification of an argument as an option ("O") rather than a value ("A").
	optionLike := func(a string) bool {
		if a == "" || a[0] != '-' || a == "-" || negativeNumber.MatchString(a) {
			return false
		}
		name, _, _ := strings.Cut(a, "=")
		if strings.HasPrefix(name, "--") {
			for _, l := range longs {
				if strings.HasPrefix(l, name) {
					return true
				}
			}
		}
		return !strings.Contains(a, " ") || strings.HasPrefix(a, "-h")
	}
	var extras []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--" {
			extras = append(extras, args[i:]...)
			break
		}
		if !optionLike(a) {
			extras = append(extras, a)
			continue
		}
		name, explicit, hasExplicit := strings.Cut(a, "=")
		opt := ""
		switch {
		case name == "-h" || (!strings.HasPrefix(a, "--") && strings.HasPrefix(a, "-h") && !hasExplicit):
			opt = "--help"
		case strings.HasPrefix(name, "--"):
			for _, l := range longs {
				if strings.HasPrefix(l, name) {
					opt = l
				}
			}
		}
		if opt == "" {
			extras = append(extras, a)
			continue
		}
		if opt == "--help" {
			if hasExplicit && explicit != "" {
				return fail("argument -h/--help: ignored explicit argument " + pyjson.Repr(explicit))
			}
			fmt.Fprint(stdout, help)
			return "", nil, 0, true
		}
		value := explicit
		if !hasExplicit {
			if i+1 >= len(args) || args[i+1] == "--" || optionLike(args[i+1]) {
				return fail("argument " + opt + ": expected one argument")
			}
			i++
			value = args[i]
		}
		if opt == "--catalog" {
			catalog = value
		} else {
			v := value
			verify = &v
		}
	}
	if len(extras) > 0 {
		return fail("unrecognized arguments: " + strings.Join(extras, " "))
	}
	return catalog, verify, 0, false
}

func run(args []string, stdout, stderr io.Writer) int {
	catalogPath, verify, exit, done := parseArgs(args, stdout, stderr)
	if done {
		return exit
	}
	invalid := func(err error) int {
		var c *crash
		if errors.As(err, &c) { // not caught by the original: traceback, exit 1
			fmt.Fprintln(stderr, pyjson.Describe(err))
		} else {
			fmt.Fprintf(stderr, "POLAR_CATALOG_INVALID: %v\n", err)
		}
		return 1
	}
	text, err := pyjson.ReadText(pyjson.PathStr(catalogPath))
	if err != nil {
		return invalid(err)
	}
	content, err := pyjson.LoadsStr(text, nil)
	if err != nil {
		return invalid(err)
	}
	sources, references, err := validateCatalog(content)
	if err != nil {
		return invalid(err)
	}
	tail := "; uploads not inspected"
	if verify != nil {
		if err := verifyUploadedFiles(content.(map[string]any), *verify); err != nil {
			return invalid(err)
		}
		tail = "; uploaded SHA-256 verified"
	}
	fmt.Fprintf(stdout, "POLAR_CATALOG_OK: %d sources; %d references%s\n", sources, references, tail)
	return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }
