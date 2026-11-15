"""P0 synthetic type-boundary regression for horizon evidence; no NASA validation."""
import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_horizon_reach.py"
spec = importlib.util.spec_from_file_location("horizon_reach_checker", SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def fixture():
    def row(reach, sun, earth, dark, blackout):
        return {
            "reach_m": reach,
            "sun_center_visible_pct": sun,
            "mean_solar_disc_visible_pct": sun,
            "earth_center_visible_pct": earth,
            "longest_darkness_h": dark,
            "longest_earth_blackout_h": blackout,
        }
    return {
        "schema": "braspace.horizon-reach-study.v1",
        "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        "reaches_m": [100000, 200000],
        "sites": [{"site": "synthetic-site", "reaches": [
            row(100000, 70.0, 80.0, 12.0, 6.0),
            row(200000, 60.0, 70.0, 24.0, 8.0),
        ]}],
    }


class HorizonTypeBoundaryTests(unittest.TestCase):
    def test_preliminary_synthetic_control(self):
        self.assertEqual(checker.check(fixture()), [])

    def test_boolean_reach_rejected(self):
        data = fixture()
        data["reaches_m"][0] = True
        self.assertTrue(checker.check(data))

    def test_boolean_visibility_rejected(self):
        data = fixture()
        data["sites"][0]["reaches"][0]["sun_center_visible_pct"] = True
        self.assertTrue(checker.check(data))

    def test_boolean_blackout_rejected(self):
        data = fixture()
        data["sites"][0]["reaches"][0]["longest_darkness_h"] = False
        self.assertTrue(checker.check(data))

    def test_missing_metric_rejected(self):
        data = fixture()
        del data["sites"][0]["reaches"][1]["earth_center_visible_pct"]
        self.assertTrue(checker.check(data))

    def test_duplicate_site_rejected(self):
        data = fixture()
        data["sites"].append(copy.deepcopy(data["sites"][0]))
        self.assertTrue(checker.check(data))


if __name__ == "__main__":
    unittest.main()
