package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	webData   = "../../../web/data"
	committed = "../../sitedata/series"
)

// The export is deterministic: regenerating from web/data/sites must reproduce
// the committed api/sitedata/series/*.json byte for byte.
func TestExportReproducesCommittedSeries(t *testing.T) {
	out := t.TempDir()
	var so, se bytes.Buffer
	if code := run([]string{"-web-data", webData, "-out", out}, &so, &se); code != 0 {
		t.Fatalf("exit %d: %s", code, se.String())
	}
	for _, sid := range sites {
		got, err := os.ReadFile(filepath.Join(out, sid+".json"))
		if err != nil {
			t.Fatal(err)
		}
		want, err := os.ReadFile(filepath.Join(committed, sid+".json"))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(got, want) {
			t.Errorf("%s: regenerated series differs from the committed one", sid)
		}
		if !strings.Contains(so.String(), sid+" ") {
			t.Errorf("%s: sha line missing from stdout", sid)
		}
	}
}

func TestExportRefusesCorruptBin(t *testing.T) {
	web := t.TempDir()
	if err := os.MkdirAll(filepath.Join(web, "sites"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, ext := range []string{".json", ".bin"} {
		b, err := os.ReadFile(filepath.Join(webData, "sites", sites[0]+ext))
		if err != nil {
			t.Fatal(err)
		}
		if ext == ".bin" {
			b[0] ^= 0xff
		}
		if err := os.WriteFile(filepath.Join(web, "sites", sites[0]+ext), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var so, se bytes.Buffer
	if code := run([]string{"-web-data", web, "-out", t.TempDir()}, &so, &se); code != 1 || !strings.Contains(se.String(), "!= recorded") {
		t.Fatalf("expected SHA mismatch refusal, got exit %d: %s", code, se.String())
	}
}
