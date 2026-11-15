package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Readiness honesta: /api/health expõe o estado do store sem derrubar o serviço.
func TestHealthStoreEmbedded(t *testing.T) {
	h, _ := testAPI(t, "ok")
	rec := do(h, "GET", "/api/health", "")
	st, _ := decode(t, rec)["store"].(map[string]any)
	if rec.Code != 200 || st == nil || st["status"] != "ok" {
		t.Fatalf("embedded store: %d %s", rec.Code, rec.Body.String())
	}
}

func TestHealthStoreDegradedKeepsServing(t *testing.T) {
	h, api := testAPI(t, "ok")
	api.storePing = func(ctx context.Context) error { return errors.New("connection refused") }
	rec := do(h, "GET", "/api/health", "")
	body := decode(t, rec)
	st, _ := body["store"].(map[string]any)
	if rec.Code != 200 || st == nil || st["status"] != "degraded" || body["status"] != "degraded" {
		t.Fatalf("degraded store must stay 200 with status degraded: %d %s", rec.Code, rec.Body.String())
	}
	if _, ok := st["last_ping_ms"].(float64); !ok {
		t.Fatalf("last_ping_ms missing: %s", rec.Body.String())
	}
	// O catálogo em memória continua servindo.
	if rec := do(h, "GET", "/api/sites", ""); rec.Code != 200 {
		t.Fatalf("sites must keep serving: %d", rec.Code)
	}
}

func TestHealthStorePingTimeoutIsShort(t *testing.T) {
	h, api := testAPI(t, "ok")
	api.storePing = func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }
	start := time.Now()
	rec := do(h, "GET", "/api/health", "")
	if time.Since(start) > 2*time.Second {
		t.Fatalf("ping must be bounded, took %s", time.Since(start))
	}
	if st, _ := decode(t, rec)["store"].(map[string]any); st["status"] != "degraded" {
		t.Fatalf("hung ping must be degraded: %s", rec.Body.String())
	}
}

func TestHealthStorePingOK(t *testing.T) {
	h, api := testAPI(t, "ok")
	api.storePing = func(ctx context.Context) error { return nil }
	rec := do(h, "GET", "/api/health", "")
	body := decode(t, rec)
	if st, _ := body["store"].(map[string]any); st["status"] != "ok" || body["status"] != "ok" {
		t.Fatalf("%s", rec.Body.String())
	}
}
