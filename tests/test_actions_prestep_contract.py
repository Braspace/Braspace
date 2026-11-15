"""Regression contracts for the Actions pre-step diagnostic (not a CI certification)."""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "check_actions_prestep.py"
spec = importlib.util.spec_from_file_location("check_actions_prestep", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrestepContractTests(unittest.TestCase):
    def test_failure_without_steps_is_anomaly(self):
        self.assertEqual(module.inspect({"jobs": [{"id": 101, "conclusion": "failure", "steps": None}]}), [101])

    def test_empty_steps_are_anomaly(self):
        self.assertEqual(module.inspect({"jobs": [{"id": 102, "conclusion": "timed_out", "steps": []}]}), [102])

    def test_cancelled_without_steps_is_anomaly(self):
        self.assertEqual(module.inspect({"jobs": [{"id": 103, "conclusion": "cancelled"}]}), [103])

    def test_failure_with_steps_not_classified_as_prestep(self):
        self.assertEqual(module.inspect({"jobs": [{"id": 104, "conclusion": "failure", "steps": [{"name": "test"}]}]}), [])

    def test_skipped_and_success_not_classified(self):
        self.assertEqual(module.inspect({"jobs": [
            {"id": 105, "conclusion": "skipped", "steps": None},
            {"id": 106, "conclusion": "success", "steps": []}
        ]}), [])

    def test_invalid_payload_fails_closed(self):
        for payload in (None, {}, {"jobs": None}, {"jobs": {}}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                module.inspect(payload)

    def test_invalid_ids_and_steps_fail_closed(self):
        for job in ({"id": True}, {"id": "1"}, {"id": 1, "steps": {}}, "bad"):
            with self.subTest(job=job), self.assertRaises(ValueError):
                module.inspect({"jobs": [job]})

    def test_multiple_anomalies_preserve_job_ids(self):
        self.assertEqual(module.inspect({"jobs": [
            {"id": 107, "conclusion": "failure"},
            {"id": 108, "conclusion": "success"},
            {"id": 109, "conclusion": "timed_out", "steps": None}
        ]}), [107, 109])

    def test_empty_jobs_never_proves_ci_success(self):
        self.assertEqual(module.inspect({"jobs": []}), [])


if __name__ == "__main__":
    unittest.main()
