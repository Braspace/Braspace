"""Fast reproducible geometry tests using a labelled *synthetic* tiny DEM.

The real LOLA PDS binary is intentionally not required in CI. A source-backed
run against Gabriel's 115,520,000-byte verified raster is a separate gate.
"""
import json
import pathlib
import struct
import sys
import tempfile
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from lola_horizon import DEM, Grid, digest, sample_horizon, site_basis, dot

PDS_TEST_LABEL = """
MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"
POSITIVE_LONGITUDE_DIRECTION = "EAST"
CENTER_LATITUDE = -90 <deg>
CENTER_LONGITUDE = 0 <deg>
MAP_PROJECTION_ROTATION = 0
SAMPLE_TYPE = "LSB_INTEGER"
SAMPLE_BITS = 16
COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"
KEYWORD_LATITUDE_TYPE = "PLANETOCENTRIC"
LINE_SAMPLES = 101
LINES = 101
MAP_SCALE = 80 <m/pix>
A_AXIS_RADIUS = 1737.4 <km>
LINE_PROJECTION_OFFSET = 50.0 <pix>
SAMPLE_PROJECTION_OFFSET = 50.0 <pix>
SCALING_FACTOR = 0.5
"""

class LOLAScienceTests(unittest.TestCase):
    def setUp(self):
        self.grid=Grid.from_label(PDS_TEST_LABEL)
        self.tmp=tempfile.TemporaryDirectory()
        self.path=pathlib.Path(self.tmp.name)/"small-synthetic.img"
        self.pixels=[0]*10201
        self.write()

    def tearDown(self):self.tmp.cleanup()

    def write(self):
        self.path.write_bytes(struct.pack("<"+str(len(self.pixels))+"h",*self.pixels))

    def test_coordinate_registration_and_invertibility(self):
        self.assertEqual(self.grid.location_to_pixel(-90,0),(50.,50.))
        points=[(-89.5,0),(-89.65,90),(-89.7,-135),(-89.25,179.75)]
        for lat,lon in points:
            col,row=self.grid.location_to_pixel(lat,lon)
            back_lat,back_lon=self.grid.pixel_to_location(col,row)
            self.assertAlmostEqual(lat,back_lat,places=9)
            self.assertAlmostEqual(lon,back_lon,places=9)
        self.assertLess(self.grid.location_to_pixel(-89.9,0)[1],50)
        self.assertGreater(self.grid.location_to_pixel(-89.9,90)[0],50)

    def test_pds_catalog_pixel_centre_formula(self):
        # DSMAP_POLAR.CAT, N=7600, MAP_SCALE=80: X=(I-N/2-0.5)*80 with 1-indexed I.
        # Zero-indexed col 1000 is I=1001 -> X=-223960 m; row 3799.5 -> Y=0.
        import math
        g=Grid(7600,7600,80.,1737400.,3799.5,3799.5,0.5)
        self.assertEqual(g.location_to_pixel(-90,0),(3799.5,3799.5))
        lat,lon=g.pixel_to_location(1000,3799.5)
        self.assertAlmostEqual(lon,-90.,places=9)
        rho=2*1737400.*math.tan(math.radians(lat+90)/2)
        self.assertAlmostEqual(rho,223960.,places=3)

    def test_flat_spherical_moon_horizon_below_tangent(self):
        with DEM(self.path,self.grid) as dem:
            res=sample_horizon(dem,-90,0,0,max_distance_m=640,step_m=80,azimuth_step_deg=30)
        self.assertEqual(len(res["terrain_horizon"]),12)
        self.assertEqual(res["coverage"]["complete_azimuths"],12)
        for h in res["terrain_horizon"]:
            self.assertLess(h["elevation_deg"],0)  # lunar curvature
            self.assertGreater(h["elevation_deg"],-1.0)
            self.assertEqual(h["sample_count"],8)
        json.dumps(res,allow_nan=False)

    def test_hill_along_north_increases_horizon_angle(self):
        self.pixels[48*101+50]=400 # 200 m above 0 m at ~160 m along az 0
        self.write()
        with DEM(self.path,self.grid) as dem:
            res=sample_horizon(dem,-90,0,2,max_distance_m=640,step_m=80,azimuth_step_deg=30)
        northern=res["terrain_horizon"][0]
        southern=res["terrain_horizon"][6]
        self.assertGreater(northern["elevation_deg"],15)
        self.assertLess(southern["elevation_deg"],0)
        self.assertGreater(northern["elevation_deg"],southern["elevation_deg"])

    def test_missing_samples_fail_not_silently_zero(self):
        self.pixels[50*101+50]=-32768
        self.write()
        with DEM(self.path,self.grid) as dem:
            self.assertIsNone(dem.height(-90,0))
            with self.assertRaisesRegex(ValueError,"no DEM data at observer"):
                sample_horizon(dem,-90,0,0,max_distance_m=640,step_m=80,azimuth_step_deg=30)

    def test_reject_wrong_raster_size_and_projection(self):
        broken=pathlib.Path(self.tmp.name)/"bad.img"
        broken.write_bytes(b"x")
        with self.assertRaisesRegex(ValueError,"byte count"):
            DEM(broken,self.grid)
        with self.assertRaisesRegex(ValueError,"polar stereographic"):
            Grid.from_label(PDS_TEST_LABEL.replace("POLAR STEREOGRAPHIC","EQUIRECTANGULAR"))
        with self.assertRaisesRegex(ValueError,"reference frame"):
            Grid.from_label(PDS_TEST_LABEL.replace("MEAN EARTH/POLAR AXIS OF DE421","MOON_PA"))
        with self.assertRaises(ValueError):
            self.grid.location_to_pixel(-79,3)

    def test_checksum_is_of_exact_bytes(self):
        import hashlib
        self.assertEqual(digest(self.path),hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(len(digest(self.path)),64)

    def test_basis_orthonormal(self):
        for lat,lon in [(-90,0),(-89.2,-137.49),(-88.8,123.69)]:
            up,north,east=site_basis(lat,lon)
            self.assertAlmostEqual(dot(up,up),1)
            self.assertAlmostEqual(dot(up,north),0,places=10)
            self.assertAlmostEqual(dot(up,east),0,places=10)
            self.assertAlmostEqual(dot(north,east),0,places=10)

if __name__=="__main__":
    unittest.main()
