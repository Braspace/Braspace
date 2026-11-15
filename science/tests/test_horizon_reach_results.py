"""Committed result of science/horizon_reach_study.py: what it found and what makes it trustworthy.

Reads science/results/horizon_reach.json only (the 115 MB LOLA file is not in the repository).
"""
import json
import pathlib
import unittest

DOC = json.loads((pathlib.Path(__file__).resolve().parents[1] / "results" / "horizon_reach.json").read_text())
SITES = {s["site"]: s for s in DOC["sites"]}


def at(site, km):
    return next(r for r in SITES[site]["reaches"] if r["reach_m"] == km * 1000)


class HorizonReach(unittest.TestCase):
    def test_control_the_100_km_march_reproduces_the_committed_horizons_exactly(self):
        self.assertEqual(len(SITES), 5)
        for site in SITES.values():
            self.assertEqual(site["control_max_abs_diff_deg_vs_committed_100km_horizon"], 0.0, site["site"])
            self.assertEqual(site["reaches"][0]["reach_m"], 100000)
            self.assertEqual(site["reaches"][0]["azimuths_raised_vs_100km"], 0)

    def test_two_elevated_sites_lose_sunlight_when_the_rays_go_past_100_km(self):
        for site, low, high in (("peak-near-shackleton", 4.5, 5.2), ("malapert-massif", 4.3, 4.9)):
            drop = at(site, 100)["sun_center_visible_pct"] - at(site, 200)["sun_center_visible_pct"]
            self.assertTrue(low < drop < high, f"{site}: {drop} pp")
            self.assertGreater(at(site, 200)["azimuths_raised_vs_100km"], 60)
            # ... and both move toward NASA PGDA.
            self.assertLess(abs(at(site, 200)["diff_solar_disc_vs_pgda_pp"]), abs(at(site, 100)["diff_solar_disc_vs_pgda_pp"]))
        self.assertGreater(at("malapert-massif", 200)["longest_darkness_h"], 4 * at("malapert-massif", 100)["longest_darkness_h"])

    def test_three_sites_do_not_change(self):
        for site in ("mons-mouton-im2", "nobile-rim-1", "connecting-ridge"):
            for key in ("sun_center_visible_pct", "mean_solar_disc_visible_pct", "earth_center_visible_pct", "longest_darkness_h"):
                self.assertEqual(at(site, 100)[key], at(site, 250)[key], f"{site} {key}")

    def test_converged_where_the_dem_covers_every_ray(self):
        peak200, peak250 = at("peak-near-shackleton", 200), at("peak-near-shackleton", 250)
        self.assertEqual((peak200["partial_azimuths"], peak250["partial_azimuths"]), (0, 0))
        self.assertEqual(peak200["sun_center_visible_pct"], peak250["sun_center_visible_pct"])
        # Farther from the pole the DEM (80 S) ends before the reach: those rows are lower bounds on the change.
        self.assertGreater(at("malapert-massif", 200)["partial_azimuths"], 0)


if __name__ == "__main__":
    unittest.main()
