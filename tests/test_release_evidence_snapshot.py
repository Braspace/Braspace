"""Offline evidence snapshot consistency gate; NOT a live GitHub CI or release authorization."""
import json
import re
import sys
import unittest

SHA = re.compile(r"[0-9a-f]{40}\Z")

def validate(e):
    if not isinstance(e, dict):
        return False
    head = e.get("head_sha")
    if not (isinstance(head, str) and SHA.fullmatch(head) and head == e.get("checked_sha")):
        return False
    required, checks = e.get("required_checks"), e.get("checks")
    if not isinstance(required, list) or not required or not isinstance(checks, list):
        return False
    if any(not isinstance(n, str) or not n.strip() for n in required) or len(set(required)) != len(required):
        return False
    observed = {}
    for check in checks:
        if not isinstance(check, dict) or not isinstance(check.get("name"), str) or check["name"] in observed:
            return False
        observed[check["name"]] = check
    if any(name not in observed or observed[name].get("conclusion") != "success"
           or observed[name].get("head_sha") != head\n           or observed[name].get("status") != "completed" for name in required):
        return False
    return (e.get("review_approved") is True and
            e.get("science_status") in ("PRELIMINARY", "UNVERIFIED") and
            e.get("scientific_disclaimer") is True)

class Tests(unittest.TestCase):
    def setUp(self):
        sha = "a" * 40
        self.e = dict(head_sha=sha, checked_sha=sha, required_checks=["ci"],
                      checks=[dict(name="ci", head_sha=sha, conclusion="success", status="completed")],
                      review_approved=True, science_status="PRELIMINARY", scientific_disclaimer=True)
    def test_consistent(self): self.assertTrue(validate(self.e))
    def test_wrong_sha(self):
        self.e["checked_sha"] = "b" * 40
        self.assertFalse(validate(self.e))
    def test_missing_check(self):
        self.e["checks"] = []
        self.assertFalse(validate(self.e))
    def test_duplicate_check(self):
        self.e["checks"] *= 2
        self.assertFalse(validate(self.e))
    def test_pending(self):
        self.e["checks"][0]["conclusion"] = None
        self.assertFalse(validate(self.e))
    def test_success_without_execution_status(self):\n        self.e["checks"][0].pop("status")\n        self.assertFalse(validate(self.e))\n    def test_success_but_queued(self):\n        self.e["checks"][0]["status"] = "queued"\n        self.assertFalse(validate(self.e))\n    def test_success_but_in_progress(self):\n        self.e["checks"][0]["status"] = "in_progress"\n        self.assertFalse(validate(self.e))\n    def test_review_unknown(self):
        self.e["review_approved"] = None
        self.assertFalse(validate(self.e))
    def test_disclaimer_missing(self):
        self.e["scientific_disclaimer"] = False
        self.assertFalse(validate(self.e))
    def test_unverified(self):
        self.e["science_status"] = "UNVERIFIED"
        self.assertTrue(validate(self.e))
    def test_no_unearned_validated(self):
        self.e["science_status"] = "VALIDATED"
        self.assertFalse(validate(self.e))
    def test_no_required_checks(self):
        self.e["required_checks"] = []
        self.assertFalse(validate(self.e))

if __name__ == "__main__":
    if len(sys.argv) == 1:
        unittest.main()
    elif len(sys.argv) == 2:
        try:
            with open(sys.argv[1], encoding="utf-8") as f:
                evidence = json.load(f)
        except (OSError, ValueError) as exc:
            print(f"INVALID_INPUT: {exc}", file=sys.stderr)
            sys.exit(2)
        ok = validate(evidence)
        print("SNAPSHOT_CONSISTENT (not release authorization)" if ok else "BLOCKED")
        sys.exit(0 if ok else 1)
    else:
        sys.exit(2)
