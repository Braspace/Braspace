package naif

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// Kernels are NOT in the repository. Set NAIF_KERNEL_DIR to a directory holding naif0012.tls,
// de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf and pck00010.tpc (checksums are
// verified against the fixture) to run the comparison with spiceypy; otherwise those tests skip.
const kernelEnv = "NAIF_KERNEL_DIR"

var kernelNames = []string{"naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "pck00010.tpc"}

type fixture struct {
	KernelSHA map[string]string `json:"kernel_sha256"`
	Str2ET    []struct {
		S  string  `json:"s"`
		ET float64 `json:"et"`
	} `json:"str2et"`
	Namfrm []struct {
		Name string `json:"name"`
		ID   int    `json:"id"`
	} `json:"namfrm"`
	Spkpos []struct {
		Target, Obs, Ref, Abcorr string
		ET                       float64    `json:"et"`
		Pos                      [3]float64 `json:"pos"`
		LT                       float64    `json:"lt"`
	} `json:"spkpos"`
	Spkezr []struct {
		Target, Obs, Ref string
		ET               float64    `json:"et"`
		State            [6]float64 `json:"state"`
	} `json:"spkezr"`
	Spkcpo []struct {
		Site, Target, Abcorr string
		ET                   float64    `json:"et"`
		Obspos               [3]float64 `json:"obspos"`
		Pos                  [3]float64 `json:"pos"`
		LT                   float64    `json:"lt"`
	} `json:"spkcpo"`
	Pxform []struct {
		From, To string
		ET       float64       `json:"et"`
		M        [3][3]float64 `json:"m"`
	} `json:"pxform"`
	Reclat []struct {
		V           [3]float64 `json:"v"`
		R, Lon, Lat float64
	} `json:"reclat"`
	M2Q []struct {
		M [3][3]float64 `json:"m"`
		Q [4]float64    `json:"q"`
	} `json:"m2q"`
}

func loadFixture(t *testing.T) *fixture {
	t.Helper()
	b, err := os.ReadFile("testdata/fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var f fixture
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	return &f
}

func kernelsOrSkip(t *testing.T, f *fixture) *Kernels {
	t.Helper()
	dir := os.Getenv(kernelEnv)
	if dir == "" {
		t.Skipf("%s not set: NAIF kernels are not in the repository; skipping the spiceypy comparison", kernelEnv)
	}
	k := New()
	for _, n := range kernelNames {
		p := filepath.Join(dir, n)
		b, err := os.ReadFile(p)
		if err != nil {
			t.Skipf("kernel %s missing in %s=%s: skipping", n, kernelEnv, dir)
		}
		sum := sha256.Sum256(b)
		if want := f.KernelSHA[n]; hex.EncodeToString(sum[:]) != want {
			t.Fatalf("kernel %s SHA-256 %x differs from the fixture's %s", n, sum, want)
		}
		if err := k.Furnsh(p); err != nil {
			t.Fatal(err)
		}
	}
	return k
}

func relErr(got, want [3]float64) float64 {
	n := vnorm(want)
	d := vnorm(vsub(got, want))
	if n == 0 {
		return d
	}
	return d / n
}

func TestTextKernelParser(t *testing.T) {
	p := newPool()
	err := p.Parse(`ignored before
\begindata
 A = 1.5D-3
 B = ( 1 2,3
       4 )
 S = 'it''s' C = @1972-JAN-1
 B += ( 5 )
 L = ( 10, @1972-JAN-1  11, @1972-JUL-1 )
\begintext
 Z = 9
`)
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := p.Numbers("A"); len(v) != 1 || v[0] != 1.5e-3 {
		t.Fatalf("A=%v", v)
	}
	if v, _ := p.Numbers("B"); fmt.Sprint(v) != "[1 2 3 4 5]" {
		t.Fatalf("B=%v", v)
	}
	if s, _ := p.String("S"); s != "it's" {
		t.Fatalf("S=%q", s)
	}
	if s, _ := p.String("C"); s != "@1972-JAN-1" {
		t.Fatalf("C=%q", s)
	}
	if v, _ := p.Values("L"); len(v) != 4 || v[1].Str != "@1972-JAN-1" {
		t.Fatalf("L=%v", v)
	}
	if _, ok := p.Values("Z"); ok {
		t.Fatal("text after \\begintext must be ignored")
	}
	for _, bad := range []string{"\\begindata\n A 1\n", "\\begindata\n A = ( 1 2\n", "\\begindata\n A = 'x\n", "\\begindata\n A = xyz\n"} {
		if newPool().Parse(bad) == nil {
			t.Errorf("expected an error for %q", bad)
		}
	}
}

func TestM2QAndReclatNoKernels(t *testing.T) {
	f := loadFixture(t) // pure math: no kernels needed
	for i, c := range f.M2Q {
		q := M2Q(c.M)
		for j := range q {
			if math.Abs(q[j]-c.Q[j]) > 1e-14 {
				t.Fatalf("m2q[%d] component %d: got %v want %v", i, j, q, c.Q)
			}
		}
	}
	for i, c := range f.Reclat {
		r, lon, lat := Reclat(c.V)
		if math.Abs(r-c.R) > 1e-12*c.R || math.Abs(lon-c.Lon) > 1e-15 || math.Abs(lat-c.Lat) > 1e-15 {
			t.Fatalf("reclat[%d]: got %v %v %v want %v %v %v", i, r, lon, lat, c.R, c.Lon, c.Lat)
		}
	}
}

func TestFailClosedWithoutKernels(t *testing.T) {
	k := New()
	if _, err := k.Str2ET("2026 Nov 15 00:00:00 UTC"); err == nil {
		t.Error("str2et must fail without a leapseconds kernel")
	}
	if _, _, err := k.Spkpos("SUN", 0, "J2000", "NONE", "EARTH"); err == nil {
		t.Error("spkpos must fail without an SPK")
	}
	if _, err := k.Pxform("J2000", "NOPE", 0); err == nil {
		t.Error("pxform must fail on an unknown frame")
	}
	if k.Namfrm("NOPE") != 0 || k.Namfrm("J2000") != 1 {
		t.Error("namfrm")
	}
	if err := k.Furnsh("testdata/fixtures.json"); err == nil {
		t.Error("loading a non-kernel file must fail")
	}
}

func TestAgainstSpiceypy(t *testing.T) {
	f := loadFixture(t)
	k := kernelsOrSkip(t, f)
	t.Run("str2et", func(t *testing.T) {
		for _, c := range f.Str2ET {
			et, err := k.Str2ET(c.S)
			if err != nil {
				t.Fatal(c.S, err)
			}
			if math.Abs(et-c.ET) > 1e-6 {
				t.Errorf("%s: got %.9f want %.9f", c.S, et, c.ET)
			}
		}
		for _, bad := range []string{"", "2026 Foo 15 00:00:00 UTC", "2026-13-01T00:00:00", "tomorrow"} {
			if _, err := k.Str2ET(bad); err == nil {
				t.Errorf("str2et(%q) must fail", bad)
			}
		}
	})
	t.Run("namfrm", func(t *testing.T) {
		for _, c := range f.Namfrm {
			if got := k.Namfrm(c.Name); got != c.ID {
				t.Errorf("namfrm(%s)=%d want %d", c.Name, got, c.ID)
			}
		}
	})
	t.Run("spkpos", func(t *testing.T) {
		for _, c := range f.Spkpos {
			p, lt, err := k.Spkpos(c.Target, c.ET, c.Ref, c.Abcorr, c.Obs)
			if err != nil {
				t.Fatal(err)
			}
			if e := relErr(p, c.Pos); e > 1e-9 {
				t.Errorf("%s<-%s %s %s: rel err %.3g", c.Target, c.Obs, c.Ref, c.Abcorr, e)
			}
			if math.Abs(lt-c.LT) > 1e-9*math.Max(1, c.LT) {
				t.Errorf("%s<-%s %s: lt %v want %v", c.Target, c.Obs, c.Abcorr, lt, c.LT)
			}
		}
	})
	t.Run("spkezr", func(t *testing.T) {
		for _, c := range f.Spkezr {
			s, _, err := k.Spkezr(c.Target, c.ET, c.Ref, "NONE", c.Obs)
			if err != nil {
				t.Fatal(err)
			}
			if e := relErr([3]float64{s[0], s[1], s[2]}, [3]float64{c.State[0], c.State[1], c.State[2]}); e > 1e-9 {
				t.Errorf("%s<-%s %s position rel err %.3g", c.Target, c.Obs, c.Ref, e)
			}
			if e := relErr([3]float64{s[3], s[4], s[5]}, [3]float64{c.State[3], c.State[4], c.State[5]}); e > 1e-9 {
				t.Errorf("%s<-%s %s velocity rel err %.3g", c.Target, c.Obs, c.Ref, e)
			}
		}
		if _, _, err := k.Spkezr("SUN", 0, "J2000", "LT", "EARTH"); err == nil {
			t.Error("spkezr with a correction is not implemented and must say so")
		}
	})
	t.Run("spkcpo", func(t *testing.T) {
		for _, c := range f.Spkcpo {
			p, lt, err := k.Spkcpo(c.Target, c.ET, "MOON_ME_DE440_ME421", "OBSERVER", c.Abcorr, c.Obspos, "MOON", "MOON_ME_DE440_ME421")
			if err != nil {
				t.Fatal(err)
			}
			if e := relErr(p, c.Pos); e > 1e-9 {
				t.Errorf("%s %s %s: rel err %.3g", c.Site, c.Target, c.Abcorr, e)
			}
			if math.Abs(lt-c.LT) > 1e-9*math.Max(1, c.LT) {
				t.Errorf("%s %s lt %v want %v", c.Site, c.Abcorr, lt, c.LT)
			}
		}
		if _, err := k.Pxform("IAU_MOON", "J2000", 0); err == nil {
			t.Error("IAU_MOON needs nutation/precession terms, which are not implemented: must fail closed")
		}
		if _, _, err := k.Spkcpo("SUN", 0, "J2000", "TARGET", "NONE", [3]float64{}, "MOON", "J2000"); err == nil {
			t.Error("only refloc OBSERVER is supported")
		}
	})
	t.Run("pxform", func(t *testing.T) {
		for _, c := range f.Pxform {
			m, err := k.Pxform(c.From, c.To, c.ET)
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 3; i++ {
				for j := 0; j < 3; j++ {
					if math.Abs(m[i][j]-c.M[i][j]) > 1e-13*pxTol(c.From, c.To) {
						t.Fatalf("pxform %s->%s [%d][%d]: got %v want %v", c.From, c.To, i, j, m[i][j], c.M[i][j])
					}
				}
			}
		}
	})
}

// pxTol widens the matrix tolerance for text-PCK body-fixed frames: their prime-meridian angle is
// ~6e4 rad, so CSPICE's own rounding of it is ~1e-12 (see textPCK).
func pxTol(from, to string) float64 {
	if from == "IAU_EARTH" || to == "IAU_EARTH" || from == "IAU_MOON" || to == "IAU_MOON" {
		return 50
	}
	return 1
}
