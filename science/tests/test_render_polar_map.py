"""Tests for web/assets/polar-elevation-87s.{json,webp} produced by science/render_polar_map.py.

Independent check: the image pixel is mapped back to an LDEM_80S_80M pixel and
then to (lat, lon) with the LOLA DSMAP_POLAR.CAT formula written out here,
not with the renderer's own code.
"""
import json, math, pathlib, struct, unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
# The polar elevation map belongs to the archived legacy web (moved by #321/#330); it stays tested where it lives now.
ASSETS = ROOT / "archive" / "web-legacy" / "assets"
META = json.loads((ASSETS / "polar-elevation-87s.json").read_text())
R = 1737400.0

def forward(lat, lon):
    t = META["transform"]; m = t["meters_per_pixel"]; pc, pr = t["pole_pixel"]
    rho = 2 * R * math.tan(math.radians(lat + 90) / 2)
    return pc + rho * math.sin(math.radians(lon)) / m, pr - rho * math.cos(math.radians(lon)) / m

def inverse(col, row):
    t = META["transform"]; m = t["meters_per_pixel"]; pc, pr = t["pole_pixel"]
    x, y = (col - pc) * m, (pr - row) * m
    return math.degrees(2 * math.atan(math.hypot(x, y) / (2 * R))) - 90, math.degrees(math.atan2(x, y))

def lola_dem_pixel(lat, lon):
    """DSMAP_POLAR.CAT, 1-indexed I,J, N=7600, 80 m: X=(I-N/2-0.5)*80, Y=-(J-N/2-0.5)*80."""
    rho = 2 * R * math.tan(math.radians(90 + lat) / 2)
    x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    i = x / 80 + 3800.5; j = -y / 80 + 3800.5
    return i - 1, j - 1  # zero-indexed

def webp_size(path):
    b = path.read_bytes()
    assert b[:4] == b"RIFF" and b[8:12] == b"WEBP"
    kind = b[12:16]
    if kind == b"VP8 ":
        w, h = struct.unpack("<HH", b[26:30]); return w & 0x3FFF, h & 0x3FFF
    if kind == b"VP8L":
        v = int.from_bytes(b[21:25], "little"); return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
    if kind == b"VP8X":
        return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    raise AssertionError(kind)

class PolarMapTests(unittest.TestCase):
    def test_pole_is_centre(self):
        c, r = forward(-90, 0)
        self.assertAlmostEqual(c, (META["width_px"] - 1) / 2, places=9)
        self.assertAlmostEqual(r, (META["height_px"] - 1) / 2, places=9)

    def test_shackleton_rim_matches_lola_pixel(self):
        # R04 Shackleton Rim, NASA Lunar Surface Data Book ACD-50044 Rev. A App. A2,
        # transcribed in data/LUNAR_SOUTH_POLE_SITES.md: -89.7668, -171.87000.
        lat, lon = -89.7668, -171.87
        col, row = forward(lat, lon)
        i, j = lola_dem_pixel(lat, lon)
        a, b = (META["transform"]["dem_pixel_of_image_pixel"].split("= ")[1].split(",")[0].split("*col + "))
        k, off = float(a), float(b)
        self.assertAlmostEqual(k * col + off, i, delta=0.01)
        self.assertAlmostEqual(k * row + off, j, delta=0.01)
        # Expected location from geometry alone: ~7.06 km from the pole, toward 180°E (down, slightly left).
        c0 = META["transform"]["pole_pixel"][0]
        rho_px = math.hypot(col - c0, row - c0) * META["meters_per_pixel"]
        self.assertAlmostEqual(rho_px, 2 * R * math.tan(math.radians(0.2332) / 2), delta=1)
        self.assertGreater(row, c0 + 40); self.assertLess(col, c0)

    def test_round_trip(self):
        for lat, lon in [(-89.7668, -171.87), (-88.0792, 11.88866), (-87.0, 90.0), (-88.6834, -67.9321)]:
            la, lo = inverse(*forward(lat, lon))
            self.assertAlmostEqual(la, lat, places=9); self.assertAlmostEqual(lo, lon, places=9)

    def test_87s_circle_fits_and_json_matches_image(self):
        w, h = webp_size(ASSETS / META["image"])
        self.assertEqual((w, h), (META["width_px"], META["height_px"]))
        self.assertEqual((ASSETS / META["image"]).stat().st_size, META["image_bytes"])
        self.assertLessEqual(META["image_bytes"], 400 * 1024)
        col, _ = forward(-87, 90)
        self.assertLessEqual(col, w - 0.5)
        self.assertEqual(META["source"]["sha256"],
                         json.loads((ROOT / "data/manifest.json").read_text())["verification"]["sha256"])
        e = META["elevation_m"]; self.assertLess(e["min"], e["max"])

    def test_wording_is_elevation_only(self):
        text = json.dumps(META).lower()
        self.assertIn("elevation", text)
        for bad in ("illuminat", "visibility", "sunlit"):
            self.assertNotIn(bad, text.replace("not illumination, not visibility", ""))

if __name__ == "__main__":
    unittest.main()
