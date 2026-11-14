package main

import (
	"strings"
	"testing"
)

func TestSiteReportIncludesConsumablesAndCombinedDecision(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := readExample(t, "onboard-site-evaluate.request.json")
	a, b := do(h, "POST", "/api/onboard/site-report", body), do(h, "POST", "/api/onboard/site-report", body)
	if a.Code != 200 || !strings.HasPrefix(a.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("%d %s", a.Code, a.Header().Get("Content-Type"))
	}
	if a.Body.String() != b.Body.String() {
		t.Fatal("report must be deterministic for the same input")
	}
	page := a.Body.String()
	for _, want := range []string{
		"Crew consumables and combined decision",
		"<strong>B-planned</strong> meets every assumed limit",
		"OXYGEN_DEPLETION",
		"terrain=SYNTHETIC-HORIZON-NOT-NASA",
		"not scientifically validated",
		"verify against NASA BVAD",
		"NOT FLIGHT SOFTWARE",
	} {
		if !strings.Contains(page, want) {
			t.Errorf("report is missing %q", want)
		}
	}
	if !strings.Contains(a.Header().Get("Content-Security-Policy"), "default-src 'none'") {
		t.Error("report must keep the strict CSP")
	}
}

func TestSiteReportErrorsAreJSON(t *testing.T) {
	h, _ := testAPI(t, "ok")
	body := strings.Replace(readExample(t, "onboard-site-evaluate.request.json"), `"site_id": "synthetic-demo-b"`, `"site_id": "malapert-massif"`, 1)
	rec := do(h, "POST", "/api/onboard/site-report", body)
	if rec.Code != 422 || decode(t, rec)["code"] != "DATA_NOT_AVAILABLE" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestOnboardReportWithoutAppendixUnchanged(t *testing.T) {
	h := routes(fakeEngineBinary(t, "ok"))
	rec := do(h, "POST", "/api/onboard/report", readExample(t, "../onboard/mission.synthetic.request.json"))
	if rec.Code != 200 || strings.Contains(rec.Body.String(), "Crew consumables") {
		t.Fatalf("plain onboard report must not gain the appendix: %d", rec.Code)
	}
}
