// Optional pgvector metadata retrieval. NEVER used for scientific geometry,
// landing-site ranking or the truth value of a NASA-derived measurement.
// Standard PostgreSQL and embedded mode keep working when this is disabled.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

const vectorDimensions = 384
const vectorMaxRequestBytes = 16 << 10

var modelNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$`)
var vectorSHA256Re = regexp.MustCompile(`^[a-f0-9]{64}$`)

type vectorSearchRequest struct {
	ModelID string    `json:"model_id"`
	Vector  []float64 `json:"vector"`
	Limit   int       `json:"limit"`
}

// Pointer elements preserve the difference between explicit zero and JSON null.
// RawMessage preserves the distinction between omitted limit (default 5) and
// an explicit invalid null or zero.
type vectorSearchWire struct {
	ModelID string          `json:"model_id"`
	Vector  []*float64      `json:"vector"`
	Limit   json.RawMessage `json:"limit"`
}

type vectorHit struct {
	SourceRef  string  `json:"source_ref"`
	Title      string  `json:"title"`
	SourceURL  string  `json:"source_url"`
	SHA256     string  `json:"sha256"`
	Similarity float64 `json:"similarity"`
}
type vectorAPI struct {
	enabled   bool
	modelID   string
	pool      *pgxpool.Pool
	initError error
}

func vectorLiteral(v []float64) (string, error) {
	if len(v) != vectorDimensions {
		return "", fmt.Errorf("vector must have %d dimensions", vectorDimensions)
	}
	// Cosine similarity is scale-invariant. Normalize after scaling by the
	// largest component to avoid float64 norm underflow and pgvector's float32
	// conversion turning a mathematically nonzero vector into all zeroes.
	var maxAbs float64
	for _, x := range v {
		if !finite(x) || math.Abs(x) > 1e6 {
			return "", errors.New("vector must be finite and bounded")
		}
		maxAbs = math.Max(maxAbs, math.Abs(x))
	}
	if maxAbs == 0 {
		return "", errors.New("vector norm must be finite and positive")
	}
	var norm float64
	for _, x := range v {
		scaled := x / maxAbs
		norm += scaled * scaled
	}
	norm = math.Sqrt(norm)
	parts := make([]string, len(v))
	for i, x := range v {
		// Round to the same single precision stored by pgvector before encoding.
		scaled := float32((x / maxAbs) / norm)
		if scaled == 0 {
			scaled = 0 // canonicalize negative zero
		}
		parts[i] = strconv.FormatFloat(float64(scaled), 'g', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]", nil
}

func parseVectorRequest(r *http.Request) (vectorSearchRequest, string, error) {
	var req vectorSearchRequest
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return req, "UNSUPPORTED_MEDIA_TYPE", errors.New("application/json required")
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, vectorMaxRequestBytes+1))
	if err != nil || len(raw) > vectorMaxRequestBytes {
		return req, "REQUEST_TOO_LARGE", errors.New("body exceeds 16 KiB")
	}
	var wire vectorSearchWire
	dec := json.NewDecoder(bytes.NewReader(raw))
	// Decode exact field names once. Go's struct decoder otherwise accepts
	// duplicate keys and case-insensitive aliases, contrary to the contract.
	first, err := dec.Token()
	if err != nil || first != json.Delim('{') {
		return req, "INVALID_JSON", errors.New("invalid JSON payload")
	}
	seen := map[string]bool{}
	for dec.More() {
		token, err := dec.Token()
		key, ok := token.(string)
		if err != nil || !ok || seen[key] {
			return req, "INVALID_JSON", errors.New("invalid or duplicate JSON field")
		}
		seen[key] = true
		var target any
		switch key {
		case "model_id":
			target = &wire.ModelID
		case "vector":
			target = &wire.Vector
		case "limit":
			target = &wire.Limit
		default:
			return req, "INVALID_JSON", errors.New("unknown JSON field")
		}
		if err := dec.Decode(target); err != nil {
			return req, "INVALID_JSON", errors.New("invalid JSON field value")
		}
	}
	last, err := dec.Token()
	if err != nil || last != json.Delim('}') {
		return req, "INVALID_JSON", errors.New("invalid JSON payload")
	}
	var tail any
	if err := dec.Decode(&tail); err != io.EOF {
		return req, "INVALID_JSON", errors.New("trailing JSON payload")
	}
	req.ModelID = wire.ModelID
	if !modelNameRe.MatchString(req.ModelID) {
		return req, "INVALID_MODEL", errors.New("invalid model_id")
	}
	req.Limit = 5
	if len(wire.Limit) > 0 {
		if bytes.Equal(wire.Limit, []byte("null")) || json.Unmarshal(wire.Limit, &req.Limit) != nil || req.Limit < 1 || req.Limit > 10 {
			return req, "INVALID_LIMIT", errors.New("limit must be an integer from 1 to 10")
		}
	}
	req.Vector = make([]float64, len(wire.Vector))
	for i, x := range wire.Vector {
		if x == nil {
			return req, "INVALID_VECTOR", errors.New("vector elements must be numbers, not null")
		}
		req.Vector[i] = *x
	}
	literal, err := vectorLiteral(req.Vector)
	if err != nil {
		return req, "INVALID_VECTOR", err
	}
	return req, literal, nil
}

func (v *vectorAPI) ready(ctx context.Context) bool {
	if v.pool == nil || !modelNameRe.MatchString(v.modelID) {
		return false
	}
	c, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var ok bool
	// A table with the right name isn't enough: pin the public extension and
	// the actual vector(384) type/typmod, then check the application's real
	// SELECT privileges and required columns/operator without scanning rows.
	err := v.pool.QueryRow(c, `SELECT EXISTS(
	  SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
	  WHERE e.extname='vector' AND n.nspname='public') AND EXISTS(
	  SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.source_semantic_index')
	  AND a.attname='embedding' AND NOT a.attisdropped AND a.attnotnull
	  AND a.atttypid=to_regtype('public.vector') AND a.atttypmod=$1)`, vectorDimensions).Scan(&ok)
	if err != nil || !ok {
		return false
	}
	_, err = v.pool.Exec(c, `SELECT source_ref, title, source_url, sha256, model_id,
	  public.vector_norm(embedding), embedding OPERATOR(public.<=>) NULL::public.vector
	  FROM public.source_semantic_index LIMIT 0`)
	return err == nil
}

func (v *vectorAPI) status(w http.ResponseWriter, r *http.Request) {
	ready := v.enabled && v.ready(r.Context())
	writeJSON(w, 200, map[string]any{
		"enabled": v.enabled, "available": ready, "dimension": vectorDimensions,
		"model_id":                 v.modelID,
		"purpose":                  "provenance-linked metadata retrieval only; never a lunar physics engine",
		"scientifically_validated": false,
	})
}

func validVectorHit(h vectorHit) bool {
	if h.SourceRef != strings.TrimSpace(h.SourceRef) || h.SourceRef == "" || utf8.RuneCountInString(h.SourceRef) > 500 || strings.TrimSpace(h.Title) == "" || utf8.RuneCountInString(h.Title) > 500 || !vectorSHA256Re.MatchString(h.SHA256) || !finite(h.Similarity) || math.Abs(h.Similarity) > 1+1e-6 {
		return false
	}
	u, err := url.Parse(h.SourceURL)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Opaque == ""
}

func (v *vectorAPI) search(w http.ResponseWriter, r *http.Request) {
	if !v.enabled || !v.ready(r.Context()) {
		writeJSON(w, 503, map[string]string{"error": "vector metadata index unavailable or disabled", "code": "VECTOR_UNAVAILABLE"})
		return
	}
	req, literal, err := parseVectorRequest(r)
	if err != nil {
		code := http.StatusUnprocessableEntity
		switch literal {
		case "UNSUPPORTED_MEDIA_TYPE":
			code = 415
		case "REQUEST_TOO_LARGE":
			code = 413
		case "INVALID_JSON":
			code = 400
		}
		writeJSON(w, code, map[string]string{"error": err.Error(), "code": literal})
		return
	}
	if req.ModelID != v.modelID {
		writeJSON(w, 422, map[string]string{"error": "model_id does not match the configured index", "code": "MODEL_MISMATCH"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	rows, err := v.pool.Query(ctx, `SELECT source_ref, title, source_url, sha256,
	  (1 - (embedding OPERATOR(public.<=>) $1::public.vector))::float8
	  FROM public.source_semantic_index WHERE model_id=$2 AND public.vector_norm(embedding)>0
	  ORDER BY embedding OPERATOR(public.<=>) $1::public.vector, source_ref COLLATE "C" LIMIT $3`, literal, req.ModelID, req.Limit)
	if err != nil {
		writeJSON(w, 503, map[string]string{"error": "vector query unavailable", "code": "VECTOR_UNAVAILABLE"})
		return
	}
	defer rows.Close()
	hits := make([]vectorHit, 0)
	for rows.Next() {
		var h vectorHit
		if err := rows.Scan(&h.SourceRef, &h.Title, &h.SourceURL, &h.SHA256, &h.Similarity); err != nil {
			writeJSON(w, 503, map[string]string{"error": "vector row unavailable", "code": "VECTOR_UNAVAILABLE"})
			return
		}
		if !validVectorHit(h) {
			writeJSON(w, 503, map[string]string{"error": "untrusted vector source metadata", "code": "VECTOR_UNAVAILABLE"})
			return
		}
		h.Similarity = math.Max(-1, math.Min(1, h.Similarity))
		hits = append(hits, h)
	}
	if rows.Err() != nil {
		writeJSON(w, 503, map[string]string{"error": "vector query interrupted", "code": "VECTOR_UNAVAILABLE"})
		return
	}
	writeJSON(w, 200, map[string]any{"model_id": v.modelID, "dimension": vectorDimensions, "results": hits,
		"scientifically_validated": false, "limitations": []string{"Similarity concerns source metadata only; not Sun/Earth geometry, terrain or mission validity."}})
}

func registerVectorAPI(mux *http.ServeMux) {
	api := &vectorAPI{enabled: os.Getenv("BRASPACE_VECTOR_ENABLED") == "1"}
	model := os.Getenv("BRASPACE_VECTOR_MODEL_ID")
	if modelNameRe.MatchString(model) {
		api.modelID = model
	}
	if api.enabled {
		if api.modelID == "" {
			api.initError = errors.New("invalid BRASPACE_VECTOR_MODEL_ID")
		} else {
			uri := os.Getenv("VECTOR_DATABASE_URL")
			if uri == "" {
				uri = os.Getenv("DATABASE_URL")
			}
			if uri == "" {
				api.initError = errors.New("vector URL missing")
			} else {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				api.pool, api.initError = openPool(ctx, uri)
				cancel()
			}
		}
	}
	mux.HandleFunc("GET /api/vector/status", api.status)
	mux.HandleFunc("POST /api/vector/search", api.search)
}
