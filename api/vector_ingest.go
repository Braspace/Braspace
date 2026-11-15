// Operator-only ingestion for reviewed layer source metadata. No HTTP write
// endpoint, external model call, scientific claim, or fabricated embedding.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxVectorManifestBytes = 4 << 20

type vectorIngestEntry struct {
	LayerID      string     `json:"layer_id"`
	SourceSHA256 string     `json:"source_sha256"`
	Embedding    []*float64 `json:"embedding"`
}

type vectorIngestManifest struct {
	Schema         string              `json:"schema"`
	ModelID        string              `json:"model_id"`
	ModelRevision  string              `json:"model_revision"`
	ModelLicense   string              `json:"model_license"`
	RegistrySHA256 string              `json:"source_registry_sha256"`
	Entries        []vectorIngestEntry `json:"entries"`
}

type vectorIngestRow struct {
	Ref, Title, URL, SHA256, Literal string
}

type vectorIngestReport struct {
	ModelID                 string `json:"model_id"`
	ModelRevision           string `json:"model_revision"`
	ModelLicense            string `json:"model_license"`
	RegistrySHA256          string `json:"source_registry_sha256"`
	ManifestSHA256          string `json:"manifest_sha256"`
	Entries                 int    `json:"entries"`
	Applied                 bool   `json:"applied"`
	ScientificallyValidated bool   `json:"scientifically_validated"`
}

func vectorLayerRegistry() (*layerCatalog, string, error) {
	raw, err := embeddedSiteData.ReadFile("sitedata/layers.json")
	if err != nil {
		return nil, "", err
	}
	catalogRaw, err := embeddedSiteData.ReadFile("sitedata/catalog.json")
	if err != nil {
		return nil, "", err
	}
	var cat siteCatalog
	if err := decodeStrict(catalogRaw, &cat); err != nil {
		return nil, "", err
	}
	st, err := buildStore(cat, func(*site) (*siteSeries, error) { return nil, nil })
	if err != nil {
		return nil, "", err
	}
	registry, err := loadLayers(raw, st)
	if err != nil {
		return nil, "", err
	}
	return registry, sha256Hex(raw), nil
}

// validateVectorManifest pins the source registry and all source hashes, and
// derives the indexed metadata from that registry. Model provenance remains an
// operator assertion: a validated manifest is NOT proof of model training or
// scientific validity. A revision must be encoded in the model ID itself.
func validateVectorManifest(raw []byte, registry *layerCatalog, registrySHA string) (vectorIngestReport, []vectorIngestRow, error) {
	var m vectorIngestManifest
	if len(raw) == 0 || len(raw) > maxVectorManifestBytes {
		return vectorIngestReport{}, nil, errors.New("vector manifest exceeds bound or is empty")
	}
	if err := decodeStrict(raw, &m); err != nil {
		return vectorIngestReport{}, nil, fmt.Errorf("invalid vector manifest: %w", err)
	}
	if m.Schema != "braspace.vector-ingest.v1" || !modelNameRe.MatchString(m.ModelID) ||
		!sha256Pattern.MatchString(m.RegistrySHA256) || m.RegistrySHA256 != registrySHA ||
		len(m.ModelRevision) < 7 || len(m.ModelRevision) > 64 || (!strings.HasSuffix(m.ModelID, ":"+m.ModelRevision) && !(m.ModelID == vectorLexicalModelID && m.ModelRevision == vectorLexicalRevision && m.ModelLicense == "MIT")) ||
		strings.ContainsAny(m.ModelRevision, "/ :") || strings.TrimSpace(m.ModelLicense) != m.ModelLicense || m.ModelLicense == "" || len(m.ModelLicense) > 100 {
		return vectorIngestReport{}, nil, errors.New("schema, versioned model ID, revision, license and exact registry SHA are required")
	}
	if len(m.Entries) < 1 || len(m.Entries) > len(registry.Layers) {
		return vectorIngestReport{}, nil, errors.New("invalid number of registered layer entries")
	}
	layers := make(map[string]layer, len(registry.Layers))
	for _, l := range registry.Layers {
		layers[l.ID] = l
	}
	seen := map[string]bool{}
	rows := make([]vectorIngestRow, 0, len(m.Entries))
	for _, entry := range m.Entries {
		l, ok := layers[entry.LayerID]
		if !ok || seen[entry.LayerID] || l.RegistryRef == "" || l.SHA256 != entry.SourceSHA256 {
			return vectorIngestReport{}, nil, fmt.Errorf("unknown, duplicate, or hash-mismatched layer %q", entry.LayerID)
		}
		seen[entry.LayerID] = true
		numbers := make([]float64, len(entry.Embedding))
		for i, x := range entry.Embedding {
			if x == nil {
				return vectorIngestReport{}, nil, fmt.Errorf("layer %q has null embedding component", entry.LayerID)
			}
			numbers[i] = *x
		}
		literal, err := vectorLiteral(numbers)
		if err != nil {
			return vectorIngestReport{}, nil, fmt.Errorf("layer %q: %w", entry.LayerID, err)
		}
		rows = append(rows, vectorIngestRow{l.RegistryRef, l.Title, l.SourceURL, l.SHA256, literal})
	}
	return vectorIngestReport{ModelID: m.ModelID, ModelRevision: m.ModelRevision, ModelLicense: m.ModelLicense,
		RegistrySHA256: m.RegistrySHA256, ManifestSHA256: sha256Hex(raw), Entries: len(rows)}, rows, nil
}

func applyVectorManifest(ctx context.Context, pool *pgxpool.Pool, report vectorIngestReport, rows []vectorIngestRow) error {
	if report.Entries != len(rows) || len(rows) == 0 {
		return errors.New("invalid prepared vector manifest")
	}
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO public.source_semantic_ingest_runs(manifest_sha256,source_registry_sha256,model_id,model_revision,model_license,entry_count)
		VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(manifest_sha256) DO NOTHING`,
			report.ManifestSHA256, report.RegistrySHA256, report.ModelID, report.ModelRevision, report.ModelLicense, report.Entries); err != nil {
			return fmt.Errorf("vector import manifest audit record: %w", err)
		}
		// Replaying the same model + source is idempotent; other pinned models and
		// unrelated source metadata stay intact. No delete or extension install.
		for _, r := range rows {
			if _, err := tx.Exec(ctx, `INSERT INTO public.source_semantic_index(source_ref,title,source_url,sha256,model_id,embedding,ingest_manifest_sha256)
			VALUES($1,$2,$3,$4,$5,$6::public.vector,$7)
   ON CONFLICT(source_ref,model_id) DO UPDATE SET title=EXCLUDED.title, source_url=EXCLUDED.source_url,
			sha256=EXCLUDED.sha256,embedding=EXCLUDED.embedding,ingest_manifest_sha256=EXCLUDED.ingest_manifest_sha256,updated_at=now()`,
				r.Ref, r.Title, r.URL, r.SHA256, report.ModelID, r.Literal, report.ManifestSHA256); err != nil {
				return fmt.Errorf("vector import failed for registered source %q: %w", r.Ref, err)
			}
		}
		return nil
	})
}

func runVectorIngestCLI(args []string) int {
	f := flag.NewFlagSet("vector-ingest", flag.ContinueOnError)
	input := f.String("input", "", "reviewed layer embedding JSON manifest")
	lexical := f.Bool("lexical", false, "generate the pinned lexical projection for the exact embedded registry")
	apply := f.Bool("apply", false, "explicitly write validated data to optional metadata database")
	if err := f.Parse(args); err != nil || (*input == "") == !*lexical || f.NArg() != 0 {
		// Loud, not silent: deployments written for the older seed command
		// (`vector-ingest` with no flags) must see what changed.
		fmt.Fprintln(os.Stderr, "usage: api vector-ingest (-lexical | -input FILE) [-apply]; -apply also requires VECTOR_DATABASE_URL and BRASPACE_VECTOR_MODEL_ID")
		return 2
	}
	catalog, sha, err := vectorLayerRegistry()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	var raw []byte
	if *lexical {
		raw, err = lexicalVectorManifest(catalog, sha)
	} else {
		var file *os.File
		file, err = os.Open(*input)
		if err == nil {
			defer file.Close()
			raw, err = io.ReadAll(io.LimitReader(file, maxVectorManifestBytes+1))
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	report, rows, err := validateVectorManifest(raw, catalog, sha)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *apply {
		// Require exact model pin and an explicitly supplied vector DB connection;
		// never implicitly write to the mission DB from an operator command.
		if os.Getenv("BRASPACE_VECTOR_MODEL_ID") != report.ModelID || os.Getenv("VECTOR_DATABASE_URL") == "" {
			fmt.Fprintln(os.Stderr, "VECTOR_DATABASE_URL and matching BRASPACE_VECTOR_MODEL_ID are required to apply")
			return 2
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		db, err := openPool(ctx, os.Getenv("VECTOR_DATABASE_URL"))
		if err != nil {
			fmt.Fprintln(os.Stderr, "vector database unavailable")
			return 1
		}
		defer db.Close()
		if err := applyVectorManifest(ctx, db, report, rows); err != nil {
			fmt.Fprintln(os.Stderr, "vector import failed; verify optional schema and model metadata")
			return 1
		}
		report.Applied = true
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(report); err != nil {
		return 1
	}
	return 0
}
