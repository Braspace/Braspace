#!/usr/bin/env python3
"""Synthetic contract tests only; these do not validate lunar science or NASA data."""
import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_horizon_reach.py"
spec = importlib.util.spec_from_file_location("check_horizon_reach", SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def fixture():
    return {
        "schema": "braspace.horizon-reach-study.v1",
        "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        "reaches_m": [100000, 200000],
        "sites": [{
            "site": "synthetic-test-site",
            "reaches": [
                {"reach_m": 100000, "sun_center_visible_pct": 80,
                 "mean_solar_disc_visible_pct": 79, "earth_center_visible_pct": 60,
                 "longest_darkness_h": 10, "longest_earth_blackout_h": 5},
                {"reach_m": 200000, "sun_center_visible_pct": 75,
                 "mean_solar_disc_visible_pct": 74, "earth_center_visible_pct": 55,
                 "longest_darkness_h": 20, "longest_earth_blackout_h": 8}
            ]
        }]
    }


class HorizonReachContractTests(unittest.TestCase):
    def test_valid_synthetic_preliminary_fixture(self):
        self.assertEqual(checker.check(fixture()), [])

    def test_verified_claim_is_rejected(self):
        data = fixture()
        data["science_status"] = "VERIFIED"
        self.assertTrue(checker.check(data))

    def test_missing_and_duplicate_reaches_are_rejected(self):
        for reaches in ([], [100000, 100000], [200000, 100000], [True, 200000]):
            with self.subTest(reaches=reaches):
                data = fixture()
                data["reaches_m"] = reaches
                self.assertTrue(checker.check(data))

    def test_increasing_visibility_is_rejected(self):
        for metric in checker.METRICS:
            with self.subTest(metric=metric):
                data = fixture()
                data["sites"][0]["reaches"][1][metric] = 99
                self.assertTrue(checker.check(data))

    def test_invalid_nonfinite_and_boolean_metrics_are_rejected(self):
        for value in (float("nan"), float("inf"), -1, 101, True, None):
            with self.subTest(value=repr(value)):
                data = fixture()
                data["sites"][0]["reaches"][0]["sun_center_visible_pct"] = value
                self.assertTrue(checker.check(data))

    def test_negative_blackout_and_duplicate_site_are_rejected(self):
        data = fixture()
        data["sites"][0]["reaches"][0]["longest_earth_blackout_h"] = -1
        self.assertTrue(checker.check(data))
        data = fixture()
        data["sites"].append(copy.deepcopy(data["sites"][0]))
        self.assertTrue(checker.check(data))

    def test_missing_reach_row_is_rejected(self):
        data = fixture()
        data["sites"][0]["reaches"].pop()
        self.assertTrue(checker.check(data))


if __name__ == "__main__":
    unittest.main()
