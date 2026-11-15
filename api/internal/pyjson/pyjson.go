// Package pyjson reproduces the parts of CPython's json.loads (3.11/3.12, C scanner) and of
// Python value semantics that the ported validation scripts depend on: NaN/Infinity accepted,
// int and float kept apart, bool distinct from int, JSONDecodeError messages with
// "line L column C (char N)" positions in code points, and Python-style equality/truthiness.
//
// Values are nil, bool, *big.Int (JSON int), float64, string, []any and map[string]any.
// Ceilings (documented, not silently wrong): json.loads(bytes) autodetection of UTF-16/32 is not
// implemented (UTF-8 and UTF-8 BOM only); lone surrogate escapes decode to U+FFFD; the 4300-digit
// int limit is not enforced.
package pyjson

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"os"
	"strconv"
	"strings"
	"syscall"
	"unicode"
)

// PyError is an error that knows the Python exception class it stands for.
type PyError interface {
	error
	PyClass() string
}

// Describe renders err the way the last line of a Python traceback would ("Class: message").
func Describe(err error) string {
	var pe PyError
	if errors.As(err, &pe) {
		return pe.PyClass() + ": " + pe.Error()
	}
	return err.Error()
}

// DecodeError is json.JSONDecodeError.
type DecodeError struct {
	Msg            string
	Pos, Line, Col int
}

func (e *DecodeError) Error() string {
	return fmt.Sprintf("%s: line %d column %d (char %d)", e.Msg, e.Line, e.Col, e.Pos)
}
func (e *DecodeError) PyClass() string { return "json.decoder.JSONDecodeError" }

// UnicodeError is UnicodeDecodeError for the utf-8 codec.
type UnicodeError struct{ Msg string }

func (e *UnicodeError) Error() string   { return e.Msg }
func (e *UnicodeError) PyClass() string { return "UnicodeDecodeError" }

// OSError is OSError and its subclasses raised by open().
type OSError struct{ Class, Msg string }

func (e *OSError) Error() string   { return e.Msg }
func (e *OSError) PyClass() string { return e.Class }

// Options mirrors the json.loads hooks the scripts use.
type Options struct {
	// DupKey mimics an object_pairs_hook that rejects duplicate keys: it is called once an
	// object has been fully parsed, with the first key that occurred twice.
	DupKey func(key string) error
	// Constant mimics parse_constant: it is called with "NaN", "Infinity" or "-Infinity".
	Constant func(token string) error
}

// I builds a JSON int value.
func I(n int64) *big.Int { return big.NewInt(n) }

// ---------------------------------------------------------------- file reading

// Repr is Python's repr() of a str (enough for file names in error messages).
func Repr(s string) string {
	q := byte('\'')
	if strings.Contains(s, "'") && !strings.Contains(s, "\"") {
		q = '"'
	}
	var b strings.Builder
	b.WriteByte(q)
	for _, r := range s {
		switch {
		case r == rune(q) || r == '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20 || r == 0x7f:
			fmt.Fprintf(&b, `\x%02x`, r)
		case r > 0x7f && !unicode.IsPrint(r):
			if r <= 0xff {
				fmt.Fprintf(&b, `\x%02x`, r)
			} else if r <= 0xffff {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				fmt.Fprintf(&b, `\U%08x`, r)
			}
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte(q)
	return b.String()
}

// PathStr is str(pathlib.PurePosixPath(s)): repeated slashes and "." components collapse.
func PathStr(s string) string {
	if s == "" {
		return "."
	}
	lead := ""
	if strings.HasPrefix(s, "/") {
		lead = "/"
		if strings.HasPrefix(s, "//") && !strings.HasPrefix(s, "///") {
			lead = "//"
		}
	}
	var parts []string
	for _, p := range strings.Split(s, "/") {
		if p != "" && p != "." {
			parts = append(parts, p)
		}
	}
	if lead == "" && len(parts) == 0 {
		return "."
	}
	return lead + strings.Join(parts, "/")
}

func osError(path string, err error) error {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		msg := errno.Error()
		if msg != "" {
			msg = strings.ToUpper(msg[:1]) + msg[1:]
		}
		class := "OSError"
		switch errno {
		case syscall.ENOENT:
			class = "FileNotFoundError"
		case syscall.EACCES, syscall.EPERM:
			class = "PermissionError"
		case syscall.EISDIR:
			class = "IsADirectoryError"
		case syscall.ENOTDIR:
			class = "NotADirectoryError"
		}
		return &OSError{class, fmt.Sprintf("[Errno %d] %s: %s", int(errno), msg, Repr(path))}
	}
	return &OSError{"OSError", err.Error()}
}

// ReadBytes is Path.read_bytes(); path is shown in errors as str(Path(path)).
func ReadBytes(path string) ([]byte, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, osError(PathStr(path), err)
	}
	return b, nil
}

// ReadText is Path.read_text(encoding="utf-8"): strict decoding plus universal newlines.
func ReadText(path string) (string, error) {
	b, err := ReadBytes(path)
	if err != nil {
		return "", err
	}
	if err := checkUTF8(b); err != nil {
		return "", err
	}
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	return strings.ReplaceAll(s, "\r", "\n"), nil
}

// checkUTF8 reports the first invalid sequence exactly as CPython's strict utf-8 decoder does.
func checkUTF8(b []byte) error {
	cont := func(c byte) bool { return c&0xC0 == 0x80 }
	fail := func(start, end int, reason string) error {
		if end-start == 1 {
			return &UnicodeError{fmt.Sprintf("'utf-8' codec can't decode byte 0x%02x in position %d: %s", b[start], start, reason)}
		}
		return &UnicodeError{fmt.Sprintf("'utf-8' codec can't decode bytes in position %d-%d: %s", start, end-1, reason)}
	}
	n := len(b)
	for i := 0; i < n; {
		c := b[i]
		switch {
		case c < 0x80:
			i++
		case c < 0xC2 || c > 0xF4:
			return fail(i, i+1, "invalid start byte")
		case c < 0xE0:
			if n-i < 2 {
				return fail(i, n, "unexpected end of data")
			}
			if !cont(b[i+1]) {
				return fail(i, i+1, "invalid continuation byte")
			}
			i += 2
		case c < 0xF0:
			if n-i < 3 {
				if n-i < 2 {
					return fail(i, n, "unexpected end of data")
				}
				if !cont(b[i+1]) || (c == 0xE0 && b[i+1] < 0xA0) || (c == 0xED && b[i+1] >= 0xA0) {
					return fail(i, i+1, "invalid continuation byte")
				}
				return fail(i, n, "unexpected end of data")
			}
			if !cont(b[i+1]) || (c == 0xE0 && b[i+1] < 0xA0) || (c == 0xED && b[i+1] >= 0xA0) {
				return fail(i, i+1, "invalid continuation byte")
			}
			if !cont(b[i+2]) {
				return fail(i, i+2, "invalid continuation byte")
			}
			i += 3
		default:
			bad2 := func() bool { return !cont(b[i+1]) || (c == 0xF0 && b[i+1] < 0x90) || (c == 0xF4 && b[i+1] >= 0x90) }
			if n-i < 4 {
				if n-i < 2 {
					return fail(i, n, "unexpected end of data")
				}
				if bad2() {
					return fail(i, i+1, "invalid continuation byte")
				}
				if n-i < 3 {
					return fail(i, n, "unexpected end of data")
				}
				if !cont(b[i+2]) {
					return fail(i, i+2, "invalid continuation byte")
				}
				return fail(i, n, "unexpected end of data")
			}
			if bad2() {
				return fail(i, i+1, "invalid continuation byte")
			}
			if !cont(b[i+2]) {
				return fail(i, i+2, "invalid continuation byte")
			}
			if !cont(b[i+3]) {
				return fail(i, i+3, "invalid continuation byte")
			}
			i += 4
		}
	}
	return nil
}

// ---------------------------------------------------------------- parsing

// LoadsStr is json.loads(str): a leading BOM is an error.
func LoadsStr(s string, o *Options) (any, error) {
	if strings.HasPrefix(s, "\xef\xbb\xbf") {
		return nil, decodeErr([]rune(s), "Unexpected UTF-8 BOM (decode using utf-8-sig)", 0)
	}
	return loads(s, o)
}

// LoadsBytes is json.loads(bytes) for UTF-8 input (a BOM is skipped, as utf-8-sig does).
func LoadsBytes(b []byte, o *Options) (any, error) {
	b = []byte(strings.TrimPrefix(string(b), "\xef\xbb\xbf"))
	if err := checkUTF8(b); err != nil {
		return nil, err
	}
	return loads(string(b), o)
}

type stop struct{ idx int }

func (stop) Error() string { return "StopIteration" }

type parser struct {
	s []rune
	o *Options
}

func decodeErr(doc []rune, msg string, pos int) *DecodeError {
	line, last := 1, -1
	for i := 0; i < pos && i < len(doc); i++ {
		if doc[i] == '\n' {
			line++
			last = i
		}
	}
	col := pos + 1
	if last >= 0 {
		col = pos - last
	}
	return &DecodeError{msg, pos, line, col}
}

func loads(s string, o *Options) (any, error) {
	if o == nil {
		o = &Options{}
	}
	p := &parser{[]rune(s), o}
	v, end, err := p.scan(p.ws(0))
	if err != nil {
		var st stop
		if errors.As(err, &st) {
			return nil, decodeErr(p.s, "Expecting value", st.idx)
		}
		return nil, err
	}
	if end = p.ws(end); end != len(p.s) {
		return nil, decodeErr(p.s, "Extra data", end)
	}
	return v, nil
}

func (p *parser) ws(i int) int {
	for i < len(p.s) && (p.s[i] == ' ' || p.s[i] == '\t' || p.s[i] == '\n' || p.s[i] == '\r') {
		i++
	}
	return i
}

func (p *parser) at(i int, lit string) bool {
	r := []rune(lit)
	if i+len(r) > len(p.s) {
		return false
	}
	for k, c := range r {
		if p.s[i+k] != c {
			return false
		}
	}
	return true
}

func (p *parser) scan(idx int) (any, int, error) {
	if idx >= len(p.s) {
		return nil, 0, stop{idx}
	}
	switch p.s[idx] {
	case '"':
		s, next, err := p.str(idx + 1)
		return s, next, err
	case '{':
		return p.object(idx + 1)
	case '[':
		return p.array(idx + 1)
	case 'n':
		if p.at(idx, "null") {
			return nil, idx + 4, nil
		}
	case 't':
		if p.at(idx, "true") {
			return true, idx + 4, nil
		}
	case 'f':
		if p.at(idx, "false") {
			return false, idx + 5, nil
		}
	case 'N':
		if p.at(idx, "NaN") {
			return p.constant("NaN", math.NaN(), idx+3)
		}
	case 'I':
		if p.at(idx, "Infinity") {
			return p.constant("Infinity", math.Inf(1), idx+8)
		}
	case '-':
		if p.at(idx, "-Infinity") {
			return p.constant("-Infinity", math.Inf(-1), idx+9)
		}
	}
	return p.number(idx)
}

func (p *parser) constant(tok string, v float64, next int) (any, int, error) {
	if p.o.Constant != nil {
		if err := p.o.Constant(tok); err != nil {
			return nil, 0, err
		}
	}
	return v, next, nil
}

func isDigit(r rune) bool { return r >= '0' && r <= '9' }

func (p *parser) number(start int) (any, int, error) {
	n, idx := len(p.s), start
	if p.s[idx] == '-' {
		idx++
		if idx >= n {
			return nil, 0, stop{start}
		}
	}
	switch c := p.s[idx]; {
	case c >= '1' && c <= '9':
		idx++
		for idx < n && isDigit(p.s[idx]) {
			idx++
		}
	case c == '0':
		idx++
	default:
		return nil, 0, stop{start}
	}
	isFloat := false
	if idx+1 < n && p.s[idx] == '.' && isDigit(p.s[idx+1]) {
		isFloat = true
		idx += 2
		for idx < n && isDigit(p.s[idx]) {
			idx++
		}
	}
	if idx+1 < n && (p.s[idx] == 'e' || p.s[idx] == 'E') {
		eStart := idx
		idx++
		if idx+1 < n && (p.s[idx] == '-' || p.s[idx] == '+') {
			idx++
		}
		for idx < n && isDigit(p.s[idx]) {
			idx++
		}
		if isDigit(p.s[idx-1]) {
			isFloat = true
		} else {
			idx = eStart
		}
	}
	text := string(p.s[start:idx])
	if isFloat {
		f, _ := strconv.ParseFloat(text, 64) // out of range gives +-Inf, as float() does
		return f, idx, nil
	}
	v, _ := new(big.Int).SetString(text, 10)
	return v, idx, nil
}

func (p *parser) str(end int) (string, int, error) {
	begin, n := end-1, len(p.s)
	var buf []rune
	for {
		next, c := end, rune(0)
		for ; next < n; next++ {
			d := p.s[next]
			if d == '"' || d == '\\' {
				c = d
				break
			}
			if d <= 0x1f {
				return "", 0, decodeErr(p.s, "Invalid control character at", next)
			}
		}
		if c == 0 {
			return "", 0, decodeErr(p.s, "Unterminated string starting at", begin)
		}
		buf = append(buf, p.s[end:next]...)
		next++
		if c == '"' {
			return string(buf), next, nil
		}
		if next == n {
			return "", 0, decodeErr(p.s, "Unterminated string starting at", begin)
		}
		c = p.s[next]
		if c != 'u' {
			end = next + 1
			r, ok := map[rune]rune{'"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t'}[c]
			if !ok {
				return "", 0, decodeErr(p.s, "Invalid \\escape", end-2)
			}
			buf = append(buf, r)
			continue
		}
		next++
		end = next + 4
		if end >= n {
			return "", 0, decodeErr(p.s, "Invalid \\uXXXX escape", next-1)
		}
		hex4 := func(from int) (rune, bool) {
			var v rune
			for k := from; k < from+4; k++ {
				d, err := strconv.ParseUint(string(p.s[k]), 16, 8)
				if err != nil {
					return 0, false
				}
				v = v<<4 | rune(d)
			}
			return v, true
		}
		c, ok := hex4(next)
		if !ok {
			return "", 0, decodeErr(p.s, "Invalid \\uXXXX escape", end-5)
		}
		if c >= 0xD800 && c <= 0xDBFF && end+6 < n && p.s[end] == '\\' && p.s[end+1] == 'u' {
			end += 6
			c2, ok := hex4(end - 4)
			if !ok {
				return "", 0, decodeErr(p.s, "Invalid \\uXXXX escape", end-5)
			}
			if c2 >= 0xDC00 && c2 <= 0xDFFF {
				c = 0x10000 + (c-0xD800)<<10 + (c2 - 0xDC00)
			} else {
				end -= 6
			}
		}
		buf = append(buf, c)
	}
}

func (p *parser) object(idx int) (any, int, error) {
	n := len(p.s)
	out := map[string]any{}
	dup, hasDup := "", false
	idx = p.ws(idx)
	if idx >= n || p.s[idx] != '}' {
		for {
			if idx >= n || p.s[idx] != '"' {
				return nil, 0, decodeErr(p.s, "Expecting property name enclosed in double quotes", idx)
			}
			key, next, err := p.str(idx + 1)
			if err != nil {
				return nil, 0, err
			}
			idx = p.ws(next)
			if idx >= n || p.s[idx] != ':' {
				return nil, 0, decodeErr(p.s, "Expecting ':' delimiter", idx)
			}
			val, next, err := p.scan(p.ws(idx + 1))
			if err != nil {
				return nil, 0, err
			}
			if _, seen := out[key]; seen && !hasDup {
				dup, hasDup = key, true
			}
			out[key] = val
			idx = p.ws(next)
			if idx < n && p.s[idx] == '}' {
				break
			}
			if idx >= n || p.s[idx] != ',' {
				return nil, 0, decodeErr(p.s, "Expecting ',' delimiter", idx)
			}
			idx = p.ws(idx + 1)
		}
	}
	if hasDup && p.o.DupKey != nil {
		if err := p.o.DupKey(dup); err != nil {
			return nil, 0, err
		}
	}
	return out, idx + 1, nil
}

func (p *parser) array(idx int) (any, int, error) {
	n := len(p.s)
	out := []any{}
	idx = p.ws(idx)
	if idx >= n || p.s[idx] != ']' {
		for {
			val, next, err := p.scan(idx)
			if err != nil {
				return nil, 0, err
			}
			out = append(out, val)
			idx = p.ws(next)
			if idx < n && p.s[idx] == ']' {
				break
			}
			if idx >= n || p.s[idx] != ',' {
				return nil, 0, decodeErr(p.s, "Expecting ',' delimiter", idx)
			}
			idx = p.ws(idx + 1)
		}
	}
	return out, idx + 1, nil
}

// ---------------------------------------------------------------- Python value semantics

// TypeName is type(v).__name__.
func TypeName(v any) string {
	switch v.(type) {
	case nil:
		return "NoneType"
	case bool:
		return "bool"
	case *big.Int:
		return "int"
	case float64:
		return "float"
	case string:
		return "str"
	case []any:
		return "list"
	default:
		return "dict"
	}
}

// IsInt is type(v) is int; IsFloat is type(v) is float (bool is neither).
func IsInt(v any) bool   { _, ok := v.(*big.Int); return ok }
func IsFloat(v any) bool { _, ok := v.(float64); return ok }

// Float converts an int or float (never a bool) to float64; huge ints become +-Inf.
func Float(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case *big.Int:
		f, _ := new(big.Float).SetInt(x).Float64()
		return f, true
	}
	return 0, false
}

func rat(v any) (*big.Rat, bool) {
	switch x := v.(type) {
	case bool:
		if x {
			return big.NewRat(1, 1), true
		}
		return new(big.Rat), true
	case *big.Int:
		return new(big.Rat).SetInt(x), true
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return nil, false
		}
		return new(big.Rat).SetFloat64(x), true
	}
	return nil, false
}

// Equal is Python's == on JSON values (True == 1 == 1.0, NaN != NaN).
func Equal(a, b any) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case string:
		y, ok := b.(string)
		return ok && x == y
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !Equal(x[i], y[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		y, ok := b.(map[string]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for k, v := range x {
			w, ok := y[k]
			if !ok || !Equal(v, w) {
				return false
			}
		}
		return true
	}
	fa, oka := a.(float64)
	fb, okb := b.(float64)
	if (oka && math.IsInf(fa, 0)) || (okb && math.IsInf(fb, 0)) {
		return oka && okb && fa == fb
	}
	ra, ok1 := rat(a)
	rb, ok2 := rat(b)
	return ok1 && ok2 && ra.Cmp(rb) == 0
}

// Truthy is bool(v).
func Truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case *big.Int:
		return x.Sign() != 0
	case float64:
		return x != 0
	case string:
		return x != ""
	case []any:
		return len(x) > 0
	case map[string]any:
		return len(x) > 0
	}
	return true
}

// Clone is copy.deepcopy.
func Clone(v any) any {
	switch x := v.(type) {
	case *big.Int:
		return new(big.Int).Set(x)
	case []any:
		out := make([]any, len(x))
		for i := range x {
			out[i] = Clone(x[i])
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, e := range x {
			out[k] = Clone(e)
		}
		return out
	}
	return v
}

// Get follows a path of string keys and int indexes (a Python subscript chain); nil if absent.
func Get(root any, path ...any) any {
	for _, k := range path {
		switch c := root.(type) {
		case map[string]any:
			root = c[k.(string)]
		case []any:
			i := k.(int)
			if i < 0 {
				i += len(c)
			}
			root = c[i]
		default:
			return nil
		}
	}
	return root
}

// Set assigns val at path (all but the last element must exist), like data[a][b] = val.
func Set(root any, val any, path ...any) {
	parent := Get(root, path[:len(path)-1]...)
	switch c := parent.(type) {
	case map[string]any:
		c[path[len(path)-1].(string)] = val
	case []any:
		c[path[len(path)-1].(int)] = val
	}
}

// Delete is del data[a][b] for a map key.
func Delete(root any, path ...any) {
	delete(Get(root, path[:len(path)-1]...).(map[string]any), path[len(path)-1].(string))
}
