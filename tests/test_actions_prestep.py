"""Regression tests for the diagnostic-only GitHub Actions pre-step classifier.

Run: python3 -m unittest discover -s tests -p 'test_actions_prestep.py' -v
No GitHub Actions execution or release approval is implied by passing these tests.
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "check_actions_prestep.py"
SPEC = importlib.util.spec_from_file_location("check_actions_prestep", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PrestepClassifierTests(unittest.TestCase):
    def test_failed_null_steps_is_anomaly(self):
        self.assertEqual(MODULE.inspect({"jobs": [{"id": 101, "conclusion": "failure", "steps": None}]}), [101])

    def test_failed_empty_steps_is_anomaly(self):
        self.assertEqual(MODULE.inspect({"jobs": [{"id": 102, "conclusion": "timed_out", "steps": []}]}), [102])

    def test_cancelled_missing_steps_is_anomaly(self):
        self.assertEqual(MODULE.inspect({"jobs": [{"id": 103, "conclusion": "cancelled"}]}), [103])

    def test_failed_with_steps_is_not_prestep(self):
        self.assertEqual(MODULE.inspect({"jobs": [{"id": 104, "conclusion": "failure", "steps": [{"name": "test"}]}]}), [])

    def test_success_without_steps_does_not_claim_ci_green(self):
        self.assertEqual(MODULE.inspect({"jobs": [{"id": 105, "conclusion": "success", "steps": None}]}), [])

    def test_invalid_payloads_are_rejected(self):
        for payload in (None, [], {}, {"jobs": None}, {"jobs": [None]},
                        {"jobs": [{"id": True}]}, {"jobs": [{"id": "123"}]},
                        {"jobs": [{"id": 1, "steps": "none"}]}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                MODULE.inspect(payload)

    def test_cli_anomaly_exit_one(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "jobs.json"
            path.write_text(json.dumps({"jobs": [{"id": 106, "conclusion": "failure", "steps": None}]}), encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertIn("PRESTEP_ANOMALY jobs=106", result.stdout)

    def test_cli_invalid_json_exit_two(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "jobs.json"
            path.write_text("{invalid", encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn("INVALID:", result.stderr)

    def test_cli_non_anomaly_never_certifies_ci(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "jobs.json"
            path.write_text(json.dumps({"jobs": [{"id": 107, "conclusion": "success", "steps": [{"name": "setup"}]}]}), encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0)
            self.assertIn("CI success NOT established", result.stdout)


if __name__ == "__main__":
    unittest.main()
