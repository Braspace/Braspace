package pyfmt

import (
	"math"
	"testing"
)

func TestFloatRepr(t *testing.T) {
	// Expected strings are CPython's repr().
	cases := map[float64]string{
		1: "1.0", 0.1: "0.1", 1e-5: "1e-05", 0.0001: "0.0001", 1e16: "1e+16", 1e15: "1000000000000000.0",
		123456789012345678: "1.2345678901234568e+17", -2.5: "-2.5", 1.5e300: "1.5e+300", 5e-324: "5e-324",
		100: "100.0", 0.30000000000000004: "0.30000000000000004", 12345.678: "12345.678", math.Copysign(0, -1): "-0.0",
	}
	for f, want := range cases {
		if got := FloatRepr(f); got != want {
			t.Errorf("FloatRepr(%v)=%s want %s", f, got, want)
		}
	}
}

func TestRoundMatchesPython(t *testing.T) {
	// round(2.675, 2) == 2.67 and round(0.5, 0) == 0.0 in CPython (exact binary value, ties to even).
	if got := Round(2.675, 2); got != 2.67 {
		t.Errorf("Round(2.675,2)=%v", got)
	}
	if got := Round(0.5, 0); got != 0 {
		t.Errorf("Round(0.5,0)=%v", got)
	}
	if got := Round(-0.0000001, 6); !math.Signbit(got) || got != 0 {
		t.Errorf("Round(-1e-7,6) should be -0.0, got %v", got)
	}
}

func TestMarshalLikeJSONDumps(t *testing.T) {
	v := Obj{{"a", []any{}}, {"b", Obj{}}, {"c", "é\"\n\U0001F600"}, {"d", Num("1.50")}, {"e", Num("7")}, {"f", []any{1.0, Num("1e3")}}}
	got, err := Marshal(v, Options{Indent: 2, EnsureASCII: true})
	want := "{\n  \"a\": [],\n  \"b\": {},\n  \"c\": \"\\u00e9\\\"\\n\\ud83d\\ude00\",\n  \"d\": 1.5,\n  \"e\": 7,\n  \"f\": [\n    1.0,\n    1000.0\n  ]\n}"
	if err != nil || got != want {
		t.Fatalf("got %q err %v\nwant %q", got, err, want)
	}
	c, _ := Marshal(Obj{{"x", []any{1, 2.5}}}, Options{EnsureASCII: true})
	if c != `{"x":[1,2.5]}` {
		t.Fatalf("compact: %s", c)
	}
	sp, _ := Marshal(Obj{{"x", []any{1, 2.5}}, {"y", "z"}}, Options{Spaced: true, EnsureASCII: true})
	if sp != `{"x": [1, 2.5], "y": "z"}` {
		t.Fatalf("spaced (json.dumps default): %s", sp)
	}
	if _, err := Marshal(math.NaN(), Options{}); err == nil {
		t.Fatal("NaN must be rejected (allow_nan=False)")
	}
}
