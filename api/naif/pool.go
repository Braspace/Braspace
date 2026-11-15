// Package naif is a pure-Go subset of NASA/JPL NAIF SPICE: text kernels, DAF/SPK type 2,
// binary PCK type 2, TK/PCK frames, UTC/ET conversion and light-time / stellar-aberration
// corrected positions (spkpos, spkezr, spkcpo), pxform, reclat and m2q.
//
// It reproduces the CSPICE algorithms for the kernels the Braspace science pipeline loads
// (naif0012.tls, de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf, pck00010.tpc).
// Anything outside that subset fails closed with an error instead of guessing.
//
// Numerics follow CSPICE operation by operation. Every product that feeds an addition is
// wrapped in float64(...) so arm64 never fuses it into an FMA.
package naif

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Val is one kernel-pool value: a number, or a string (quoted strings and @date literals).
type Val struct {
	Num   float64
	Str   string
	IsStr bool
}

// Pool is the kernel pool built from text kernels.
type Pool struct{ vars map[string][]Val }

func newPool() *Pool { return &Pool{vars: map[string][]Val{}} }

// Numbers returns the numeric values of name.
func (p *Pool) Numbers(name string) ([]float64, bool) {
	v, ok := p.vars[name]
	if !ok {
		return nil, false
	}
	out := make([]float64, len(v))
	for i, x := range v {
		if x.IsStr {
			return nil, false
		}
		out[i] = x.Num
	}
	return out, true
}

// String returns the first string value of name.
func (p *Pool) String(name string) (string, bool) {
	v, ok := p.vars[name]
	if !ok || len(v) == 0 || !v[0].IsStr {
		return "", false
	}
	return v[0].Str, true
}

// Values returns the raw values of name.
func (p *Pool) Values(name string) ([]Val, bool) { v, ok := p.vars[name]; return v, ok }

// LoadText parses a text kernel file into the pool.
func (p *Pool) LoadText(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(strings.TrimSpace(string(b[:min(len(b), 64)])), "KPL/") {
		return fmt.Errorf("not a SPICE text kernel (first line must start with KPL/)")
	}
	return p.Parse(string(b))
}

// Parse reads the \begindata ... \begintext sections of a text kernel.
func (p *Pool) Parse(text string) error {
	var data strings.Builder
	in := false
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r", ""), "\n") {
		switch strings.TrimSpace(line) {
		case `\begindata`:
			in = true
		case `\begintext`:
			in = false
		default:
			if in {
				data.WriteString(line)
				data.WriteByte('\n')
			}
		}
	}
	return p.parseData(data.String())
}

func isSpace(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' }

func (p *Pool) parseData(s string) error {
	i, n := 0, len(s)
	skip := func() {
		for i < n && isSpace(s[i]) {
			i++
		}
	}
	for {
		skip()
		if i >= n {
			return nil
		}
		st := i
		for i < n && !isSpace(s[i]) && s[i] != '=' && !(s[i] == '+' && i+1 < n && s[i+1] == '=') {
			i++
		}
		name := s[st:i]
		skip()
		appendMode := false
		if i < n && s[i] == '+' {
			appendMode = true
			i++
		}
		if name == "" || i >= n || s[i] != '=' {
			return fmt.Errorf("text kernel: expected '=' after %q", name)
		}
		i++
		skip()
		var vals []Val
		readItem := func() error {
			if i >= n {
				return fmt.Errorf("text kernel: missing value for %q", name)
			}
			if s[i] == '\'' {
				i++
				var b strings.Builder
				for {
					if i >= n {
						return fmt.Errorf("text kernel: unterminated string in %q", name)
					}
					if s[i] == '\'' {
						if i+1 < n && s[i+1] == '\'' {
							b.WriteByte('\'')
							i += 2
							continue
						}
						i++
						break
					}
					b.WriteByte(s[i])
					i++
				}
				vals = append(vals, Val{Str: b.String(), IsStr: true})
				return nil
			}
			st := i
			for i < n && !isSpace(s[i]) && s[i] != ',' && s[i] != ')' && s[i] != '(' {
				i++
			}
			tok := s[st:i]
			if strings.HasPrefix(tok, "@") {
				vals = append(vals, Val{Str: tok, IsStr: true})
				return nil
			}
			f, err := strconv.ParseFloat(strings.NewReplacer("D", "E", "d", "e").Replace(tok), 64)
			if err != nil {
				return fmt.Errorf("text kernel: bad value %q for %q", tok, name)
			}
			vals = append(vals, Val{Num: f})
			return nil
		}
		if i < n && s[i] == '(' {
			i++
			for {
				for i < n && (isSpace(s[i]) || s[i] == ',') {
					i++
				}
				if i >= n {
					return fmt.Errorf("text kernel: unterminated list for %q", name)
				}
				if s[i] == ')' {
					i++
					break
				}
				if err := readItem(); err != nil {
					return err
				}
			}
		} else if err := readItem(); err != nil {
			return err
		}
		if appendMode {
			p.vars[name] = append(p.vars[name], vals...)
		} else {
			p.vars[name] = vals
		}
	}
}
