"""Pure numerical contract tests; real NAIF kernel run is separate in CI."""
import datetime as dt
import math
import pathlib
import sys
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from spice_lunar_angles import look_angles, from_utc, KERNEL_NAMES, FRAME

class SpiceAnglesTests(unittest.TestCase):
    def test_local_cardinal_directions_at_south_pole(self):
        eps=1e-9
        n=look_angles((1e7,0.,0.),-90,0,1737.4)
        e=look_angles((0.,1e7,0.),-90,0,1737.4)
        up=look_angles((0.,0.,-1e7),-90,0,1737.4)
        self.assertAlmostEqual(n["azimuth_deg"],0,places=5)
        self.assertAlmostEqual(e["azimuth_deg"],90,places=5)
        self.assertGreater(up["elevation_deg"],89.99)
        self.assertTrue(all(-90<=x["elevation_deg"]<=90 for x in (n,e,up)))

    def test_local_below_horizon_and_moon_rotation(self):
        bad=look_angles((0,0,1e7),-90,0,1737.4)
        self.assertLess(bad["elevation_deg"],-89.99)
        for lat,lon in [(-89.4632,-137.49),(-88.81,123.69)]:
            d=look_angles((384400.,19000.,7500.),lat,lon,1739.35)
            self.assertTrue(0<=d["azimuth_deg"]<360)
            self.assertTrue(-90<=d["elevation_deg"]<=90)

    def test_utc_timezone_and_constraints(self):
        self.assertEqual(from_utc("2026-11-15T00:00:00Z").tzinfo,dt.timezone.utc)
        self.assertEqual(from_utc("2026-11-14T21:00:00-03:00"),from_utc("2026-11-15T00:00:00Z"))
        with self.assertRaises(ValueError):
            from_utc("2026-11-15T00:00:00") # time zone mandatory

    def test_nonfinite_or_zero_vector_rejected(self):
        with self.assertRaises(ValueError):
            look_angles((math.nan,0,0),-90,0,1737)
        with self.assertRaises(ValueError):
            look_angles((0,0,-1737),-90,0,1737)
        self.assertEqual(FRAME,"MOON_ME_DE440_ME421")
        self.assertEqual(len(KERNEL_NAMES),4)

if __name__=="__main__":unittest.main()
