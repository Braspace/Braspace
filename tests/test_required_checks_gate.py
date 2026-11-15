"""Regression contracts for the exact-SHA required-check gate (synthetic inputs only)."""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "verify_required_checks.py"
spec = importlib.util.spec_from_file_location("verify_required_checks", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
SHA = "a" * 40
OTHER = "b" * 40


def check(name="required", sha=SHA, status="completed", conclusion="success"):
    return {"name": name, "head_sha": sha, "status": status, "conclusion": conclusion}


class RequiredChecksGateTests(unittest.TestCase):
    def assertBlocked(self, payload, sha=SHA, required=None):
        ok, reasons = gate.evaluate(payload, sha, ["required"] if required is None else required)
        self.assertFalse(ok)
        self.assertTrue(reasons)

    def test_exact_sha_success(self):
        self.assertEqual(gate.evaluate({"check_runs": [check()]}, SHA, ["required"]), (True, []))

    def test_missing_array(self):
        self.assertBlocked({})

    def test_missing_required_check(self):
        self.assertBlocked({"check_runs": []})

    def test_duplicate_check_name(self):
        self.assertBlocked({"check_runs": [check(), check()]})

    def test_stale_sha(self):
        self.assertBlocked({"check_runs": [check(sha=OTHER)]})

    def test_pending_is_not_success(self):
        self.assertBlocked({"check_runs": [check(status="in_progress", conclusion=None)]})

    def test_skipped_is_not_success(self):
        self.assertBlocked({"check_runs": [check(conclusion="skipped")]})

    def test_failure_is_not_success(self):
        self.assertBlocked({"check_runs": [check(conclusion="failure")]})

    def test_missing_expected_sha(self):
        self.assertBlocked({"check_runs": [check()]}, sha="")

    def test_empty_required_list(self):
        self.assertBlocked({"check_runs": [check()]}, required=[])

    def test_multiple_required_all_must_pass(self):
        self.assertBlocked({"check_runs": [check(), check(name="second", conclusion="failure")]},
                           required=["required", "second"])


if __name__ == "__main__":
    unittest.main()
