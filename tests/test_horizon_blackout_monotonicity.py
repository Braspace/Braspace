"""Synthetic regression tests for the stacked horizon-reach blackout gate.

No lunar science is independently validated by these fixtures.
Run: python3 -m unittest discover -s tests -p 'test_horizon_blackout_monotonicity.py' -v
"""
import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_horizon_reach.py"
SPEC = importlib.util.spec_from_file_location("check_horizon_reach", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture():
    def row(reach, darkness, earth):
        return {
            "reach_m": reach,
            "sun_center_visible_pct": 40.0 if reach == 100000 else 35.0,
            "mean_solar_disc_visible_pct": 41.0 if reach == 100000 else 36.0,
            "earth_center_visible_pct": 60.0 if reach == 100000 else 55.0,
            "longest_darkness_h": darkness,
            "longest_earth_blackout_h": earth,
        }
    return {
        "schema": "braspace.horizon-reach-study.v1",
        "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        "reaches_m": [100000, 200000],
        "sites": [{"site": "SYNTHETIC_SITE", "reaches": [
            row(100000, 670.0, 20.0), row(200000, 3389.0, 30.0)
        ]}],
    }


class BlackoutMonotonicityTests(unittest.TestCase):
    def test_valid_synthetic_increasing_blackout(self):
        self.assertEqual(MODULE.check(fixture()), [])

    def test_solar_darkness_must_not_decrease(self):
        data = fixture()
        data["sites"][0]["reaches"][1]["longest_darkness_h"] = 669.0
        self.assertTrue(any("longest_darkness_h decreases" in e for e in MODULE.check(data)))

    def test_earth_blackout_must_not_decrease(self):
        data = fixture()
        data["sites"][0]["reaches"][1]["longest_earth_blackout_h"] = 19.0
        self.assertTrue(any("longest_earth_blackout_h decreases" in e for e in MODULE.check(data)))

    def test_rounding_tolerance_is_allowed(self):
        data = fixture()
        data["sites"][0]["reaches"][1]["longest_earth_blackout_h"] = 19.995
        self.assertEqual(MODULE.check(data), [])

    def test_nonfinite_blackout_rejected(self):
        data = fixture()
        data["sites"][0]["reaches"][1]["longest_darkness_h"] = float("nan")
        self.assertTrue(any("invalid longest_darkness_h" in e for e in MODULE.check(data)))

    def test_verified_status_rejected(self):
        data = fixture()
        data["science_status"] = "VERIFIED"
        self.assertTrue(any("PRELIMINARY" in e for e in MODULE.check(data)))


if __name__ == "__main__":
    unittest.main()
