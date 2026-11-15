#!/usr/bin/env python3
"""Negative contract tests for the structural release-evidence gate.

Run: python3 -m unittest discover -s tests -p 'test_release_evidence_gate.py' -v
These tests do not authenticate GitHub CI, human reviews, or NASA submission.
"""
import copy
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "release_evidence_gate", ROOT / "scripts" / "validate_release_evidence.py"
)
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


def structurally_complete_record():
    # Deliberately synthetic: never use this fixture as release evidence.
    return {
        "main_sha": "a" * 40,
        "candidate_sha": "b" * 40,
        "ci_run_url": "https://github.com/Braspace/Braspace/actions/runs/123",
        "ci_conclusion": "success",
        "required_checks": {"example-only": "success"},
        "human_approval": True,
        "science_status": "VERIFIED",
        "public_demo_verified": True,
        "nasa_submission_authorized": True,
    }


class ReleaseEvidenceGateTests(unittest.TestCase):
    def setUp(self):
        self.record = structurally_complete_record()

    def test_structural_positive_is_not_external_verification(self):
        self.assertEqual(gate.validate(self.record), [])

    def test_missing_fields_block(self):
        for key in gate.REQUIRED:
            with self.subTest(key=key):
                record = copy.deepcopy(self.record)
                del record[key]
                self.assertTrue(gate.validate(record))

    def test_unknown_or_preliminary_science_blocks(self):
        for status in ("PRELIMINARY", "UNVERIFIED", "UNKNOWN", None):
            with self.subTest(status=status):
                record = copy.deepcopy(self.record)
                record["science_status"] = status
                self.assertTrue(gate.validate(record))

    def test_ci_failure_and_missing_checks_block(self):
        for conclusion in ("failure", "cancelled", "skipped", None):
            with self.subTest(conclusion=conclusion):
                record = copy.deepcopy(self.record)
                record["ci_conclusion"] = conclusion
                self.assertTrue(gate.validate(record))
        for checks in ({}, {"example-only": "failure"}, None):
            with self.subTest(checks=checks):
                record = copy.deepcopy(self.record)
                record["required_checks"] = checks
                self.assertTrue(gate.validate(record))

    def test_approval_demo_and_submission_require_literal_true(self):
        for key in ("human_approval", "public_demo_verified", "nasa_submission_authorized"):
            for value in (False, "true", 1, None):
                with self.subTest(key=key, value=value):
                    record = copy.deepcopy(self.record)
                    record[key] = value
                    self.assertTrue(gate.validate(record))

    def test_invalid_sha_and_url_block(self):
        for key in ("main_sha", "candidate_sha"):
            record = copy.deepcopy(self.record)
            record[key] = "A" * 40
            self.assertTrue(gate.validate(record))
        record = copy.deepcopy(self.record)
        record["ci_run_url"] = "https://example.org/actions/runs/123"
        self.assertTrue(gate.validate(record))

    def test_non_object_input_blocks(self):
        for value in (None, [], "success", 1):
            with self.subTest(value=value):
                self.assertTrue(gate.validate(value))


if __name__ == "__main__":
    unittest.main()
