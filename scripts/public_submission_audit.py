#!/usr/bin/env python3
"""Anonymous HTTP evidence for NASA Space Apps 2026 public submission links.

This probe uses no GitHub token, cookie, OAuth credential, or authenticated
browser. It verifies a public MoonProof HTML+JS bundle and exports the public
read-only 7-slide deck as a real PDF. This is NOT a human signed-out browser
screenshot, an independent scientific validation, or a NASA submission receipt.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

APP_URL = "https://braspace-moonproof-mxyowk.v2.appdeploy.ai/"
SLIDES_EXPORT = (
    "https://docs.google.com/presentation/d/"
    "1Nnv1C1XU2SQCmnPam1REc5_2Wix_Uo4x3u5Smmk3tLs/export/pdf"
)
MAX_HTML_BYTES = 3 * 1024 * 1024
MAX_JS_BYTES = 8 * 1024 * 1024
MAX_PDF_BYTES = 30 * 1024 * 1024


@dataclass(frozen=True)
class Evidence:
    requested_url: str
    final_url: str
    content_type: str
    body: bytes
    status: int

    def metadata(self) -> dict:
        return {
            "requested_url": self.requested_url,
            "final_url": self.final_url,
            "status": self.status,
            "content_type": self.content_type,
            "size_bytes": len(self.body),
            "sha256": hashlib.sha256(self.body).hexdigest(),
        }


def anonymous_fetch(url: str, max_size: int) -> Evidence:
    """No auth headers, no cookies. An HTTP redirect is NOT proof of access."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username:
        raise ValueError("only credential-free HTTPS endpoints are supported")
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/pdf,application/javascript,*/*",
            "User-Agent": "BRASPACE-PublicEvidenceProbe/1.0",
            "Cache-Control": "no-cache",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=35) as response:
        final_url = response.geturl()
        parsed_final = urllib.parse.urlparse(final_url)
        if parsed_final.scheme != "https":
            raise ValueError("insecure redirect")
        if parsed_final.hostname in {"accounts.google.com", "login.live.com"}:
            raise ValueError("login redirect: resource is not anonymously readable")
        status = response.status
        if status != 200:
            raise ValueError(f"HTTP {status}")
        body = response.read(max_size + 1)
        if len(body) > max_size:
            raise ValueError(f"response exceeds {max_size} bytes")
        return Evidence(
            requested_url=url,
            final_url=final_url,
            content_type=response.headers.get("Content-Type", "").split(";")[0].lower(),
            body=body,
            status=status,
        )


def verify_app(app_url: str, fetch=anonymous_fetch) -> dict:
    root = fetch(app_url, MAX_HTML_BYTES)
    if root.content_type not in {"text/html", "application/xhtml+xml"}:
        raise ValueError(f"app returned {root.content_type or 'unknown type'}, not HTML")
    html = root.body.decode("utf-8", errors="strict")
    for marker in ("BRASPACE MoonProof", "UNVERIFIED", "NASA"):
        if marker not in html:
            raise ValueError(f"app HTML missing transparent label {marker!r}")
    scripts = re.findall(
        r'<script\b[^>]*\bsrc=["\x27]([^"\x27]+)["\x27]',
        html,
        flags=re.IGNORECASE,
    )
    if not scripts:
        raise ValueError("app HTML contains no runnable JavaScript bundle")
    script_url = urllib.parse.urljoin(root.final_url, scripts[-1])
    if urllib.parse.urlparse(script_url).hostname != urllib.parse.urlparse(app_url).hostname:
        raise ValueError("entry JS bundle is hosted on a different origin")
    script = fetch(script_url, MAX_JS_BYTES)
    if "javascript" not in script.content_type or not script.body:
        raise ValueError("entry JS bundle did not return JavaScript")
    return {
        "status": "ANONYMOUS_HTTP_OK",
        "html": root.metadata(),
        "javascript": script.metadata(),
        "scientific_claim": "UNVERIFIED (page label only; no independent validation)",
    }


def verify_deck(export_url: str, fetch=anonymous_fetch) -> dict:
    pdf = fetch(export_url, MAX_PDF_BYTES)
    if not pdf.body.startswith(b"%PDF-"):
        raise ValueError("7-slide export returned HTML/login/other content, not PDF")
    if pdf.content_type not in {"application/pdf", "application/octet-stream"}:
        raise ValueError(f"unexpected PDF content type {pdf.content_type}")
    try:
        from pypdf import PdfReader
        pages = len(PdfReader(io.BytesIO(pdf.body)).pages)
    except ImportError as exc:
        raise ValueError("pypdf==5.9.0 is required to verify slide count") from exc
    if pages != 7:
        raise ValueError(f"presentation export contains {pages} pages, expected exactly 7")
    return {
        "status": "ANONYMOUS_PDF_EXPORT_OK",
        "slides": pages,
        "export": pdf.metadata(),
        "scope": "HTTP export check only, not visual/factual review of the slides",
    }


def audit(app_url: str = APP_URL, slide_url: str = SLIDES_EXPORT, fetch=anonymous_fetch) -> dict:
    report = {
        "schema": "braspace.public-submission-evidence.v1",
        "checked_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "authentication_used": False,
        "nasa_submission_verified": False,
        "scientific_validation_claimed": False,
        "checks": [],
    }
    for name, url, check in (
        ("moonproof_public_app", app_url, verify_app),
        ("seven_slide_anonymous_export", slide_url, verify_deck),
    ):
        try:
            result = check(url, fetch=fetch)
            report["checks"].append({"name": name, "ok": True, "result": result})
        except Exception as exc:
            # Do not include response bodies, cookies, secrets, tokens, or stack traces.
            report["checks"].append(
                {"name": name, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
            )
    report["all_public_checks_passed"] = all(c["ok"] for c in report["checks"])
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-url", default=APP_URL)
    parser.add_argument("--slides-url", default=SLIDES_EXPORT)
    parser.add_argument("--output", type=Path, default=Path("evidence/public-submission-http.json"))
    args = parser.parse_args()
    report = audit(args.app_url, args.slides_url)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    if not report["all_public_checks_passed"]:
        print("BLOCKED: one or more links are not proven anonymously readable", file=sys.stderr)
        return 1
    print("PASS: anonymous HTTP app + seven-slide PDF checks only; NASA submission remains unverified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
