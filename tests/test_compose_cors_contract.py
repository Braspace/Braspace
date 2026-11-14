"""Static security regression for Compose's opt-in frontend CORS configuration.

The actual HTTP preflight is exercised by .github/workflows/compose-cors.yml.
No YAML third-party dependency is required.
"""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ComposeCorsConfigRegression(unittest.TestCase):
    def test_compose_forwards_opt_in_origins_not_wildcard(self):
        config = (ROOT / "compose.yaml").read_text(encoding="utf-8")
        self.assertRegex(
            config,
            r"(?m)^\s{6}CORS_ALLOWED_ORIGINS:\s*\$\{CORS_ALLOWED_ORIGINS:-\}\s*$",
        )
        self.assertNotRegex(
            config,
            r"(?m)^\s{6}CORS_ALLOWED_ORIGINS:\s*['\"]?\*",
        )
        self.assertNotIn("Access-Control-Allow-Origin: *", config)

    def test_go_middleware_denies_wildcard_and_unknown_origin(self):
        middleware = (ROOT / "api" / "middleware.go").read_text(encoding="utf-8")
        self.assertIn('case o == "*":', middleware)
        self.assertIn('allowed := origins[origin]', middleware)
        self.assertIn("http.StatusForbidden", middleware)


if __name__ == "__main__":
    unittest.main()
