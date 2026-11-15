// Command verifylola checks the selected LOLA PDS raster against data/manifest.json.
// Go port of scripts/verify_lola.py (same output contract).
//
// Usage: go run ./cmd/verifylola [-manifest ../data/manifest.json] /path/to/ldem_80s_80m.img
package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
)

type manifest struct {
	Dataset struct {
		ProductFile string `json:"product_file"`
		Raster      struct {
			Lines         int64   `json:"lines"`
			LineSamples   int64   `json:"line_samples"`
			SampleBits    int64   `json:"sample_bits"`
			FileSizeBytes int64   `json:"file_size_bytes"`
			SampleType    string  `json:"sample_type"`
			ScalingFactor float64 `json:"scaling_factor"`
		} `json:"raster"`
		MapProjection struct {
			CoordinateSystemName string `json:"coordinate_system_name"`
		} `json:"map_projection"`
	} `json:"dataset"`
	Verification struct {
		SHA256 string `json:"sha256"`
	} `json:"verification"`
}

type result struct {
	Product      string  `json:"product"`
	Bytes        int64   `json:"bytes"`
	SHA256       string  `json:"sha256"`
	FirstDN      int16   `json:"first_dn"`
	FirstHeightM float64 `json:"first_height_m"`
	Frame        string  `json:"frame"`
	Status       string  `json:"status"`
}

func verify(path string, m manifest) (result, error) {
	r := m.Dataset.Raster
	expected := r.Lines * r.LineSamples * (r.SampleBits / 8)
	if expected != r.FileSizeBytes || r.SampleType != "LSB_INTEGER" {
		return result{}, errors.New("unsupported or inconsistent raster manifest")
	}
	f, err := os.Open(path)
	if err != nil {
		return result{}, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return result{}, err
	}
	if st.Size() != expected {
		return result{}, fmt.Errorf("wrong file size: expected %d bytes", expected)
	}
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return result{}, err
	}
	sum := hex.EncodeToString(h.Sum(nil))
	if sum != m.Verification.SHA256 {
		return result{}, errors.New("SHA-256 mismatch")
	}
	var first [2]byte
	if _, err := f.ReadAt(first[:], 0); err != nil {
		return result{}, err
	}
	dn := int16(binary.LittleEndian.Uint16(first[:]))
	return result{
		Product:      m.Dataset.ProductFile,
		Bytes:        expected,
		SHA256:       sum,
		FirstDN:      dn,
		FirstHeightM: float64(dn) * r.ScalingFactor,
		Frame:        m.Dataset.MapProjection.CoordinateSystemName,
		Status:       "bytes_verified_no_geolocation_or_horizon",
	}, nil
}

func main() {
	mpath := flag.String("manifest", "../data/manifest.json", "path to data/manifest.json")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: verifylola [-manifest path] /path/to/ldem_80s_80m.img")
		os.Exit(2)
	}
	raw, err := os.ReadFile(*mpath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	res, err := verify(flag.Arg(0), m)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	out, _ := json.MarshalIndent(res, "", "  ")
	fmt.Println(string(out))
}
