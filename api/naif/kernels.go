package naif

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// CLight is the speed of light in km/s (CSPICE CLIGHT).
const CLight = 299792.458

// Kernels is a loaded kernel set (the equivalent of a CSPICE kernel pool plus loaded files).
type Kernels struct {
	pool *Pool
	spk  []*segment
	pck  []*segment
	leap *leapTable
}

// New returns an empty kernel set.
func New() *Kernels { return &Kernels{pool: newPool()} }

// Pool exposes the kernel pool (read only by convention).
func (k *Kernels) Pool() *Pool { return k.pool }

// Furnsh loads a text kernel, an SPK or a binary PCK.
func (k *Kernels) Furnsh(path string) error {
	if d, err := openDAF(path); err == nil {
		switch d.idword {
		case "DAF/SPK ":
			for _, s := range d.segs {
				if s.ic[3] != 2 {
					return fmt.Errorf("%s: SPK segment type %d is not supported (type 2 only)", path, s.ic[3])
				}
			}
			k.spk = append(k.spk, d.segs...)
		case "DAF/PCK ":
			for _, s := range d.segs {
				if s.ic[2] != 2 {
					return fmt.Errorf("%s: binary PCK segment type %d is not supported (type 2 only)", path, s.ic[2])
				}
			}
			k.pck = append(k.pck, d.segs...)
		default:
			return fmt.Errorf("%s: unsupported DAF kind %q", path, d.idword)
		}
		return nil
	}
	if err := k.pool.LoadText(path); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	k.leap = nil
	return nil
}

var bodyIDs = map[string]int{
	"SOLAR SYSTEM BARYCENTER": 0, "SSB": 0, "SUN": 10, "MERCURY BARYCENTER": 1, "VENUS BARYCENTER": 2,
	"EARTH BARYCENTER": 3, "EMB": 3, "MARS BARYCENTER": 4, "JUPITER BARYCENTER": 5, "SATURN BARYCENTER": 6,
	"URANUS BARYCENTER": 7, "NEPTUNE BARYCENTER": 8, "PLUTO BARYCENTER": 9, "MERCURY": 199, "VENUS": 299,
	"EARTH": 399, "MOON": 301, "MARS": 499, "JUPITER": 599, "SATURN": 699, "URANUS": 799, "NEPTUNE": 899, "PLUTO": 999,
}

func bodyID(name string) (int, error) {
	n := strings.ToUpper(strings.TrimSpace(name))
	if v, ok := bodyIDs[n]; ok {
		return v, nil
	}
	if v, err := strconv.Atoi(n); err == nil {
		return v, nil
	}
	return 0, fmt.Errorf("unknown body %q", name)
}

func (k *Kernels) findSPK(body int, et float64) *segment {
	for i := len(k.spk) - 1; i >= 0; i-- {
		s := k.spk[i]
		if int(s.ic[0]) == body && et >= s.start && et <= s.end && s.ic[2] == frameJ2000 {
			return s
		}
	}
	return nil
}

// segState is the state of body relative to its segment centre, J2000, km and km/s.
func (k *Kernels) segState(body int, et float64) (st [6]float64, center int, err error) {
	s := k.findSPK(body, et)
	if s == nil {
		return st, 0, fmt.Errorf("insufficient ephemeris data for body %d at et %.3f", body, et)
	}
	v, r, err := s.type2(et, 3)
	if err != nil {
		return st, 0, err
	}
	return [6]float64{v[0], v[1], v[2], r[0], r[1], r[2]}, int(s.ic[1]), nil
}

// chain returns the cumulative states from body up to each ancestor (index 0 = body itself).
func (k *Kernels) chain(body int, et float64) (ids []int, sts [][6]float64, err error) {
	var acc [6]float64
	ids, sts = []int{body}, [][6]float64{{}}
	for guard := 0; body != 0; guard++ {
		if guard > 16 {
			return nil, nil, fmt.Errorf("ephemeris chain too deep")
		}
		s, c, err := k.segState(body, et)
		if err != nil {
			return nil, nil, err
		}
		for i := range acc {
			acc[i] += s[i]
		}
		ids, sts = append(ids, c), append(sts, acc)
		body = c
	}
	return ids, sts, nil
}

// stateSSB is the J2000 state of body relative to the solar system barycentre.
func (k *Kernels) stateSSB(body int, et float64) ([6]float64, error) {
	_, sts, err := k.chain(body, et)
	if err != nil {
		return [6]float64{}, err
	}
	return sts[len(sts)-1], nil
}

// geometric is the J2000 state of target relative to obs using the nearest common ancestor.
func (k *Kernels) geometric(target, obs int, et float64) ([6]float64, error) {
	ti, ts, err := k.chain(target, et)
	if err != nil {
		return [6]float64{}, err
	}
	oi, os, err := k.chain(obs, et)
	if err != nil {
		return [6]float64{}, err
	}
	for a, id := range ti {
		for b, id2 := range oi {
			if id == id2 {
				var out [6]float64
				for i := range out {
					out[i] = ts[a][i] - os[b][i]
				}
				return out, nil
			}
		}
	}
	return [6]float64{}, fmt.Errorf("no common ephemeris ancestor for %d and %d", target, obs)
}

// stelab applies stellar aberration (CSPICE STELAB) to the position pobj for an observer velocity vobs.
func stelab(pobj, vobs vec3) vec3 {
	u := vscl(1/vnorm(pobj), pobj)
	vbyc := vscl(1/CLight, vobs)
	h := vcross(u, vbyc)
	sinphi := vnorm(h)
	if sinphi == 0 {
		return pobj
	}
	phi := math.Asin(sinphi)
	return vrotv(pobj, h, phi)
}

// vrotv rotates v about axis by theta (CSPICE VROTV).
func vrotv(v, axis vec3, theta float64) vec3 {
	n := vnorm(axis)
	if n == 0 {
		return v
	}
	a := vscl(1/n, axis)
	p := vscl(vdot(v, a), a) // component along the axis
	o := vsub(v, p)          // orthogonal part
	c := vcross(a, o)
	co, si := math.Cos(theta), math.Sin(theta)
	var r vec3
	for i := 0; i < 3; i++ {
		r[i] = p[i] + float64(co*o[i]) + float64(si*c[i])
	}
	return r
}

type abcorr struct {
	lt, stellar bool
	iters       int
}

func parseAbcorr(s string) (abcorr, error) {
	switch strings.ToUpper(strings.ReplaceAll(s, " ", "")) {
	case "NONE":
		return abcorr{}, nil
	case "LT":
		return abcorr{lt: true, iters: 1}, nil
	case "LT+S":
		return abcorr{lt: true, stellar: true, iters: 1}, nil
	case "CN":
		return abcorr{lt: true, iters: 3}, nil
	case "CN+S":
		return abcorr{lt: true, stellar: true, iters: 3}, nil
	}
	return abcorr{}, fmt.Errorf("unsupported aberration correction %q (NONE, LT, LT+S, CN, CN+S)", s)
}

// apparent returns the J2000 position of target relative to an observer whose J2000 state
// relative to the SSB is obs, with the aberration corrections of ac (CSPICE SPKAPO/SPKCVO).
func (k *Kernels) apparent(target int, et float64, obs [6]float64, ac abcorr) (vec3, float64, error) {
	st, err := k.stateSSB(target, et)
	if err != nil {
		return vec3{}, 0, err
	}
	op := vec3{obs[0], obs[1], obs[2]}
	p := vsub(vec3{st[0], st[1], st[2]}, op)
	lt := vnorm(p) / CLight // geometric light time (CSPICE reports it even for NONE)
	if ac.lt {
		for i := 0; i < ac.iters; i++ {
			st, err = k.stateSSB(target, et-lt)
			if err != nil {
				return vec3{}, 0, err
			}
			p = vsub(vec3{st[0], st[1], st[2]}, op)
			lt = vnorm(p) / CLight
		}
	}
	if ac.stellar {
		p = stelab(p, vec3{obs[3], obs[4], obs[5]})
	}
	return p, lt, nil
}

// Spkpos returns the position (km) of target relative to obs in frame ref, and the one-way
// light time (s), like spiceypy.spkpos.
func (k *Kernels) Spkpos(target string, et float64, ref, abcorrStr, obs string) ([3]float64, float64, error) {
	tid, err := bodyID(target)
	if err != nil {
		return vec3{}, 0, err
	}
	oid, err := bodyID(obs)
	if err != nil {
		return vec3{}, 0, err
	}
	ac, err := parseAbcorr(abcorrStr)
	if err != nil {
		return vec3{}, 0, err
	}
	rid := k.Namfrm(ref)
	if rid == 0 {
		return vec3{}, 0, fmt.Errorf("spkpos: unknown frame %q", ref)
	}
	var p vec3
	var lt float64
	if !ac.lt {
		s, err := k.geometric(tid, oid, et)
		if err != nil {
			return vec3{}, 0, err
		}
		p = vec3{s[0], s[1], s[2]}
		lt = vnorm(p) / CLight // CSPICE reports the geometric light time even with NONE
	} else {
		so, err := k.stateSSB(oid, et)
		if err != nil {
			return vec3{}, 0, err
		}
		if p, lt, err = k.apparent(tid, et, so, ac); err != nil {
			return vec3{}, 0, err
		}
	}
	// CSPICE evaluates a body-fixed output frame at et - (light time from the frame's centre
	// to the observer), so the Moon's rotation during the light time is accounted for.
	fet := et
	if ac.lt {
		if c, ok := k.frameCenter(rid); ok && c != oid {
			so, err := k.stateSSB(oid, et)
			if err != nil {
				return vec3{}, 0, err
			}
			if _, lc, err := k.apparent(c, et, so, abcorr{lt: true, iters: ac.iters}); err == nil {
				fet = et - lc
			} else {
				return vec3{}, 0, err
			}
		}
	}
	rot, err := k.rotFromJ2000(rid, fet, 0)
	if err != nil {
		return vec3{}, 0, err
	}
	return mxv(rot.r, p), lt, nil
}

// Spkezr returns the state of target relative to obs in frame ref. Velocity is only provided
// (and only CSPICE-exact) for abcorr "NONE"; with a correction it is an error.
func (k *Kernels) Spkezr(target string, et float64, ref, abcorrStr, obs string) ([6]float64, float64, error) {
	if ac, err := parseAbcorr(abcorrStr); err != nil || ac.lt {
		if err == nil {
			err = fmt.Errorf("spkezr: velocity with %q is not implemented; use Spkpos", abcorrStr)
		}
		return [6]float64{}, 0, err
	}
	tid, err := bodyID(target)
	if err != nil {
		return [6]float64{}, 0, err
	}
	oid, err := bodyID(obs)
	if err != nil {
		return [6]float64{}, 0, err
	}
	rid := k.Namfrm(ref)
	if rid == 0 {
		return [6]float64{}, 0, fmt.Errorf("spkezr: unknown frame %q", ref)
	}
	s, err := k.geometric(tid, oid, et)
	if err != nil {
		return [6]float64{}, 0, err
	}
	rot, err := k.rotFromJ2000(rid, et, 0)
	if err != nil {
		return [6]float64{}, 0, err
	}
	p, v := vec3{s[0], s[1], s[2]}, vec3{s[3], s[4], s[5]}
	pp := mxv(rot.r, p)
	vv := vadd(mxv(rot.r, v), mxv(rot.dr, p))
	return [6]float64{pp[0], pp[1], pp[2], vv[0], vv[1], vv[2]}, 0, nil
}

// Spkcpo returns the position (km) of target relative to a constant-position observer at obspos
// (km, in obsref, relative to the centre obsctr), expressed in outref, with refloc "OBSERVER"
// (both frames evaluated at et). It is spiceypy.spkcpo; only the position of the state is returned.
func (k *Kernels) Spkcpo(target string, et float64, outref, refloc, abcorrStr string,
	obspos [3]float64, obsctr, obsref string) ([3]float64, float64, error) {
	if strings.ToUpper(strings.TrimSpace(refloc)) != "OBSERVER" {
		return vec3{}, 0, fmt.Errorf("spkcpo: only refloc OBSERVER is supported")
	}
	tid, err := bodyID(target)
	if err != nil {
		return vec3{}, 0, err
	}
	cid, err := bodyID(obsctr)
	if err != nil {
		return vec3{}, 0, err
	}
	ac, err := parseAbcorr(abcorrStr)
	if err != nil {
		return vec3{}, 0, err
	}
	of, rf := k.Namfrm(obsref), k.Namfrm(outref)
	if of == 0 || rf == 0 {
		return vec3{}, 0, fmt.Errorf("spkcpo: unknown frame")
	}
	ro, err := k.rotFromJ2000(of, et, 0)
	if err != nil {
		return vec3{}, 0, err
	}
	// Observer state relative to its centre in J2000: the frame rotates, so a point fixed in it moves.
	pj := mtxv(ro.r, obspos)
	vj := mtxv(ro.dr, obspos) // (dR)^T p, since the observer's own velocity in obsref is zero
	sc, err := k.stateSSB(cid, et)
	if err != nil {
		return vec3{}, 0, err
	}
	obs := [6]float64{sc[0] + pj[0], sc[1] + pj[1], sc[2] + pj[2], sc[3] + vj[0], sc[4] + vj[1], sc[5] + vj[2]}
	p, lt, err := k.apparent(tid, et, obs, ac)
	if err != nil {
		return vec3{}, 0, err
	}
	rr, err := k.rotFromJ2000(rf, et, 0)
	if err != nil {
		return vec3{}, 0, err
	}
	return mxv(rr.r, p), lt, nil
}
