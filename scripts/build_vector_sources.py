#!/usr/bin/env python3
"""Build api/sitedata/vector_sources.json: the provenance corpus indexed by pgvector.
Only entries with an https URL and a sha256 pin enter (same rule the DB CHECK enforces)."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out, seen = [], set()
def add(ref, title, url, sha, text):
    if not (isinstance(url, str) and url.startswith("https://") and isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{64}", sha)) or ref in seen: return
    seen.add(ref); out.append({"source_ref": ref, "title": title[:500], "source_url": url, "sha256": sha, "text": " ".join(t for t in text if isinstance(t, str))})
for a in json.loads((root/"data/ASSET_REGISTRY.json").read_text())["assets"]:
    add(a["asset_id"], a.get("file_id") or a["asset_id"], next((u for u in (a.get("file_url"), a.get("source_page")) if isinstance(u, str) and u.startswith("https://")), None), a.get("sha256"),
        [a.get("asset_id"), a.get("category"), a.get("file_url"), a.get("author_credit"), a.get("scientific_role"), a.get("review_note"), a.get("format")])
for s in json.loads((root/"data/POLAR_SOURCE_EVIDENCE.json").read_text())["sources"]:
    add(s["id"], s.get("name") or s["id"], s.get("data_url"), s.get("sha256"),
        [s.get("id"), s.get("name"), s.get("agency"), s.get("category"), s.get("coverage"), s.get("native_resolution"), s.get("processing_role"), s.get("attribution")])
out.sort(key=lambda x: x["source_ref"])
(root/"api/sitedata/vector_sources.json").write_text(json.dumps({"schema_version": 1, "sources": out}, indent=1, ensure_ascii=False) + "\n")
print(len(out), "sources")
