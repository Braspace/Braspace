package main

import (
	"encoding/json"
	"strings"
)

// Git blob identity of the unchanged lexical encoder in vector_embed.go.
// This is a versioned deterministic text projection, not a trained AI model.
const vectorLexicalRevision = "e7179dec2e64155a9ffce6ca609fea43e6ac6056"

func lexicalVectorManifest(registry *layerCatalog, registrySHA string) ([]byte, error) {
	m := vectorIngestManifest{Schema: "braspace.vector-ingest.v1", ModelID: vectorLexicalModelID,
		ModelRevision: vectorLexicalRevision, ModelLicense: "MIT", RegistrySHA256: registrySHA}
	for _, l := range registry.Layers {
		text := strings.Join([]string{l.Title, l.Kind, l.ScientificRole, l.Attribution, l.Note}, "\n")
		vector, err := embedProvenanceText(text)
		if err != nil {
			return nil, err
		}
		components := make([]*float64, len(vector))
		for i := range vector {
			components[i] = &vector[i]
		}
		m.Entries = append(m.Entries, vectorIngestEntry{LayerID: l.ID, SourceSHA256: l.SHA256, Embedding: components})
	}
	return json.Marshal(m)
}
