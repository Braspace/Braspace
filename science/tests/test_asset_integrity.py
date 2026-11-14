"""Offline integrity gate for Heloísa's preliminary MoonProof Polar Lab assets.

This verifies exact derived binary bytes, site-to-summary consistency and
scientific disclaimers. It DOES NOT independently validate NASA PDS geometry.
"""
import hashlib
import json
import math
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "data"
SCIENCE = ROOT / "science" / "results"

def load(path):
    return json.loads(path.read_text(encoding="utf8"))

def assert_derived_file(test, name, metadata, expected_length=None):
    data = name.read_bytes()
    test.assertEqual(len(data), metadata["bytes"] if "bytes" in metadata else expected_length, str(name))
    test.assertEqual(hashlib.sha256(data).hexdigest(), metadata["sha256"], str(name))
    return data

class PolarAssetIntegrity(unittest.TestCase):
    def test_region_and_landing_tiles_are_checksums_of_derived_bytes(self):
        region = load(DATA / "region" / "south_pole_400m.json")
        self.assertEqual(region["native_resolution_m"], 80)
        self.assertEqual(region["spacing_m"], 400)
        assert_derived_file(self, DATA / "region" / "south_pole_400m.bin", region, region["nx"] * region["ny"] * 2)
        for site in load(DATA / "sites.json")["sites"]:
            name = site["id"]
            meta = load(DATA / "terrain" / f"{name}_local.json")
            assert_derived_file(self, DATA / "terrain" / f"{name}_local.bin", meta, meta["nx"] * meta["ny"] * 2)
            self.assertEqual(meta["source_sha256"], region["source_sha256"])
            self.assertEqual(meta["native_resolution_m"], 80)

    def test_five_site_binary_series_match_pinned_hashes(self):
        index = load(DATA / "sites.json")
        self.assertEqual(index["science_status"], "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")
        self.assertEqual(index["series_window"]["hours"], 35064)
        self.assertEqual(len(index["sites"]), 5)
        for site in index["sites"]:
            meta = load(DATA / f"sites/{site['id']}.json")
            self.assertEqual(meta["science_status"], "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")
            info = meta["series"]
            self.assertEqual(info["count"], 35064)
            self.assertEqual(info["step_seconds"], 3600)
            raw = (DATA / f"sites/{site['id']}.bin").read_bytes()
            self.assertEqual(len(raw), info["count"] * 8, site["id"])
            self.assertEqual(hashlib.sha256(raw).hexdigest(), info["sha256"], site["id"])

    def test_preliminary_metrics_agree_with_summary_and_disclose_pgda_discrepancies(self):
        idx = load(DATA / "sites.json")
        summary = load(SCIENCE / "summary.json")
        pgda = load(SCIENCE / "validation_pgda.json")
        self.assertEqual(summary["science_status"], "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")
        by_id = {x["id"]: x for x in summary["sites"]}
        self.assertEqual(set(by_id), {x["id"] for x in idx["sites"]})
        for site in idx["sites"]:
            for k, value in site["metrics"].items():
                reference = by_id[site["id"]][k]
                self.assertTrue(math.isfinite(reference))
                self.assertAlmostEqual(value, reference, places=2, msg=f"{site['id']}/{k}")
        self.assertEqual(len(pgda["results"]), 5)
        gaps = [x for x in pgda["results"] if abs(x["diff_sun_pp"]) > 5]
        # This is a known, explicitly UNRESOLVED scientific discrepancy,
        # not an allowable validation tolerance or proof of a bad DEM.
        self.assertTrue(gaps, "reviewed discrepancy evidence unexpectedly removed")
        self.assertIn("peak-near-shackleton", [x["site"] for x in gaps])
        self.assertEqual(idx["science_status"], "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")

    def test_horizons_comparison_is_a_record_not_authoritative_certification(self):
        h = load(SCIENCE / "validation_horizons.json")
        sites = h["results"]
        self.assertEqual(len(sites), 5)
        for site in sites:
            self.assertEqual(len(site["epochs"]), 12)
            for c in site["comparisons"]:
                self.assertIn(c["body"], ("earth", "sun"))
                self.assertEqual(c["n"], 12)
                self.assertTrue(math.isfinite(c["max_abs_az_diff_deg_cos_el"]))
                self.assertTrue(math.isfinite(c["max_abs_el_diff_deg"]))
        # Zero residuals across every site are not in themselves proof of
        # independent validation. Require a reproducible Horizons transcript.
        self.assertEqual(load(DATA / "sites.json")["science_status"],
                         "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED")

if __name__=="__main__":
    unittest.main()
