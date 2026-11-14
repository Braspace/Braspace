"""Tolerances for the committed reference comparisons (issue #65 BS-061, issue #153).

These tests read science/results/*.json as committed. They do not call JPL Horizons or re-read the PGDA
rasters; they make the recorded residuals fail the run when they exceed a stated tolerance, which
science/validate_vs_horizons.py itself does not do. Limits and their reasons: docs/SCIENCE_REVIEW_ONBOARD_BS061.md.
"""
import json
import pathlib
import unittest

RESULTS = pathlib.Path(__file__).resolve().parents[1] / "results"
SITES = {"mons-mouton-im2", "malapert-massif", "nobile-rim-1", "connecting-ridge", "peak-near-shackleton"}
# The site series is stored at 0.01 deg; a direction error ten times smaller cannot change a stored sample.
HORIZONS_TOLERANCE_DEG = 0.001
# PGDA averages a different (much longer) period and uses its own horizon, so only a loose band is meaningful.
PGDA_SUN_TOLERANCE_PP = 5.0
# Sites whose recorded difference is outside the band. Their Sun figures must be presented as unconfirmed.
PGDA_SUN_OUTSIDE = {"peak-near-shackleton"}


class ReferenceTolerances(unittest.TestCase):
    def test_sun_and_earth_directions_match_jpl_horizons(self):
        doc = json.loads((RESULTS / "validation_horizons.json").read_text())
        self.assertIn("JPL Horizons", doc["reference"])
        self.assertEqual({r["site"] for r in doc["results"]}, SITES)
        for result in doc["results"]:
            self.assertEqual(len(result["epochs"]), 12)
            self.assertEqual({c["body"] for c in result["comparisons"]}, {"sun", "earth"})
            for c in result["comparisons"]:
                self.assertEqual(c["n"], 12)
                for key in ("max_abs_el_diff_deg", "max_abs_az_diff_deg_cos_el"):
                    self.assertLessEqual(c[key], HORIZONS_TOLERANCE_DEG, f'{result["site"]} {c["body"]} {key}')

    def test_sunlight_fraction_against_pgda_is_inside_the_band_except_the_listed_site(self):
        doc = json.loads((RESULTS / "validation_pgda.json").read_text())
        self.assertEqual({r["site"] for r in doc["results"]}, SITES)
        outside = {r["site"] for r in doc["results"] if abs(r["diff_sun_pp"]) > PGDA_SUN_TOLERANCE_PP}
        self.assertEqual(outside, PGDA_SUN_OUTSIDE,
                         "the set of sites outside the PGDA band changed: update the science review before the UI numbers")
        for r in doc["results"]:
            self.assertAlmostEqual(r["diff_sun_pp"], r["pipeline_mean_solar_disc_pct"] - r["pgda_avg_solar_disc_pct"], places=2)


if __name__ == "__main__":
    unittest.main()
