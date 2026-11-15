"""Analytical checks for the straight-horizon solar-disc approximation.

These tests do not consume NASA data or certify a terrain/ephemeris model.
"""
import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from three_site_pipeline import SUN_RADIUS_DEG, disc_fraction, metrics


class SolarDiscFractionTests(unittest.TestCase):
    def test_half_radius_offsets_have_analytical_segment_areas(self):
        r = SUN_RADIUS_DEG
        half_minus = 1 / 3 - math.sqrt(3) / (4 * math.pi)
        self.assertAlmostEqual(disc_fraction(-r / 2, r), half_minus, places=12)
        self.assertAlmostEqual(disc_fraction(0, r), 0.5, places=12)
        self.assertAlmostEqual(disc_fraction(r / 2, r), 1 - half_minus, places=12)

    def test_monotonic_and_continuous_between_fully_hidden_and_visible(self):
        r = SUN_RADIUS_DEG
        ordered = [disc_fraction(r * i / 100, r) for i in range(-120, 121)]
        self.assertEqual(ordered[0], 0.0)
        self.assertEqual(ordered[-1], 1.0)
        self.assertTrue(all(0 <= f <= 1 for f in ordered))
        self.assertTrue(all(a <= b for a, b in zip(ordered, ordered[1:])))
        self.assertLess(disc_fraction(-r * (1 - 1e-6), r), 1e-6)
        self.assertGreater(disc_fraction(r * (1 - 1e-6), r), 1 - 1e-6)

    def test_partial_disc_is_symmetric(self):
        r = SUN_RADIUS_DEG
        for i in range(-100, 101):
            margin = r * i / 100
            self.assertAlmostEqual(disc_fraction(margin, r) + disc_fraction(-margin, r), 1, places=12)

    def test_metrics_preserve_partial_visibility(self):
        samples = [{"sun_el": SUN_RADIUS_DEG / 2, "sun_az": 0,
                    "earth_el": 1, "earth_az": 0}]
        horizon = [{"elevation_deg": 0}, {"elevation_deg": 0}]
        result = metrics(samples, horizon, 60)
        self.assertEqual(result["sun_center_visible_pct"], 100.0)
        self.assertEqual(result["mean_solar_disc_visible_pct"], 80.45)


if __name__ == "__main__":
    unittest.main()
