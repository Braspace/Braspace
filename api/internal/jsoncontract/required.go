// Package jsoncontract validates the wire representation before typed decoding.
// In particular, Go's zero values do not prove that a caller declared an input.
package jsoncontract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Check rejects duplicate (including case aliases) object members anywhere in
// a JSON document. It prevents last-value-wins ambiguity in fingerprints and
// required physics inputs. Nesting is bounded independently of body size.
func Check(raw []byte) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := value(d, 0); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON payload")
	}
	return nil
}

func value(d *json.Decoder, depth int) error {
	if depth > 128 {
		return fmt.Errorf("JSON nesting limit exceeded")
	}
	t, err := d.Token()
	if err != nil {
		return err
	}
	switch t {
	case json.Delim('{'):
		seen := map[string]bool{}
		for d.More() {
			k, err := d.Token()
			if err != nil {
				return err
			}
			key, ok := k.(string)
			if !ok {
				return fmt.Errorf("object key must be a string")
			}
			folded := strings.ToLower(key)
			if seen[folded] {
				return fmt.Errorf("duplicate JSON field")
			}
			seen[folded] = true
			if err := value(d, depth+1); err != nil {
				return err
			}
		}
		end, err := d.Token()
		if err != nil || end != json.Delim('}') {
			return fmt.Errorf("invalid JSON object")
		}
	case json.Delim('['):
		for d.More() {
			if err := value(d, depth+1); err != nil {
				return err
			}
		}
		end, err := d.Token()
		if err != nil || end != json.Delim(']') {
			return fmt.Errorf("invalid JSON array")
		}
	}
	return nil
}

// Object decodes a nested object with explicit required fields. Optional
// non-null fields may be omitted, but a supplied null must not silently act
// as an absent physical assumption. dst must be an alias without this method.
func Object(raw []byte, dst any, required, optionalNonNull []string) error {
	var members map[string]json.RawMessage
	if err := json.Unmarshal(raw, &members); err != nil {
		return err
	}
	if members == nil {
		return fmt.Errorf("expected JSON object")
	}
	for _, k := range required {
		v, ok := members[k]
		if !ok || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			return fmt.Errorf("%s must be explicitly declared and non-null", k)
		}
	}
	for _, k := range optionalNonNull {
		for key, v := range members {
			if strings.EqualFold(key, k) {
				if key != k {
					return fmt.Errorf("%s must use canonical spelling", k)
				}
				if bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
					return fmt.Errorf("%s cannot be null", k)
				}
			}
		}
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	return d.Decode(dst)
}
