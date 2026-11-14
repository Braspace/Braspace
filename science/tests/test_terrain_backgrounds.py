"""Tests for web/moonproof/assets/terrain-*.{webp,json} (science/render_terrain_backgrounds.py).

Stdlib only. Checks: source SHA equals data/manifest.json, size <= 600 kB,
WebP header matches the declared dimensions, metadata labels the synthetic
light, the registry pins the exact bytes, and nothing claims VALIDATED.
"""
import hashlib, json, math, pathlib, struct, unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
ASSETS = ROOT / "web" / "moonproof" / "assets"
MANIFEST = json.loads((ROOT / "data" / "manifest.json").read_text())
REGISTRY = {a["asset_id"]: a for a in json.loads((ROOT / "data" / "ASSET_REGISTRY.json").read_text())["assets"]}
STEMS = {"terrain-shade-87s": (-87.0, 160.0), "terrain-shade-84s": (-84.0, 400.0), "terrain-altitude-87s": (-87.0, 160.0)}
R = 1737400.0


def webp_size(b):
    assert b[:4] == b"RIFF" and b[8:12] == b"WEBP"
    kind = b[12:16]
    if kind == b"VP8 ":
        w, h = struct.unpack("<HH", b[26:30]); return w & 0x3FFF, h & 0x3FFF
    if kind == b"VP8L":
        v = int.from_bytes(b[21:25], "little"); return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
    if kind == b"VP8X":
        return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    raise AssertionError(kind)


class TerrainBackgroundTests(unittest.TestCase):
    def test_each_product(self):
        for stem, (lat, mpp) in STEMS.items():
            with self.subTest(stem=stem):
                b = (ASSETS / f"{stem}.webp").read_bytes()
                m = json.loads((ASSETS / f"{stem}.json").read_text())
                self.assertLessEqual(len(b), 600 * 1000)
                self.assertEqual(m["image_bytes"], len(b))
                self.assertEqual(webp_size(b), (m["width_px"], m["height_px"]))
                self.assertEqual(m["source"]["sha256"], MANIFEST["verification"]["sha256"])
                self.assertEqual(m["source"]["product"], "LDEM_80S_80M.IMG")
                self.assertEqual(m["meters_per_pixel"], mpp)
                self.assertEqual(m["latitude_edge_deg"], lat)
                self.assertIn("shading light is synthetic, not a real illumination state", m["shading"]["note"])
                for k in ("azimuth_deg", "altitude_deg", "z_factor"):
                    self.assertIn(k, m["shading"])
                self.assertEqual(m["data_status"], "PRELIMINARY")
                self.assertFalse(m["ai_generated"])
                self.assertEqual(m["projection"]["center_latitude_deg"], -90.0)
                # the latitude circle fits inside the square image
                rho = 2 * R * math.tan(math.radians(lat + 90) / 2) / mpp
                self.assertLessEqual(rho, (m["width_px"] - 1) / 2)
                pc, pr = m["transform"]["pole_pixel"]
                self.assertAlmostEqual(pc, (m["width_px"] - 1) / 2, places=9)
                self.assertNotIn("VALIDATED", json.dumps(m).upper().replace("NOT VALIDATED", ""))
                reg = REGISTRY[f"braspace-{stem}"]
                self.assertEqual(reg["sha256"], hashlib.sha256(b).hexdigest())
                self.assertEqual(reg["bytes"], len(b))

    def test_license_matrix_lists_products(self):
        s = (ROOT / "docs" / "ASSET_LICENSE_MATRIX.md").read_text()
        for stem in STEMS:
            self.assertIn(stem, s)


if __name__ == "__main__":
    unittest.main()
