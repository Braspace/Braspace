"""Regression tests for NASA-derived source integrity and honesty."""
import copy
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from validate_derived_series import CATALOG, META, SERIES, IntegrityError, parse_strict, read_pinned, validate, validate_files, SERIES_SHA

class DerivedNAIFTests(unittest.TestCase):
    def setUp(self):
        self.series = parse_strict(SERIES.read_bytes())
        self.meta = parse_strict(META.read_bytes())
        self.catalog = parse_strict(CATALOG.read_bytes())

    def test_verified_artifact_is_still_explicitly_unverified_science(self):
        validate_files()
        self.assertEqual(read_pinned(SERIES, SERIES_SHA), self.series)

    def test_status_and_scientific_approval_cannot_be_forged(self):
        for label in ("VALIDATED", "SYNTHETIC"):
            source = copy.deepcopy(self.series)
            source["science_status"] = label
            with self.assertRaises(IntegrityError):
                validate(source, self.meta, self.catalog)
        for key in ("validated_against_independent_reference", "lola_horizon_independently_validated", "nasa_mission_certified"):
            meta = copy.deepcopy(self.meta)
            meta[key] = True
            with self.assertRaises(IntegrityError):
                validate(self.series, meta, self.catalog)

    def test_bounds_samples_frame_and_catalog_guards(self):
        changes = [
            lambda s: s["provenance"].update(frame="J2000"),
            lambda s: s["samples"][0]["sun"].update(elevation_deg=91),
            lambda s: s["samples"][0]["earth"].update(azimuth_deg=float("nan")),
            lambda s: s["samples"].pop(),
            lambda s: s["terrain_horizon"][1].update(azimuth_deg=0),
        ]
        for change in changes:
            altered = copy.deepcopy(self.series)
            change(altered)
            with self.assertRaises(IntegrityError):
                validate(altered, self.meta, self.catalog)
        cat = copy.deepcopy(self.catalog)
        next(s for s in cat["sites"] if s["id"] == "connecting-ridge")["coordinate"]["role"] = "landing_site"
        with self.assertRaises(IntegrityError):
            validate(self.series, self.meta, cat)

    def test_corrupt_json_bytes_and_duplicate_fields(self):
        with self.assertRaises(IntegrityError):
            parse_strict(b'{"science_status":"UNVERIFIED","science_status":"VALIDATED"}')
        with self.assertRaises(IntegrityError):
            parse_strict(b'{"value":NaN}')
        with self.assertRaises(IntegrityError):
            read_pinned(SERIES, "0" * 64)

if __name__ == "__main__":
    unittest.main()
