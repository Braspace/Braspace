package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Contrato OpenAPI: limit tem minimum 1 e vector é array de números (sem null).
// Antes da correção, limit:0 e limit:null viravam o padrão 5 e null virava 0.
func TestVectorRejectsExplicitZeroLimitAndNullValues(t *testing.T) {
	zeros := strings.Repeat("0,", vectorDimensions-1)
	cases := []struct{ name, body, code string }{
		{"limit zero", `{"model_id":"m","vector":[1,` + zeros[:len(zeros)-1] + `],"limit":0}`, "INVALID_LIMIT"},
		{"limit null", `{"model_id":"m","vector":[1,` + zeros[:len(zeros)-1] + `],"limit":null}`, "INVALID_LIMIT"},
		{"vector null element", `{"model_id":"m","vector":[1,` + strings.Repeat("0,", vectorDimensions-2) + `null]}`, "INVALID_VECTOR"},
		{"vector null", `{"model_id":"m","vector":null}`, "INVALID_VECTOR"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/vector/search", strings.NewReader(tc.body))
			r.Header.Set("Content-Type", "application/json")
			_, code, err := parseVectorRequest(r)
			if err == nil || code != tc.code {
				t.Fatalf("aceitou entrada fora do contrato: code=%q err=%v, esperado %s", code, err, tc.code)
			}
		})
	}
	// limit omitido continua valendo o padrão 5.
	r := httptest.NewRequest(http.MethodPost, "/api/vector/search", strings.NewReader(vectorRequestNoLimit()))
	r.Header.Set("Content-Type", "application/json")
	if req, _, err := parseVectorRequest(r); err != nil || req.Limit != 5 {
		t.Fatalf("limit omitido deve valer 5: %v %+v", err, req)
	}
}
func vectorRequestNoLimit() string {
	return `{"model_id":"m","vector":[1,` + strings.Repeat("0,", vectorDimensions-2) + `0]}`
}
