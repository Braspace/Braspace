"""#157: the sites.json stamp is reproducible (SOURCE_DATE_EPOCH, else the summary's stamp)."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def load():
    try:
        import numpy  # noqa: F401  (build_web_assets imports it at module level)
    except ImportError:
        raise unittest.SkipTest("numpy not installed")
    spec = importlib.util.spec_from_file_location("build_web_assets", ROOT / "science" / "build_web_assets.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class GeneratedStamp(unittest.TestCase):
    def test_source_date_epoch_pins_the_stamp(self):
        m = load()
        self.assertEqual(m.generated_utc({"generated_utc": "x"}, {"SOURCE_DATE_EPOCH": "1763227596"}), "2025-11-15T17:26:36Z")

    def test_defaults_to_the_summary_stamp(self):
        m = load()
        self.assertEqual(m.generated_utc({"generated_utc": "2026-11-15T17:36:36Z"}, {}), "2026-11-15T17:36:36Z")

    def test_rejects_malformed_epoch(self):
        m = load()
        for bad in ("-1", "soon", "1.5"):
            with self.assertRaises(SystemExit):
                m.generated_utc({}, {"SOURCE_DATE_EPOCH": bad})


if __name__ == "__main__":
    unittest.main()
