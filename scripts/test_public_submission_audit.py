"""Offline tests for anonymous public NASA submission link verification."""
from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path

from pypdf import PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from public_submission_audit import APP_URL, SLIDES_EXPORT, Evidence, audit

HTML = b"""<!DOCTYPE html><html><head><title>BRASPACE MoonProof</title></head>
<body>NASA scientific UNVERIFIED evidence<script type="module" src="/assets/demo.js"></script></body></html>"""


def pdf_bytes(page_count: int) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=960, height=540)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def evidence(url: str, mime: str, content: bytes, final: str | None = None) -> Evidence:
    return Evidence(url, final or url, mime, content, 200)


class PublicLinksAuditTests(unittest.TestCase):
    def make_fetch(self, pdf_pages=7, fail_script=False, deck_html=False, redirect_login=False):
        def fetch(url, size):
            if "export/pdf" in url:
                if redirect_login:
                    return evidence(url, "text/html", b"<html>Log in</html>",
                                    "https://accounts.google.com/ServiceLogin")
                if deck_html:
                    return evidence(url, "text/html", b"<html>Sign in</html>")
                return evidence(url, "application/pdf", pdf_bytes(pdf_pages))
            if url.endswith(".js"):
                return evidence(url, "text/html" if fail_script else "application/javascript",
                                b"<html>oops</html>" if fail_script else b"console.log('ok');")
            return evidence(url, "text/html", HTML)
        return fetch

    def test_real_anonymous_html_js_pdf_seven_pages(self):
        report = audit(fetch=self.make_fetch())
        self.assertTrue(report["all_public_checks_passed"], report)
        self.assertFalse(report["authentication_used"])
        self.assertFalse(report["nasa_submission_verified"])
        self.assertFalse(report["scientific_validation_claimed"])
        self.assertEqual(report["checks"][1]["result"]["slides"], 7)
        self.assertEqual(report["checks"][0]["result"]["scientific_claim"].split(" ")[0],
                         "UNVERIFIED")

    def test_pdf_sign_in_does_not_count_as_public(self):
        for fetcher in (self.make_fetch(deck_html=True),
                        self.make_fetch(redirect_login=True)):
            with self.subTest(fetcher=fetcher):
                report = audit(fetch=fetcher)
                self.assertFalse(report["all_public_checks_passed"])
                self.assertFalse(report["checks"][1]["ok"])

    def test_six_or_eight_slide_deck_is_blocked(self):
        for count in (6, 8):
            report = audit(fetch=self.make_fetch(pdf_pages=count))
            self.assertFalse(report["checks"][1]["ok"])
            self.assertIn("expected exactly 7", report["checks"][1]["error"])

    def test_html_without_valid_javascript_fails_closed(self):
        report = audit(fetch=self.make_fetch(fail_script=True))
        self.assertFalse(report["checks"][0]["ok"])

    def test_pdf_bytes_are_digested_in_evidence(self):
        report = audit(fetch=self.make_fetch())
        self.assertEqual(len(report["checks"][1]["result"]["export"]["sha256"]), 64)
        self.assertEqual(report["checks"][1]["result"]["export"]["content_type"],
                         "application/pdf")


if __name__ == "__main__":
    unittest.main()
