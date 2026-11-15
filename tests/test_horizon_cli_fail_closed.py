"""CLI boundary regression tests; synthetic fixtures, not lunar science validation.

Run: python3 -m unittest discover -s tests -p 'test_horizon_cli_fail_closed.py' -v
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_horizon_reach.py"


def fixture():
    def row(reach, visible, darkness):
        return {
            "reach_m": reach,
            "sun_center_visible_pct": visible,
            "mean_solar_disc_visible_pct": visible,
            "earth_center_visible_pct": visible,
            "longest_darkness_h": darkness,
            "longest_earth_blackout_h": darkness,
        }
    return {
        "schema": "braspace.horizon-reach-study.v1",
        "science_status": "PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        "reaches_m": [100000, 200000],
        "sites": [{"site": "SYNTHETIC_ONLY", "reaches": [
            row(100000, 40.0, 10.0), row(200000, 35.0, 12.0)
        ]}],
    }


class HorizonCliFailClosedTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, args)],
            capture_output=True, text=True, check=False, timeout=10,
        )

    def test_no_argument_returns_usage_error(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 2)
        self.assertIn("usage:", result.stderr)

    def test_missing_file_returns_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_cli(Path(directory) / "absent.json")
        self.assertEqual(result.returncode, 2)
        self.assertIn("BLOCKED:", result.stderr)

    def test_invalid_json_returns_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.json"
            path.write_text("{bad", encoding="utf-8")
            result = self.run_cli(path)
        self.assertEqual(result.returncode, 2)
        self.assertIn("BLOCKED:", result.stderr)

    def test_verified_claim_returns_blocked(self):
        data = fixture()
        data["science_status"] = "VERIFIED"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid-science.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            result = self.run_cli(path)
        self.assertEqual(result.returncode, 1)
        self.assertIn("PRELIMINARY", result.stderr)

    def test_valid_synthetic_fixture_does_not_claim_science_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.json"
            path.write_text(json.dumps(fixture()), encoding="utf-8")
            result = self.run_cli(path)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PRELIMINARY/UNVERIFIED", result.stdout)


if __name__ == "__main__":
    unittest.main()
