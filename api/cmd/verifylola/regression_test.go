package main

// Go port of tests/test_lola_regression.py: byte/checksum/decoding regressions only.
// They do not validate geographic registration, SPICE geometry or any site forecast.

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func pack(vals ...int16) []byte {
	b := make([]byte, 2*len(vals))
	for i, v := range vals {
		binary.LittleEndian.PutUint16(b[2*i:], uint16(v))
	}
	return b
}

func synthetic(raw []byte) manifest {
	var m manifest
	m.Dataset.ProductFile = "synthetic-test-only.img"
	r := &m.Dataset.Raster
	r.Lines, r.LineSamples, r.SampleBits = 1, int64(len(raw)/2), 16
	r.SampleType, r.FileSizeBytes, r.ScalingFactor = "LSB_INTEGER", int64(len(raw)), 0.5
	m.Dataset.MapProjection.CoordinateSystemName = "SYNTHETIC-NOT-NASA"
	s := sha256.Sum256(raw)
	m.Verification.SHA256 = hex.EncodeToString(s[:])
	return m
}

func write(t *testing.T, b []byte) string {
	p := filepath.Join(t.TempDir(), "fixture.img")
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func wantErr(t *testing.T, err error, msg string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), msg) {
		t.Fatalf("want %q, got %v", msg, err)
	}
}

func TestSignedInt16ExtremesAndEndianness(t *testing.T) {
	for _, dn := range []int16{-32768, -42, 0, 42, 32767} {
		raw := pack(dn)
		r, err := verify(write(t, raw), synthetic(raw))
		if err != nil || r.FirstDN != dn || r.FirstHeightM != float64(dn)*0.5 ||
			r.Status != "bytes_verified_no_geolocation_or_horizon" || r.Frame != "SYNTHETIC-NOT-NASA" {
			t.Fatalf("dn %d: %+v %v", dn, r, err)
		}
	}
}

func TestCorruptionSameLength(t *testing.T) {
	raw := pack(-10, 20, 30, 40)
	bad := append([]byte{}, raw...)
	bad[len(bad)-1] ^= 0xFF
	_, err := verify(write(t, bad), synthetic(raw))
	wantErr(t, err, "SHA-256 mismatch")
}

func TestTruncatedAndExtendedRejected(t *testing.T) {
	raw := pack(1, 2)
	// Python original appended the 4 literal bytes `\x00` (escaped string); keep a longer payload too.
	for _, p := range [][]byte{raw[:3], append(append([]byte{}, raw...), 0)} {
		_, err := verify(write(t, p), synthetic(raw))
		wantErr(t, err, "wrong file size")
	}
}

func TestInvalidManifestFailsClosed(t *testing.T) {
	raw := pack(1, 2)
	p := write(t, raw)
	for name, mutate := range map[string]func(*manifest){
		"bad_size":         func(m *manifest) { m.Dataset.Raster.FileSizeBytes = 10 },
		"wrong_type":       func(m *manifest) { m.Dataset.Raster.SampleType = "MSB_INTEGER" },
		"wrong_dimensions": func(m *manifest) { m.Dataset.Raster.Lines = 7 },
	} {
		m := synthetic(raw)
		mutate(&m)
		_, err := verify(p, m)
		if err == nil || !strings.Contains(err.Error(), "unsupported or inconsistent raster manifest") {
			t.Fatalf("%s: %v", name, err)
		}
	}
}
