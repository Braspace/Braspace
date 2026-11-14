"""Source-aware, *terrain-only* NASA LRO/LOLA polar DEM horizon prototype.

Implements one documented PDS3 south-polar stereographic mapping, spherical
Moon line-of-sight geometry and pixel-interpolated terrain sampling. It does NOT
compute NASA Sun/Earth ephemerides, mission windows or a certified landing site.
Only use with a PDS IMG and its matching label; verify exact asset SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import mmap
import pathlib
import re
import struct
from dataclasses import dataclass
from typing import Iterator

EXPECTED_PRODUCT = "LDEM_80S_80M.IMG"
KNOWN_REVIEWED_SHA256 = "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"
PDS_PAGE = "https://pds-geosciences.wustl.edu/missions/lro/lola.htm"

@dataclass(frozen=True)
class Grid:
    width: int
    height: int
    pixel_size_m: float
    radius_m: float
    line_offset: float
    sample_offset: float
    scale_m_per_dn: float

    @classmethod
    def from_label(cls, text: str) -> "Grid":
        def get(key: str) -> str:
            found = re.search(r"^\s*" + re.escape(key) + r"\s*=\s*(.+?)\s*$",
                              text, re.MULTILINE)
            if not found:
                raise ValueError("missing PDS label field " + key)
            return found.group(1).strip().strip('"').split(" <")[0].strip()
        if get("MAP_PROJECTION_TYPE") != "POLAR STEREOGRAPHIC":
            raise ValueError("only PDS3 polar stereographic DEMs are supported")
        if get("POSITIVE_LONGITUDE_DIRECTION") != "EAST" or float(get("CENTER_LATITUDE")) != -90:
            raise ValueError("only planetocentric south-pole east-positive coverage supported")
        if float(get("CENTER_LONGITUDE")) != 0 or float(get("MAP_PROJECTION_ROTATION")) != 0:
            raise ValueError("unsupported projection rotation or central meridian")
        if get("SAMPLE_TYPE") != "LSB_INTEGER" or int(get("SAMPLE_BITS")) != 16:
            raise ValueError("only little-endian signed 16-bit data supported")
        if get("COORDINATE_SYSTEM_NAME") != "MEAN EARTH/POLAR AXIS OF DE421":
            raise ValueError("unexpected lunar reference frame")
        if get("KEYWORD_LATITUDE_TYPE") != "PLANETOCENTRIC":
            raise ValueError("unexpected latitude convention")
        out = cls(width=int(get("LINE_SAMPLES")), height=int(get("LINES")),
                  pixel_size_m=float(get("MAP_SCALE")),
                  radius_m=1000 * float(get("A_AXIS_RADIUS")),
                  line_offset=float(get("LINE_PROJECTION_OFFSET")),
                  sample_offset=float(get("SAMPLE_PROJECTION_OFFSET")),
                  scale_m_per_dn=float(get("SCALING_FACTOR")))
        if out.width < 3 or out.height < 3 or out.pixel_size_m <= 0 or out.radius_m <= 0 or out.scale_m_per_dn <= 0:
            raise ValueError("invalid PDS raster dimensions, geometry or scaling")
        return out

    def location_to_pixel(self, lat: float, lon: float) -> tuple[float,float]:
        """Return zero-indexed pixel-centre coordinates.

        LOLA DSMAP_POLAR.CAT: X=(I-N/2-0.5)*MAP_SCALE, Y=-(J-N/2-0.5)*MAP_SCALE
        with 1-indexed I,J. For N=7600 the pole is at zero-indexed 3799.5,
        which equals the label PROJECTION_OFFSET directly (no extra -0.5)."""
        if not -90 <= lat <= -80 or not -360 <= lon <= 360 or not math.isfinite(lat+lon):
            raise ValueError("outside south polar coverage or invalid coordinate")
        rho = 2 * self.radius_m * math.tan(math.radians(lat + 90) / 2)
        theta = math.radians(lon)
        x, y = rho * math.sin(theta), rho * math.cos(theta)
        col = self.sample_offset + x/self.pixel_size_m
        row = self.line_offset - y/self.pixel_size_m
        return col,row

    def pixel_to_location(self, col:float, row:float) -> tuple[float,float]:
        x = (col - self.sample_offset)*self.pixel_size_m
        y = (self.line_offset - row)*self.pixel_size_m
        rho = math.hypot(x,y)
        colat = 2 * math.atan(rho/(2*self.radius_m))
        lat = math.degrees(colat) - 90
        lon = math.degrees(math.atan2(x,y))
        return lat, lon

class DEM:
    def __init__(self, file: pathlib.Path, grid:Grid):
        self.file = file
        self.grid = grid
        if file.stat().st_size != grid.width * grid.height * 2:
            raise ValueError("unexpected PDS raster byte count")
        self.handle = file.open("rb")
        self.mapping = mmap.mmap(self.handle.fileno(), 0, access=mmap.ACCESS_READ)

    def close(self) -> None:
        self.mapping.close()
        self.handle.close()

    def __enter__(self) -> "DEM": return self
    def __exit__(self, *_: object) -> None: self.close()

    def value(self, col:int, row:int) -> float | None:
        if col<0 or row<0 or col>=self.grid.width or row>=self.grid.height:
            return None
        dn = struct.unpack_from("<h", self.mapping, (row*self.grid.width+col)*2)[0]
        # Reserve the all-bits-low sentinel; PDS label must be consulted for
        # exceptional fill values (LOLA label does not give a special constant).
        if dn == -32768:
            return None
        return float(dn)*self.grid.scale_m_per_dn

    def height(self, lat: float, lon: float) -> float | None:
        try:
            col,row=self.grid.location_to_pixel(lat,lon)
        except ValueError:
            return None
        x,y=math.floor(col),math.floor(row)
        dx,dy=col-x,row-y
        a=self.value(x,y);b=self.value(x+1,y);c=self.value(x,y+1);d=self.value(x+1,y+1)
        if any(v is None for v in (a,b,c,d)): return None
        return a*(1-dx)*(1-dy) + b*dx*(1-dy) + c*(1-dx)*dy + d*dx*dy

def dot(a:tuple[float,float,float], b:tuple[float,float,float]) -> float:
    return sum(x*y for x,y in zip(a,b))

def site_basis(lat:float,lon:float) -> tuple[tuple[float,float,float],...]:
    la,lo=math.radians(lat),math.radians(lon)
    up=(math.cos(la)*math.cos(lo),math.cos(la)*math.sin(lo),math.sin(la))
    north=(-math.sin(la)*math.cos(lo),-math.sin(la)*math.sin(lo),math.cos(la))
    east=(-math.sin(lo),math.cos(lo),0.)
    return up,north,east

def sample_horizon(dem:DEM, lat:float, lon:float, observer_height_m:float,
                   max_distance_m:int=30000,step_m:int=160,azimuth_step_deg:int=5)->dict:
    if not -90 <= lat <= -80 or not math.isfinite(lon+lat+observer_height_m):
        raise ValueError("invalid south-polar location / observer height")
    if observer_height_m<0 or observer_height_m>100 or step_m<40 or max_distance_m<step_m or max_distance_m>100000:
        raise ValueError("invalid observer height / ray range")
    if azimuth_step_deg not in (1,2,5,10,15,30):
        raise ValueError("unsupported azimuth resolution")
    base=dem.height(lat,lon)
    if base is None: raise ValueError("no DEM data at observer")
    grid=dem.grid
    up,north,east=site_basis(lat,lon)
    height0=grid.radius_m+base+observer_height_m
    horizon=[]
    max_uncovered=0
    for az in range(0,360,azimuth_step_deg):
        angle=math.radians(az)
        bearing=tuple(n*math.cos(angle)+e*math.sin(angle) for n,e in zip(north,east))
        maximum=-90.
        visible=0
        incomplete=False
        for dist in range(step_m,max_distance_m+1,step_m):
            gamma=dist/grid.radius_m
            target=tuple(math.cos(gamma)*u + math.sin(gamma)*v for u,v in zip(up,bearing))
            tlat=math.degrees(math.asin(max(-1.,min(1.,target[2]))))
            tlon=math.degrees(math.atan2(target[1],target[0]))
            elev=dem.height(tlat,tlon)
            if elev is None:
                incomplete=True
                continue
            r=grid.radius_m+elev
            above=r*dot(target,up)-height0
            across=r*dot(target,bearing)
            apparent=math.degrees(math.atan2(above,across))
            if apparent>maximum:maximum=apparent
            visible+=1
        if visible == 0: raise ValueError("no valid ray samples for azimuth "+str(az))
        max_uncovered+=int(incomplete)
        horizon.append({"azimuth_deg":float(az),"elevation_deg":round(maximum,6),
                        "sample_count":visible,"partial_coverage":incomplete})
    return {"site":{"latitude_deg":lat,"longitude_deg":lon,
                    "observer_height_m":observer_height_m,
                    "site_elevation_m":round(base,3)},
            "model":"braspace.lola-polar-horizon.v0.1",
            "ray_parameters":{"max_distance_m":max_distance_m,"step_m":step_m,
                              "azimuth_step_deg":azimuth_step_deg},
            "coverage":{"azimuths_with_missing_samples":max_uncovered,
                        "complete_azimuths":len(horizon)-max_uncovered},
            "terrain_horizon":horizon}

def digest(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--img",type=pathlib.Path,required=True)
    parser.add_argument("--label",type=pathlib.Path,required=True)
    parser.add_argument("--lat",type=float,required=True)
    parser.add_argument("--lon",type=float,required=True)
    parser.add_argument("--observer-height-m",type=float,default=2)
    parser.add_argument("--max-distance-m",type=int,default=30000)
    parser.add_argument("--step-m",type=int,default=160)
    parser.add_argument("--azimuth-step-deg",type=int,default=5)
    parser.add_argument("--expected-sha256",default=KNOWN_REVIEWED_SHA256)
    parser.add_argument("--output",type=pathlib.Path)
    args=parser.parse_args()
    label=args.label.read_text(encoding="ascii")
    if EXPECTED_PRODUCT not in label:
        raise SystemExit("product label does not identify "+EXPECTED_PRODUCT)
    grid=Grid.from_label(label)
    if (grid.width,grid.height,grid.pixel_size_m)!=(7600,7600,80):
        raise SystemExit("unexpected NASA LOLA raster geometry")
    computed=digest(args.img)
    if computed.lower()!=args.expected_sha256.lower():
        raise SystemExit("PDS data SHA-256 mismatch: refusing untrusted geometry")
    with DEM(args.img,grid) as dem:
        result=sample_horizon(dem,args.lat,args.lon,args.observer_height_m,
                              args.max_distance_m,args.step_m,args.azimuth_step_deg)
    result["provenance"]={
        "terrain_dataset":"LRO-L-LOLA-4-GDR-V1.0/LDEM_80S_80M.IMG V2.0",
        "terrain_sha256":computed, "pds_label":args.label.name,
        "reference_frame":"MEAN EARTH/POLAR AXIS OF DE421",
        "source":PDS_PAGE,"actual_nasa_dem_bytes_used":True,
        "terrain_geometry_validation":"PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED",
        "ephemerides_integrated":False,
        "sun_earth_visibility_calculated":False,
        "nasa_certified":False
    }
    txt=json.dumps(result,indent=2,allow_nan=False)+"\n"
    if args.output:args.output.write_text(txt,encoding="utf-8")
    else: print(txt,end="")

if __name__=="__main__":main()
