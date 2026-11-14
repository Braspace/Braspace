#!/usr/bin/env python3
"""Offline, fail-closed structural checks for the BRASPACE lunar-source inventory.

This validates provenance metadata, not the underlying scientific accuracy.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


class CatalogError(ValueError):
    """The evidence catalog violates a required data-integrity invariant."""


def _must(condition: bool, description: str) -> None:
    if not condition:
        raise CatalogError(description)


def _https(value: Any, identifier: str) -> None:
    parsed = urlparse(value) if isinstance(value, str) else None
    _must(bool(parsed and parsed.scheme == "https" and parsed.netloc), f"{identifier}: invalid HTTPS URL")


def validate_catalog(catalog: dict[str, Any]) -> tuple[int, int]:
    _must(catalog.get("schema_version") == "1.0.0", "Unsupported catalog schema")
    _must(catalog.get("integration_state") == "CATALOG_ONLY", "Catalog must not claim integration")
    _must(catalog.get("quality_rules", {}).get("no_scientific_validation_by_catalog") is True,
          "Source inventory must not imply scientific certification")
    _must(catalog.get("quality_rules", {}).get("source_images_committed_to_git") is False,
          "Reference images may not be silently embedded")
    sources = catalog.get("sources")
    visuals = catalog.get("user_supplied_visual_references")
    _must(isinstance(sources, list) and len(sources) >= 5, "Missing science sources")
    _must(isinstance(visuals, list) and len(visuals) == 5, "Expected five uploaded references")

    seen: set[str] = set()
    for source in sources:
        identifier = source.get("id")
        _must(isinstance(identifier, str) and identifier not in seen, "Duplicate/invalid source ID")
        seen.add(identifier)
        _must(isinstance(source.get("status"), str), f"{identifier}: missing status")
        _must(any(source.get(key) for key in ("source_url", "data_url")), f"{identifier}: missing URL")
        for key in ("source_url", "data_url", "label_url", "terms_url", "pds_url"):
            if key in source:
                _https(source[key], f"{identifier}.{key}")
        if "sha256" in source:
            _must(isinstance(source["sha256"], str) and len(source["sha256"]) == 64
                  and all(char in "0123456789abcdef" for char in source["sha256"]),
                  f"{identifier}: invalid source sha256")

    excluded = next((item for item in sources if item["id"] == "USGS-SLDEM2015"), None)
    _must(bool(excluded and excluded.get("status") == "coverage_mismatch"
               and excluded.get("priority") == "EXCLUDE_AT_SOUTH_POLE"),
          "SLDEM2015 must not be used as polar DEM")

    for visual in visuals:
        identifier = visual.get("id")
        _must(isinstance(identifier, str) and identifier not in seen, "Duplicate/invalid visual ID")
        seen.add(identifier)
        _must(visual.get("usage") == "reference_only", f"{identifier}: screenshot cannot be training ground truth")
        _must(visual.get("rights_status") not in (None, "approved"), f"{identifier}: rights not verified")
        _must(isinstance(visual.get("source_filename"), str), f"{identifier}: missing filename")
        _must(all(isinstance(visual.get(k), int) and visual[k] > 0 for k in ("width_px", "height_px", "bytes")),
              f"{identifier}: invalid size")
        digest = visual.get("sha256", "")
        _must(isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest),
              f"{identifier}: invalid SHA-256")
    return len(sources), len(visuals)


def verify_uploaded_files(catalog: dict[str, Any], uploads_dir: Path) -> None:
    for entry in catalog["user_supplied_visual_references"]:
        path = uploads_dir / entry["source_filename"]
        _must(path.is_file(), f"Missing original upload: {path.name}")
        _must(path.stat().st_size == entry["bytes"], f"Size mismatch: {path.name}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        _must(digest == entry["sha256"], f"SHA-256 mismatch: {path.name}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path,
                        default=Path(__file__).resolve().parents[1] / "data/POLAR_SOURCE_EVIDENCE.json")
    parser.add_argument("--verify-uploads", type=Path,
                        help="Optionally validate all five originals; no image bytes are uploaded")
    args = parser.parse_args()
    try:
        content = json.loads(args.catalog.read_text(encoding="utf-8"))
        sources, references = validate_catalog(content)
        if args.verify_uploads:
            verify_uploaded_files(content, args.verify_uploads)
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        parser.exit(status=1, message=f"POLAR_CATALOG_INVALID: {exc}\n")
    print(f"POLAR_CATALOG_OK: {sources} sources; {references} references"
          + ("; uploaded SHA-256 verified" if args.verify_uploads else "; uploads not inspected"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
