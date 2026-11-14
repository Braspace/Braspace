# BRASPACE NASA Space Apps 2026 — public submission evidence gate

Status recorded 2026-11-14. **Do not mark BS-010, BS-011 or BS-032 complete from a hosting dashboard alone.**

## Hosted deliverables under inspection

| Deliverable | Link | Evidence needed |
|---|---|---|
| MoonProof read-only educational prototype | https://braspace-moonproof-mxyowk.v2.appdeploy.ai/ | Anonymous (no cookie/token) HTTPS GET; original HTML contains MoonProof identity, NASA attribution and UNVERIFIED caveat; JS entry bundle loads |
| Seven-slide Google Slides candidate deck | https://docs.google.com/presentation/d/1Nnv1C1XU2SQCmnPam1REc5_2Wix_Uo4x3u5Smmk3tLs/edit | Public anonymous PDF export must succeed with exactly 7 pages, and manual quality/attribution review |
| Private engineering repository | https://github.com/Braspace/Braspace | PRIVATE; this is not a publicly accessible NASA project URL and should not be substituted for the public app |
| Official NASA entry | NASA Space Apps platform | Explicit owner-side Submit for Judging confirmation, timestamp and accepted-link screenshot; **NOT CONFIRMED** |

Current AppDeploy control plane reports the MoonProof site **ready** and browser QA has no recorded frontend/network errors, but this is **not** an independent anonymous HTTP check. Conversely, passing an anonymous HTTP probe is not a full browser inspection or NASA portal submission.

## Automated evidence

GitHub Actions workflow [public-submission-proof.yml](../.github/workflows/public-submission-proof.yml) runs an anonymous external HTTPS check without GitHub credentials, OAuth cookies or NASA auth. It downloads only the public HTML, same-origin JS bundle and deck PDF; verifies PDF magic and seven pages using pinned pypdf 5.9.0. It persists a JSON receipt with UTC time, redirect destination, HTTP status, content type, byte length and SHA-256. A sign-in page masquerading as HTTP 200, wrong page count, missing UNVERIFIED notice, broken JS entry or inaccessible URL fails the job.

Run locally:

```bash
python -m pip install pypdf==5.9.0
python -m unittest discover -s scripts -p 'test_public_submission_audit.py' -v
python scripts/public_submission_audit.py --output evidence/public-submission-http.json
```

The script only reports a receipt and exit code. It does not publish files, alter NASA entry forms, change ownership, use credentials, or assert planetary accuracy. Generated receipts are evidence of the HTTP request at the specified instant only. The deck text, visual legibility, citations, copyright/AI disclosures, team-registration facts and NASA form submission still require responsible human review.

## Acceptance checklist

- [ ] Live automated anonymous HTTP app bundle fetch succeeds.
- [ ] Public anonymous Google PDF export succeeds with seven slides.
- [ ] Human signed-out browser verification on desktop and mobile, with screenshots.
- [ ] NASA/JPL provenance, selected data epoch and UNVERIFIED labels checked visually; no flight-safety claims.
- [ ] NASA portal fields, six registered people and AI/content rights reviewed by owners.
- [ ] Owner submits final entry and archives authoritative confirmation timestamp/screenshot.
