package main

// Go port of tests/test_compose_cors_contract.py: static security regression for
// Compose's opt-in CORS. The live preflight runs in .github/workflows/compose-cors.yml.

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestComposeForwardsOptInOriginsNotWildcard(t *testing.T) {
	raw, err := os.ReadFile("../compose.yaml")
	if err != nil {
		t.Fatal(err)
	}
	cfg := string(raw)
	if !regexp.MustCompile(`(?m)^\s{6}CORS_ALLOWED_ORIGINS:\s*\$\{CORS_ALLOWED_ORIGINS:-\}\s*$`).MatchString(cfg) {
		t.Fatal("compose.yaml must forward CORS_ALLOWED_ORIGINS opt-in with empty default")
	}
	if regexp.MustCompile(`(?m)^\s{6}CORS_ALLOWED_ORIGINS:\s*['"]?\*`).MatchString(cfg) {
		t.Fatal("compose.yaml sets a wildcard CORS origin")
	}
	if strings.Contains(cfg, "Access-Control-Allow-Origin: *") {
		t.Fatal("compose.yaml hardcodes Access-Control-Allow-Origin: *")
	}
}

func TestMiddlewareDeniesWildcardAndUnknownOrigin(t *testing.T) {
	raw, err := os.ReadFile("middleware.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	for _, want := range []string{`case o == "*":`, `allowed := origins[origin]`, "http.StatusForbidden"} {
		if !strings.Contains(src, want) {
			t.Fatalf("middleware.go missing %q", want)
		}
	}
}
