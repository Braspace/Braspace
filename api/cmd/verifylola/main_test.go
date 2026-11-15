package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

// Synthetic 2x2 raster (fixture, not NASA data): checks size, hash and LSB decoding.
func fixture(t *testing.T) (string, manifest) {
	data := []byte{0x9c, 0xff, 0, 0, 1, 0, 2, 0} // first DN = -100
	p := filepath.Join(t.TempDir(), "x.img")
	if err := os.WriteFile(p, data, 0o600); err != nil {
		t.Fatal(err)
	}
	var m manifest
	m.Dataset.ProductFile = "x.img"
	m.Dataset.Raster.Lines, m.Dataset.Raster.LineSamples, m.Dataset.Raster.SampleBits = 2, 2, 16
	m.Dataset.Raster.FileSizeBytes, m.Dataset.Raster.SampleType = 8, "LSB_INTEGER"
	m.Dataset.Raster.ScalingFactor = 0.5
	s := sha256.Sum256(data)
	m.Verification.SHA256 = hex.EncodeToString(s[:])
	return p, m
}

func TestVerifyOK(t *testing.T) {
	p, m := fixture(t)
	r, err := verify(p, m)
	if err != nil || r.FirstDN != -100 || r.FirstHeightM != -50 || r.Bytes != 8 {
		t.Fatalf("got %+v err %v", r, err)
	}
}

func TestVerifyRejects(t *testing.T) {
	p, m := fixture(t)
	bad := m
	bad.Verification.SHA256 = "00"
	if _, err := verify(p, bad); err == nil {
		t.Fatal("hash mismatch accepted")
	}
	bad = m
	bad.Dataset.Raster.SampleType = "MSB_INTEGER"
	if _, err := verify(p, bad); err == nil {
		t.Fatal("wrong sample type accepted")
	}
	bad = m
	bad.Dataset.Raster.Lines, bad.Dataset.Raster.FileSizeBytes = 3, 12
	if _, err := verify(p, bad); err == nil {
		t.Fatal("wrong size accepted")
	}
}
