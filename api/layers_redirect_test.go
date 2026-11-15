package main

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// The source catalog host allowlist must remain effective even if a trusted
// NASA origin responds with a cross-origin or downgrade Location header.
// A final SHA-256 comparison cannot undo an SSRF request that already ran.
func TestNASAAssetProxyDoesNotFollowRedirects(t *testing.T) {
	for _, status := range []int{http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther, http.StatusTemporaryRedirect, http.StatusPermanentRedirect} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var destinationHits atomic.Int32
			target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				destinationHits.Add(1)
				_, _ = w.Write([]byte("should never be requested"))
			}))
			defer target.Close()
			redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				http.Redirect(w, r, target.URL+"/private-metadata", status)
			}))
			defer redirector.Close()
			l, h := testLayers(t)
			l.byID["lroc-color-2k"].SourceURL = redirector.URL
			rec := do(h, http.MethodGet, "/api/layers/lroc-color-2k/asset", "")
			if rec.Code != http.StatusBadGateway {
				t.Fatalf("redirect accepted: status %d body %s", rec.Code, rec.Body.String())
			}
			if destinationHits.Load() != 0 {
				t.Fatalf("SSRF: followed upstream redirect %d to another host", status)
			}
			if len(l.assets.data) != 0 {
				t.Fatal("redirect response must not be cached")
			}
		})
	}
}
