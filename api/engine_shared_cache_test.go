package main

import (
	"fmt"
	"net/http"
	"sync"
	"testing"
)

// The engine is a pure function of one stored sample, so a second request over the same samples must not
// need the engine at all. Proven by swapping the engine for one that always fails after the first request.
func TestRepeatedWindowIsServedWithoutTheEngine(t *testing.T) {
	h, api := testAPI(t, "ok")
	body := `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-11-01T00:00:00Z","duration_hours":24}`
	first := do(h, "POST", "/api/compare", body)
	if first.Code != http.StatusOK {
		t.Fatalf("first request: %d %.200s", first.Code, first.Body.String())
	}
	if got := api.engine.sharedCount.Load(); got != 24 {
		t.Fatalf("expected 24 remembered samples, got %d", got)
	}
	api.engine.binary = fakeEngineBinary(t, "fail")
	second := do(h, "POST", "/api/compare", body)
	if second.Code != http.StatusOK || second.Body.String() != first.Body.String() {
		t.Fatalf("repeat must be identical and engine-free: %d %.200s", second.Code, second.Body.String())
	}
	// A window that needs one sample the cache does not hold still fails closed with the broken engine.
	wider := do(h, "POST", "/api/compare", `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-11-01T00:00:00Z","duration_hours":25}`)
	if wider.Code != http.StatusBadGateway || decode(t, wider)["code"] != "ENGINE_ERROR" {
		t.Fatalf("uncached sample must still need the engine: %d %.200s", wider.Code, wider.Body.String())
	}
	if got := api.engine.sharedCount.Load(); got != 24 {
		t.Fatalf("a failed call must not be remembered, count %d", got)
	}
}

// Results belong to the series object that produced them: another series under the same site id starts cold.
func TestRememberedResultsDoNotLeakBetweenSeriesObjects(t *testing.T) {
	h, api := testAPI(t, "ok")
	body := `{"site_ids":["synthetic-demo-a"],"start_utc":"2026-11-01T00:00:00Z","duration_hours":6}`
	if rec := do(h, "POST", "/api/compare", body); rec.Code != http.StatusOK {
		t.Fatalf("%d %.200s", rec.Code, rec.Body.String())
	}
	original, _ := api.store.seriesFor("synthetic-demo-a")
	replacement := *original
	api.store.series["synthetic-demo-a"] = &replacement
	t.Cleanup(func() { api.store.series["synthetic-demo-a"] = original })
	api.engine.binary = fakeEngineBinary(t, "fail")
	if rec := do(h, "POST", "/api/compare", body); rec.Code != http.StatusBadGateway {
		t.Fatalf("a new series object must not reuse old results: %d %.200s", rec.Code, rec.Body.String())
	}
}

// Parallel identical comparisons, none of them seen before: they must share the engine runs rather than
// each start their own. 32 requests x 2 sites x 72 samples would be 4,608 processes; 144 are needed.
func TestParallelIdenticalComparisonsShareEngineRuns(t *testing.T) {
	h, api := testAPI(t, "ok")
	body := `{"site_ids":["synthetic-demo-a","synthetic-demo-b"],"start_utc":"2026-11-01T00:00:00Z","duration_hours":72}`
	defer func() {
		if got := api.engine.sharedCount.Load(); got != 144 {
			t.Errorf("expected 144 remembered samples, got %d", got)
		}
		leftover := 0
		api.engine.inflight.Range(func(_, _ any) bool { leftover++; return true })
		if leftover != 0 {
			t.Errorf("%d in-flight markers left behind", leftover)
		}
	}()
	var wg sync.WaitGroup
	errs := make(chan string, 32)
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if rec := do(h, "POST", "/api/compare", body); rec.Code != http.StatusOK {
				errs <- fmt.Sprintf("%d %.120s", rec.Code, rec.Body.String())
			}
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Error(e)
	}
}
