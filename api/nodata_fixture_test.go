package main

import (
	"encoding/json"
	"io/fs"
	"sync"
	"testing"
	"testing/fstest"
)

// noDataFixtureSite keeps the "real catalog site without a stored series" path under test.
// Since every real catalog site has a LOLA + SPICE series (2026-11-15), the production
// catalog no longer contains such a site; tests that exercise DATA_NOT_AVAILABLE / 404
// NO_SERIES_DATA / N/D use this explicit fixture: the embedded site data with the series
// reference of one site removed from catalog.json. Production data is never modified.
const noDataFixtureSite = "haworth"

var (
	noDataStoreOnce sync.Once
	noDataStore     *siteStore
	noDataStoreErr  error
)

// storeWithNoDataSite returns the embedded store in which noDataFixtureSite has no series.
func storeWithNoDataSite(t *testing.T) *siteStore {
	t.Helper()
	noDataStoreOnce.Do(func() {
		sub, err := fs.Sub(embeddedSiteData, "sitedata")
		if err != nil {
			noDataStoreErr = err
			return
		}
		mfs := fstest.MapFS{}
		if err := fs.WalkDir(sub, ".", func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			b, err := fs.ReadFile(sub, p)
			if err != nil {
				return err
			}
			mfs[p] = &fstest.MapFile{Data: b}
			return nil
		}); err != nil {
			noDataStoreErr = err
			return
		}
		var cat map[string]any
		if err := json.Unmarshal(mfs["catalog.json"].Data, &cat); err != nil {
			noDataStoreErr = err
			return
		}
		for _, s := range cat["sites"].([]any) {
			m := s.(map[string]any)
			if m["id"] == noDataFixtureSite {
				delete(m, "series_file")
				delete(m, "series_sha256")
				delete(m, "note")
			}
		}
		raw, err := json.Marshal(cat)
		if err != nil {
			noDataStoreErr = err
			return
		}
		mfs["catalog.json"] = &fstest.MapFile{Data: raw}
		delete(mfs, "series/"+noDataFixtureSite+".json")
		noDataStore, noDataStoreErr = loadStore(mfs)
	})
	if noDataStoreErr != nil {
		t.Fatal(noDataStoreErr)
	}
	return noDataStore
}
