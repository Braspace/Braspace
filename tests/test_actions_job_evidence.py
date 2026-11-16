"""Regression tests for fail-closed GitHub Actions job evidence validation."""
import unittest

from scripts.audit_actions_job_evidence import classify


def job(job_id=1, status="completed", conclusion="success", steps=None):
    if steps is None:
        steps = [{"status": "completed", "conclusion": "success"}]
    return {"id": job_id, "status": status, "conclusion": conclusion, "steps": steps}


class ActionsJobEvidenceTests(unittest.TestCase):
    def test_complete_successful_run(self):
        self.assertEqual(classify({"total_count": 1, "jobs": [job()]}), [])

    def test_failures_are_not_passes(self):
        cases = [
            job(conclusion="failure"),
            job(status="queued", conclusion=None, steps=[]),
            job(steps=[]),
            job(steps=[{"status": "completed", "conclusion": "failure"}]),
            job(conclusion="skipped"),
        ]
        for candidate in cases:
            with self.subTest(candidate=candidate):
                self.assertTrue(classify({"total_count": 1, "jobs": [candidate]}))

    def test_missing_page_is_blocked_even_if_first_job_passes(self):
        result = classify({"total_count": 2, "jobs": [job(1)]})
        self.assertIn("INCOMPLETE_JOB_PAGINATION_1_OF_2", result)

    def test_slurped_pages_are_supported(self):
        pages = [
            {"total_count": 2, "jobs": [job(1)]},
            {"total_count": 2, "jobs": [job(2)]},
        ]
        self.assertEqual(classify(pages), [])

    def test_duplicate_ids_and_inconsistent_totals_are_invalid(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            classify({"total_count": 2, "jobs": [job(), job()]})
        with self.assertRaisesRegex(ValueError, "inconsistent"):
            classify([{"total_count": 1, "jobs": [job(1)]},
                      {"total_count": 2, "jobs": [job(2)]}])

    def test_missing_total_count_is_not_accepted(self):
        with self.assertRaisesRegex(ValueError, "total_count"):
            classify({"jobs": [job()]})
        with self.assertRaisesRegex(ValueError, "total_count"):
            classify({"total_count": True, "jobs": [job()]})


    def test_empty_job_response_fails_closed(self):
        self.assertIn("NO_JOBS", classify({"total_count": 0, "jobs": []}))

    def test_null_steps_are_not_evidence_of_execution(self):
        candidate = job()
        candidate["steps"] = None
        self.assertIn("JOB_1_NO_STEP_EVIDENCE",
                      classify({"total_count": 1, "jobs": [candidate]}))

    def test_in_progress_step_blocks_success(self):
        candidate = job(steps=[{"status": "in_progress", "conclusion": "success"}])
        self.assertIn("JOB_1_STEP_NOT_SUCCESS",
                      classify({"total_count": 1, "jobs": [candidate]}))

    def test_invalid_pagination_and_job_types_are_rejected(self):
        invalid = [
            [],
            {"total_count": -1, "jobs": []},
            {"total_count": 1, "jobs": "not-an-array"},
            {"total_count": 1, "jobs": [None]},
            {"total_count": 1, "jobs": [job(job_id=True)]},
        ]
        for payload in invalid:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    classify(payload)


if __name__ == "__main__":
    unittest.main()
