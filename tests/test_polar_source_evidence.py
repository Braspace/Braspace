"""Run with python -m unittest discover -s tests -p 'test_polar_source_evidence.py'."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_polar_source_evidence import CatalogError, validate_catalog, verify_uploaded_files


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.original = json.loads((ROOT / "data/POLAR_SOURCE_EVIDENCE.json").read_text(encoding="utf-8"))

    def test_valid_catalog(self) -> None:
        self.assertEqual(validate_catalog(self.original), (12, 5))

    def test_rejects_scientific_claim(self) -> None:
        catalog = copy.deepcopy(self.original)
        catalog["integration_state"] = "VALIDATED"
        with self.assertRaises(CatalogError):
            validate_catalog(catalog)

    def test_rejects_screenshot_ground_truth(self) -> None:
        catalog = copy.deepcopy(self.original)
        catalog["user_supplied_visual_references"][0]["usage"] = "training_ground_truth"
        with self.assertRaises(CatalogError):
            validate_catalog(catalog)

    def test_rejects_polar_sldem2015(self) -> None:
        catalog = copy.deepcopy(self.original)
        next(s for s in catalog["sources"] if s["id"] == "USGS-SLDEM2015")["priority"] = "P0"
        with self.assertRaises(CatalogError):
            validate_catalog(catalog)

    def test_rejects_duplicate_id(self) -> None:
        catalog = copy.deepcopy(self.original)
        catalog["sources"][0]["id"] = catalog["sources"][1]["id"]
        with self.assertRaises(CatalogError):
            validate_catalog(catalog)

    def test_rejects_non_https(self) -> None:
        catalog = copy.deepcopy(self.original)
        catalog["sources"][0]["data_url"] = "http://wrong.example/data"
        with self.assertRaises(CatalogError):
            validate_catalog(catalog)

    def test_rejects_missing_uploads(self) -> None:
        with self.assertRaises(CatalogError):
            verify_uploaded_files(self.original, ROOT)


if __name__ == "__main__":
    unittest.main()
