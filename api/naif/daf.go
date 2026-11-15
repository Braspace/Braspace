package naif

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"os"
)

// segment is one DAF array summary (SPK type 2 or binary PCK type 2).
type segment struct {
	d          *daf
	start, end float64 // coverage, seconds past J2000 TDB
	ic         []int32 // integer components of the summary
	begin, fin int     // 1-based double-word addresses
}

// daf is a whole DAF file held in memory.
type daf struct {
	data   []byte
	order  binary.ByteOrder
	idword string
	segs   []*segment
}

func openDAF(path string) (*daf, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(b) < 1024 || len(b)%1024 != 0 || string(b[:4]) != "DAF/" {
		return nil, fmt.Errorf("%s: not a DAF file", path)
	}
	d := &daf{data: b, idword: string(b[:8])}
	switch string(b[88:96]) {
	case "LTL-IEEE":
		d.order = binary.LittleEndian
	case "BIG-IEEE":
		d.order = binary.BigEndian
	default:
		return nil, fmt.Errorf("%s: unsupported DAF binary format %q", path, string(b[88:96]))
	}
	nd, ni := int(d.order.Uint32(b[8:])), int(d.order.Uint32(b[12:]))
	fward := int(d.order.Uint32(b[76:]))
	if nd < 1 || nd > 124 || ni < 2 || ni > 250 {
		return nil, fmt.Errorf("%s: invalid DAF summary format", path)
	}
	size := nd + (ni+1)/2
	seen := map[int]bool{}
	for rec := fward; rec != 0; {
		if seen[rec] || rec < 1 || rec*1024 > len(b) {
			return nil, fmt.Errorf("%s: corrupt DAF summary chain", path)
		}
		seen[rec] = true
		off := (rec - 1) * 1024
		next := int(d.f64At(off))
		nsum := int(d.f64At(off + 16))
		for k := 0; k < nsum; k++ {
			so := off + 24 + k*size*8
			if so+size*8 > off+1024 {
				return nil, fmt.Errorf("%s: corrupt DAF summary record", path)
			}
			s := &segment{d: d, start: d.f64At(so), end: d.f64At(so + 8)}
			io := so + nd*8
			for j := 0; j < ni; j++ {
				s.ic = append(s.ic, int32(d.order.Uint32(b[io+4*j:])))
			}
			s.begin, s.fin = int(s.ic[ni-2]), int(s.ic[ni-1])
			if s.begin < 1 || s.fin*8 > len(b) || s.fin < s.begin {
				return nil, fmt.Errorf("%s: corrupt DAF segment address", path)
			}
			d.segs = append(d.segs, s)
		}
		rec = next
	}
	return d, nil
}

func (d *daf) f64At(byteOff int) float64 {
	return math.Float64frombits(d.order.Uint64(d.data[byteOff:]))
}

// word returns the 1-based double-word address a.
func (d *daf) word(a int) float64 { return d.f64At((a - 1) * 8) }

var errOutOfRange = errors.New("epoch outside segment coverage")

// chebyshev evaluates the polynomial and its derivative at s in [-1,1] (CSPICE CHBINT order).
func chebyshev(cp []float64, s float64) (p, dp float64) {
	s2 := s * 2
	var w, dw [3]float64
	n := len(cp) - 1
	for j := n; j >= 1; j-- {
		w[2], w[1] = w[1], w[0]
		w[0] = cp[j] + float64(s2*w[1]) - w[2]
		dw[2], dw[1] = dw[1], dw[0]
		dw[0] = float64(w[1]*2) + float64(dw[1]*s2) - dw[2]
	}
	p = cp[0] + (float64(s*w[0]) - w[1])
	dp = w[0] + float64(s*dw[0]) - dw[1]
	return
}

// type2 evaluates a type 2 segment (SPK position, or PCK Euler angles) with ncomp components.
// It returns the values and their rates per second.
func (s *segment) type2(et float64, ncomp int) (val, rate []float64, err error) {
	if et < s.start || et > s.end {
		return nil, nil, errOutOfRange
	}
	init, intlen := s.d.word(s.fin-3), s.d.word(s.fin-2)
	rsize, n := int(s.d.word(s.fin-1)), int(s.d.word(s.fin))
	if intlen <= 0 || n < 1 || rsize < 2+ncomp*2 || (rsize-2)%ncomp != 0 || s.begin+n*rsize-1 > s.fin {
		return nil, nil, errors.New("invalid type 2 segment layout")
	}
	idx := int(math.Floor((et - init) / intlen))
	if idx < 0 {
		idx = 0
	}
	if idx >= n {
		idx = n - 1
	}
	base := s.begin + idx*rsize
	mid, rad := s.d.word(base), s.d.word(base+1)
	nc := (rsize - 2) / ncomp
	sc := (et - mid) / rad
	val, rate = make([]float64, ncomp), make([]float64, ncomp)
	cp := make([]float64, nc)
	for c := 0; c < ncomp; c++ {
		for k := 0; k < nc; k++ {
			cp[k] = s.d.word(base + 2 + c*nc + k)
		}
		p, dp := chebyshev(cp, sc)
		val[c], rate[c] = p, dp/rad
	}
	return val, rate, nil
}
