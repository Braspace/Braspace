// Package pyfmt reproduces the byte-level output of Python's json.dumps and
// float repr()/round() so Go ports of the science scripts write identical files.
// Standard library only.
package pyfmt

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

// KV is one ordered object member.
type KV struct {
	K string
	V any
}

// Obj is a JSON object that keeps member order (Python dict insertion order).
type Obj []KV

// Num is the raw text of a JSON number read from a file. Like Python's json.loads
// it is an int when it has no '.', 'e' or 'E' and a float otherwise.
type Num string

// Get returns the value for key.
func (o Obj) Get(key string) (any, bool) {
	for _, kv := range o {
		if kv.K == key {
			return kv.V, true
		}
	}
	return nil, false
}

// FloatRepr formats f exactly like Python's repr(float).
func FloatRepr(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		panic("pyfmt: non-finite float")
	}
	if f == 0 {
		if math.Signbit(f) {
			return "-0.0"
		}
		return "0.0"
	}
	s := strconv.FormatFloat(f, 'e', -1, 64) // d.ddde±XX
	neg := ""
	if s[0] == '-' {
		neg, s = "-", s[1:]
	}
	epos := strings.IndexByte(s, 'e')
	exp, _ := strconv.Atoi(s[epos+1:])
	digits := strings.Replace(s[:epos], ".", "", 1)
	n := len(digits)
	decpt := exp + 1
	if decpt <= -4 || decpt > 16 {
		m := digits[:1]
		if n > 1 {
			m += "." + digits[1:]
		}
		sign := "+"
		if exp < 0 {
			sign, exp = "-", -exp
		}
		return neg + m + "e" + sign + fmt.Sprintf("%02d", exp)
	}
	switch {
	case decpt <= 0:
		return neg + "0." + strings.Repeat("0", -decpt) + digits
	case decpt >= n:
		return neg + digits + strings.Repeat("0", decpt-n) + ".0"
	default:
		return neg + digits[:decpt] + "." + digits[decpt:]
	}
}

// Round reproduces Python's round(x, nd) for finite floats (correctly rounded
// decimal string, ties to even on the exact binary value).
func Round(x float64, nd int) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) || x == 0 {
		return x
	}
	r, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', nd, 64), 64)
	if r == 0 && math.Signbit(x) {
		return math.Copysign(0, -1)
	}
	return r
}

// Options select the json.dumps flavour.
type Options struct {
	Indent      int  // >0: indent=N (item separator ",\n"); 0: compact separators (",", ":")
	Spaced      bool // Indent==0 only: json.dumps defaults (", ", ": ") instead of compact
	EnsureASCII bool // json.dumps default is true
}

// Marshal encodes v like json.dumps(v, allow_nan=False, ...).
func Marshal(v any, o Options) (string, error) {
	var b strings.Builder
	if err := enc(&b, v, o, 0); err != nil {
		return "", err
	}
	return b.String(), nil
}

func itemSep(o Options) string {
	if o.Spaced && o.Indent == 0 {
		return ", "
	}
	return ","
}

func nl(b *strings.Builder, o Options, level int) {
	b.WriteByte('\n')
	b.WriteString(strings.Repeat(" ", o.Indent*level))
}

func enc(b *strings.Builder, v any, o Options, level int) error {
	switch t := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if t {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case string:
		b.WriteString(Quote(t, o.EnsureASCII))
	case int:
		b.WriteString(strconv.Itoa(t))
	case int64:
		b.WriteString(strconv.FormatInt(t, 10))
	case float64:
		if math.IsNaN(t) || math.IsInf(t, 0) {
			return errors.New("Out of range float values are not JSON compliant")
		}
		b.WriteString(FloatRepr(t))
	case Num:
		s := string(t)
		if strings.ContainsAny(s, ".eE") {
			f, err := strconv.ParseFloat(s, 64)
			if err != nil || math.IsInf(f, 0) {
				return fmt.Errorf("invalid number %q", s)
			}
			b.WriteString(FloatRepr(f))
		} else {
			b.WriteString(s)
		}
	case []any:
		if len(t) == 0 {
			b.WriteString("[]")
			return nil
		}
		b.WriteByte('[')
		for i, e := range t {
			if i > 0 {
				b.WriteString(itemSep(o))
			}
			if o.Indent > 0 {
				nl(b, o, level+1)
			}
			if err := enc(b, e, o, level+1); err != nil {
				return err
			}
		}
		if o.Indent > 0 {
			nl(b, o, level)
		}
		b.WriteByte(']')
	case Obj:
		if len(t) == 0 {
			b.WriteString("{}")
			return nil
		}
		b.WriteByte('{')
		for i, kv := range t {
			if i > 0 {
				b.WriteString(itemSep(o))
			}
			if o.Indent > 0 {
				nl(b, o, level+1)
			}
			b.WriteString(Quote(kv.K, o.EnsureASCII))
			if o.Indent > 0 || o.Spaced {
				b.WriteString(": ")
			} else {
				b.WriteByte(':')
			}
			if err := enc(b, kv.V, o, level+1); err != nil {
				return err
			}
		}
		if o.Indent > 0 {
			nl(b, o, level)
		}
		b.WriteByte('}')
	default:
		return fmt.Errorf("pyfmt: unsupported type %T", v)
	}
	return nil
}

// Quote encodes a string like Python's json encoder.
func Quote(s string, ascii bool) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			b.WriteString(`\"`)
		case r == '\\':
			b.WriteString(`\\`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\b':
			b.WriteString(`\b`)
		case r == '\f':
			b.WriteString(`\f`)
		case r < 0x20:
			fmt.Fprintf(&b, `\u%04x`, r)
		case r < 0x7f+1 || !ascii:
			b.WriteRune(r)
		case r > 0xFFFF:
			r -= 0x10000
			fmt.Fprintf(&b, `\u%04x\u%04x`, 0xD800+(r>>10), 0xDC00+(r&0x3FF))
		default:
			fmt.Fprintf(&b, `\u%04x`, r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// Parse decodes JSON into Obj / []any / string / Num / bool / nil (order kept).
func Parse(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := parseValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("Extra data after JSON value")
	}
	return v, nil
}

func parseValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		if t == '{' {
			obj := Obj{}
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				val, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				key := kt.(string)
				replaced := false
				for i := range obj { // Python dict: last value wins, first position kept
					if obj[i].K == key {
						obj[i].V, replaced = val, true
						break
					}
				}
				if !replaced {
					obj = append(obj, KV{key, val})
				}
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return obj, nil
		}
		arr := []any{}
		for dec.More() {
			val, err := parseValue(dec)
			if err != nil {
				return nil, err
			}
			arr = append(arr, val)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return arr, nil
	case json.Number:
		return Num(t), nil
	default:
		return tok, nil
	}
}

// Float converts a parsed JSON value like Python's float(x) (numbers and numeric strings).
func Float(v any) (float64, error) {
	switch t := v.(type) {
	case Num:
		return strconv.ParseFloat(string(t), 64)
	case float64:
		return t, nil
	case string:
		return strconv.ParseFloat(strings.TrimSpace(t), 64)
	case bool:
		if t {
			return 1, nil
		}
		return 0, nil
	}
	return 0, fmt.Errorf("float() argument must be a string or a number, not %T", v)
}

// Str converts a parsed JSON value like Python's str(x) for scalars.
func Str(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case Num:
		s := string(t)
		if strings.ContainsAny(s, ".eE") {
			f, _ := strconv.ParseFloat(s, 64)
			return FloatRepr(f)
		}
		return s
	case float64:
		return FloatRepr(t)
	case bool:
		if t {
			return "True"
		}
		return "False"
	case nil:
		return "None"
	}
	return fmt.Sprint(v)
}

// ToValidUTF8 mimics bytes.decode("utf-8", errors="replace"): one U+FFFD per bad byte.
func ToValidUTF8(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	var sb strings.Builder
	for len(b) > 0 {
		r, n := utf8.DecodeRune(b)
		if r == utf8.RuneError && n == 1 {
			sb.WriteRune(utf8.RuneError)
		} else {
			sb.Write(b[:n])
		}
		b = b[n:]
	}
	return sb.String()
}

// PyMod is Python's float %: the result takes the sign of the divisor.
func PyMod(x, y float64) float64 {
	m := math.Mod(x, y)
	if m != 0 && (m < 0) != (y < 0) {
		m += y
	}
	return m
}
