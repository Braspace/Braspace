import copy
import hashlib
import json
import pathlib
import struct
import tempfile
import unittest
from datetime import datetime, timezone
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[1]

import sys
sys.path.insert(0, str(ROOT / "scripts"))
from verify_lola import verify


def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


class DataContractTests(unittest.TestCase):
    def test_manifest_links_to_real_product_and_is_internally_consistent(self):
        manifest = load("manifest.json")
        dataset = manifest["dataset"]
        raster = dataset["raster"]
        self.assertEqual(raster["lines"] * raster["record_bytes"], raster["file_size_bytes"])
        self.assertEqual(raster["line_samples"] * raster["sample_bits"] // 8, raster["record_bytes"])
        self.assertEqual(raster["sample_type"], "LSB_INTEGER")
        self.assertEqual(raster["scaling_factor"], 0.5)
        self.assertEqual(dataset["map_projection"]["coordinate_system_name"], "MEAN EARTH/POLAR AXIS OF DE421")
        self.assertEqual(len(manifest["verification"]["sha256"]), 64)
        for key in ("image_url", "label_url", "xml_label_url"):
            url = urlparse(manifest["source"][key])
            self.assertEqual(url.scheme, "https")
            self.assertEqual(url.hostname, "pds-geosciences.wustl.edu")
        self.assertFalse(manifest["scientific_status"]["integrated_into_braspace"])

    def test_verifier_rejects_corruption_and_decodes_little_endian(self):
        manifest = copy.deepcopy(load("manifest.json"))
        raw = struct.pack("<4h", 1183, -2, 256, 0)
        manifest["dataset"]["raster"].update(lines=2, line_samples=2, record_bytes=4, file_size_bytes=8)
        manifest["verification"]["sha256"] = hashlib.sha256(raw).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "fixture.img"
            path.write_bytes(raw)
            result = verify(path, manifest)
            self.assertEqual(result["first_dn"], 1183)
            self.assertEqual(result["first_height_m"], 591.5)
            path.write_bytes(raw[:-1])
            with self.assertRaisesRegex(ValueError, "wrong file size"):
                verify(path, manifest)
            path.write_bytes(raw[:-1] + b"\x01")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify(path, manifest)

    def test_scenario_and_gallery_claim_boundaries(self):
        scenarios = load("SCENARIOS.json")
        gallery = load("LUNAR_GALLERY.json")
        manifest = load("manifest.json")
        self.assertEqual(scenarios["terrain_manifest"], "manifest.json")
        self.assertGreaterEqual(len(scenarios["sites"]), 2)
        self.assertGreaterEqual(len(scenarios["epochs_utc"]), 2)
        for site in scenarios["sites"]:
            self.assertEqual(site["dem_asset"], manifest["dataset"]["product_file"])
            self.assertLessEqual(manifest["dataset"]["coverage"]["latitude_min_deg"], site["latitude_deg"])
            self.assertLessEqual(site["latitude_deg"], manifest["dataset"]["coverage"]["latitude_max_deg"])
            self.assertFalse(site["usable_for_calculation"])
        for epoch in scenarios["epochs_utc"]:
            self.assertEqual(datetime.fromisoformat(epoch.replace("Z", "+00:00")).tzinfo, timezone.utc)
        self.assertGreaterEqual(len(gallery["cards"]), 5)
        for card in gallery["cards"]:
            self.assertTrue(card["illustrative_only"])
            self.assertTrue(card["page_url"].startswith("https://lroc.im-ldi.com/images/"))
            self.assertEqual(card["credit"], gallery["default_credit"])


if __name__ == "__main__":
    unittest.main()
