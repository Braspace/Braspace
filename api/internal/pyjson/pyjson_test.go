package pyjson

import (
	"math"
	"testing"
)

// Expected messages were produced by CPython 3.11 json.loads / bytes.decode on the same inputs.
func TestDecodeMessagesMatchCPython(t *testing.T) {
	for in, want := range map[string]string{
		"":                      "Expecting value: line 1 column 1 (char 0)",
		"  ":                    "Expecting value: line 1 column 3 (char 2)",
		"{":                     "Expecting property name enclosed in double quotes: line 1 column 2 (char 1)",
		`{"a":1,}`:              "Expecting property name enclosed in double quotes: line 1 column 8 (char 7)",
		"[1,]":                  "Expecting value: line 1 column 4 (char 3)",
		"[1 2]":                 "Expecting ',' delimiter: line 1 column 4 (char 3)",
		`{"a" 1}`:               "Expecting ':' delimiter: line 1 column 6 (char 5)",
		`{"a":1 "b":2}`:         "Expecting ',' delimiter: line 1 column 8 (char 7)",
		"nul":                   "Expecting value: line 1 column 1 (char 0)",
		"-":                     "Expecting value: line 1 column 1 (char 0)",
		"01":                    "Extra data: line 1 column 2 (char 1)",
		"1e":                    "Extra data: line 1 column 2 (char 1)",
		"[1,2":                  "Expecting ',' delimiter: line 1 column 5 (char 4)",
		`"abc`:                  "Unterminated string starting at: line 1 column 1 (char 0)",
		"\"a\nb\"":              "Invalid control character at: line 1 column 3 (char 2)",
		`"\x"`:                  "Invalid \\escape: line 1 column 2 (char 1)",
		`"\u12"`:                "Invalid \\uXXXX escape: line 1 column 3 (char 2)",
		`"\u12G4"`:              "Invalid \\uXXXX escape: line 1 column 3 (char 2)",
		`{"a":1}x`:              "Extra data: line 1 column 8 (char 7)",
		"\xef\xbb\xbf{}":        "Unexpected UTF-8 BOM (decode using utf-8-sig): line 1 column 1 (char 0)",
		"{\"a\":\n  [1,\n  2,}": "Expecting value: line 3 column 5 (char 16)",
		"[1,\n\n x]":            "Expecting value: line 3 column 2 (char 6)",
	} {
		if _, err := LoadsStr(in, nil); err == nil || err.Error() != want {
			t.Errorf("%q: got %v, want %s", in, err, want)
		}
	}
}

func TestValuesAndPythonSemantics(t *testing.T) {
	v, err := LoadsStr(`{"a":NaN,"b":[Infinity,-Infinity],"c":-0,"d":-0.0,"e":1E+2,"f":1e400,"g":"😀","h":1,"h":2}`, nil)
	if err != nil {
		t.Fatal(err)
	}
	m := v.(map[string]any)
	if !math.IsNaN(m["a"].(float64)) || !IsInt(m["c"]) || !IsFloat(m["d"]) || !IsFloat(m["e"]) || m["g"] != "😀" {
		t.Fatalf("bad types/values: %#v", m)
	}
	if !math.IsInf(m["f"].(float64), 1) || !Equal(m["h"], I(2)) || !Equal(m["c"], I(0)) {
		t.Fatalf("bad numbers: %#v", m)
	}
	if !Equal(true, I(1)) || !Equal(I(2), 2.0) || Equal(m["a"], m["a"]) || Equal(I(1), "1") || !Equal(I(1), true) {
		t.Fatal("python equality broken")
	}
	if Truthy(nil) || Truthy("") || Truthy(I(0)) || !Truthy(math.NaN()) || Truthy([]any{}) || !Truthy(map[string]any{"a": nil}) {
		t.Fatal("python truthiness broken")
	}
	if _, err := LoadsStr(`{"a":1,"a":2}`, &Options{DupKey: func(k string) error { return &OSError{"X", k} }}); err == nil || err.Error() != "a" {
		t.Fatalf("DupKey hook not applied: %v", err)
	}
	if _, err := LoadsStr(`[NaN]`, &Options{Constant: func(k string) error { return &OSError{"X", k} }}); err == nil || err.Error() != "NaN" {
		t.Fatalf("Constant hook not applied: %v", err)
	}
}

func TestUTF8Messages(t *testing.T) {
	for in, want := range map[string]string{
		"\xff":                            "'utf-8' codec can't decode byte 0xff in position 0: invalid start byte",
		"ab\xc3":                          "'utf-8' codec can't decode byte 0xc3 in position 2: unexpected end of data",
		"\xe2\x82":                        "'utf-8' codec can't decode bytes in position 0-1: unexpected end of data",
		"\xe2(\xa1":                       "'utf-8' codec can't decode byte 0xe2 in position 0: invalid continuation byte",
		"\xf0\x9f\x98":                    "'utf-8' codec can't decode bytes in position 0-2: unexpected end of data",
		"\xed\xa0\x80":                    "'utf-8' codec can't decode byte 0xed in position 0: invalid continuation byte",
		`{"a":"` + "\xf0(\x8c\xbc" + `"}`: "'utf-8' codec can't decode byte 0xf0 in position 6: invalid continuation byte",
	} {
		if err := checkUTF8([]byte(in)); err == nil || err.Error() != want {
			t.Errorf("%q: got %v, want %s", in, err, want)
		}
	}
}
