package main

import (
	"errors"
	"math"
	"strings"
)

const vectorLexicalModelID = "braspace-lexical-384-v1"

func fnv1a32(data []byte) uint32 {
	var h uint32 = 2166136261
	for _, b := range data {
		h ^= uint32(b)
		h *= 16777619
	}
	return h
}

func normalizeLexicalBytes(text string) []byte {
	out := make([]byte, 0, len(text))
	lastSpace := true
	for i := 0; i < len(text); i++ {
		b := text[i]
		if b >= 'A' && b <= 'Z' {
			b += 'a' - 'A'
		}
		if (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9') {
			out = append(out, b)
			lastSpace = false
		} else if !lastSpace {
			out = append(out, ' ')
			lastSpace = true
		}
	}
	if len(out) > 0 && out[len(out)-1] == ' ' {
		out = out[:len(out)-1]
	}
	return out
}

// embedProvenanceText computes a deterministic 384-dimensional unit vector
// (braspace-lexical-384-v1) for provenance-linked metadata retrieval only.
// Never used for lunar geometry, ephemerides, or scientific validation.
func embedProvenanceText(text string) ([]float64, error) {
	normBytes := normalizeLexicalBytes(text)
	if len(normBytes) == 0 {
		return nil, errors.New("query text must contain alphanumeric characters")
	}
	vec := make([]float64, vectorDimensions)
	addFeature := func(feat []byte, weight float64) {
		h := fnv1a32(feat)
		idx := int(h % vectorDimensions)
		if (h>>31)&1 == 1 {
			vec[idx] -= weight
		} else {
			vec[idx] += weight
		}
	}
	for _, tok := range strings.Fields(string(normBytes)) {
		if len(tok) >= 2 {
			addFeature([]byte("t:"+tok), 2.0)
		}
	}
	if len(normBytes) >= 3 {
		for i := 0; i <= len(normBytes)-3; i++ {
			addFeature(normBytes[i:i+3], 1.0)
		}
	} else {
		addFeature(normBytes, 1.0)
	}
	var sumSq float64
	for _, v := range vec {
		sumSq += v * v
	}
	if sumSq <= 0 || !finite(sumSq) {
		return nil, errors.New("embedding norm must be positive")
	}
	inv := 1.0 / math.Sqrt(sumSq)
	for i := range vec {
		vec[i] *= inv
	}
	return vec, nil
}
