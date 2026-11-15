package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed db/optional-vector.sql
var optionalVectorSQL string

type vectorSeedEntry struct {
	SourceRef string `json:"source_ref"`
	Title     string `json:"title"`
	SourceURL string `json:"source_url"`
	SHA256    string `json:"sha256"`
	Text      string `json:"text"`
}

var sha256Re = regexp.MustCompile(`^[0-9a-f]{64}$`)

func embeddedVectorFS() fs.FS { f, _ := fs.Sub(embeddedSiteData, "sitedata"); return f }

func buildProvenanceSeedEntries(fsys fs.FS) ([]vectorSeedEntry, error) {
	// Every provenance row comes from data/ASSET_REGISTRY.json and
	// data/POLAR_SOURCE_EVIDENCE.json via scripts/build_vector_sources.py:
	// only entries with a recorded sha256 and an https URL. No hand-typed hashes.
	var corpus struct {
		Sources []vectorSeedEntry `json:"sources"`
	}
	raw, err := fs.ReadFile(embeddedVectorFS(), "vector_sources.json")
	if err != nil {
		return nil, fmt.Errorf("vector_sources.json: %w", err)
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		return nil, fmt.Errorf("vector_sources.json: %w", err)
	}
	entries := corpus.Sources
	for _, e := range entries {
		if !strings.HasPrefix(e.SourceURL, "https://") || !sha256Re.MatchString(e.SHA256) {
			return nil, fmt.Errorf("vector source %s lacks https URL or sha256 pin", e.SourceRef)
		}
	}

	rawCatalog, err := fs.ReadFile(fsys, "catalog.json")
	if err != nil {
		return entries, nil
	}
	var cat struct {
		Sites []struct {
			ID         string `json:"id"`
			Name       string `json:"name"`
			Kind       string `json:"kind"`
			SeriesSHA  string `json:"series_sha256"`
			Note       string `json:"note"`
			Coordinate struct {
				Source string `json:"source"`
			} `json:"coordinate"`
		} `json:"sites"`
	}
	if json.Unmarshal(rawCatalog, &cat) != nil {
		return entries, nil
	}
	for _, s := range cat.Sites {
		if len(s.SeriesSHA) != 64 {
			continue
		}
		entries = append(entries, vectorSeedEntry{
			SourceRef: "site-" + s.ID,
			Title:     fmt.Sprintf("%s — %s", s.Name, s.Coordinate.Source),
			SourceURL: "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
			SHA256:    s.SeriesSHA,
			Text:      fmt.Sprintf("%s %s %s %s %s", s.ID, s.Name, s.Kind, s.Coordinate.Source, s.Note),
		})
	}
	return entries, nil
}

func ingestVectorMetadata(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS) (map[string]any, error) {
	if pool == nil {
		return nil, errors.New("vector database pool is nil")
	}
	if _, err := pool.Exec(ctx, optionalVectorSQL); err != nil {
		return nil, fmt.Errorf("apply optional-vector.sql: %w", err)
	}
	entries, err := buildProvenanceSeedEntries(fsys)
	if err != nil {
		return nil, err
	}
	inserted := 0
	for _, e := range entries {
		vec, err := embedProvenanceText(e.Text)
		if err != nil {
			return nil, fmt.Errorf("embed %s: %w", e.SourceRef, err)
		}
		lit, err := vectorLiteral(vec)
		if err != nil {
			return nil, fmt.Errorf("literal %s: %w", e.SourceRef, err)
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO source_semantic_index(source_ref, title, source_url, sha256, model_id, embedding)
			VALUES ($1, $2, $3, $4, $5, $6::vector)
			ON CONFLICT (source_ref) DO UPDATE SET
				title = EXCLUDED.title,
				source_url = EXCLUDED.source_url,
				sha256 = EXCLUDED.sha256,
				model_id = EXCLUDED.model_id,
				embedding = EXCLUDED.embedding,
				updated_at = now()`,
			e.SourceRef, e.Title, e.SourceURL, e.SHA256, vectorLexicalModelID, lit)
		if err != nil {
			return nil, fmt.Errorf("upsert %s: %w", e.SourceRef, err)
		}
		inserted++
	}
	return map[string]any{
		"status":    "ok",
		"model_id":  vectorLexicalModelID,
		"dimension": vectorDimensions,
		"upserted":  inserted,
	}, nil
}
