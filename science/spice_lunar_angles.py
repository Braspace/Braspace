"""Preliminary NASA/JPL NAIF SPICE lunar Sun/Earth-center look-angle series.

Requires independently downloaded official kernels and a PDS-verified
LOLA terrain horizon. Uses LT+S apparent directions from the surface site (spkcpo).
Output scientific status stays UNVERIFIED until an independent comparison.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib

from lola_horizon import KNOWN_REVIEWED_SHA256, dot, site_basis

FRAME = "MOON_ME_DE440_ME421"
KERNEL_NAMES = ("naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf")
RADIUS_KM = 1737.4
ABCORR = "LT+S"
KERNEL_SOURCES = {
    "naif0012.tls":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
    "de440s.bsp":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
    "moon_pa_de440_200625.bpc":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf",
}

def rounded(v:float)->float:
    if not math.isfinite(v): raise ValueError("nonfinite ephemeris geometry")
    return round(v,6)

def look_angles(body_moon_centered_km, lat_deg:float, lon_deg:float,
                observer_radius_km:float) -> dict[str,float]:
    """Geometric point-body azimuth clockwise from local north and elevation.
    body vector and observer radius are in the SAME lunar ME body-fixed frame."""
    if not all(math.isfinite(float(v)) for v in (*body_moon_centered_km,lat_deg,lon_deg,observer_radius_km)):
        raise ValueError("nonfinite position")
    if observer_radius_km<=0 or not -90<=lat_deg<=90:
        raise ValueError("invalid lunar surface geometry")
    up,north,east=site_basis(lat_deg,lon_deg)
    diff=tuple(float(b)-observer_radius_km*u for b,u in zip(body_moon_centered_km,up))
    u,n,e=dot(diff,up),dot(diff,north),dot(diff,east)
    if math.hypot(u,n,e)<1e-9: raise ValueError("undefined look direction")
    return {"azimuth_deg":rounded(math.degrees(math.atan2(e,n))%360),
            "elevation_deg":rounded(math.degrees(math.atan2(u,math.hypot(n,e))))}

def checksum(path:pathlib.Path)->str:
    hash=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):hash.update(chunk)
    return hash.hexdigest()

def from_utc(value:str)->dt.datetime:
    t=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
    if t.tzinfo is None:raise ValueError("UTC time zone is required")
    return t.astimezone(dt.timezone.utc)

def generate(kernel_dir:pathlib.Path,horizon_json:pathlib.Path,start_utc:str,hours:int,step_minutes:int=60)->tuple[dict,dict]:
    if not 1<=hours<=240 or not 1<=step_minutes<=360 or 60*hours%step_minutes:
        raise ValueError("hours 1..240 and whole-step UTC grid required")
    h=json.loads(horizon_json.read_text(encoding="utf-8"))
    p=h.get("provenance",{})
    if (p.get("terrain_sha256")!=KNOWN_REVIEWED_SHA256 or
        p.get("terrain_geometry_validation")!="PRELIMINARY_NOT_INDEPENDENTLY_VALIDATED" or
        p.get("actual_nasa_dem_bytes_used") is not True or
        p.get("sun_earth_visibility_calculated") is not False):
        raise ValueError("source horizon does not contain expected NASA PDS provisional evidence")
    site=h["site"]
    if site["latitude_deg"]!=-89.4632 or site["longitude_deg"]!=-137.49:
        raise ValueError("only the provenanced Connecting Ridge site is allowed in this prototype")
    if len(h["terrain_horizon"])<2:
        raise ValueError("invalid terrain horizon")
    t0=from_utc(start_utc)
    kernel_paths=[kernel_dir/n for n in KERNEL_NAMES]
    for k in kernel_paths:
        if not k.is_file() or k.stat().st_size==0:
            raise FileNotFoundError("missing required JPL/NAIF kernel: "+k.name)
    ids={n:checksum(k) for n,k in zip(KERNEL_NAMES,kernel_paths)}
    try:
        import spiceypy as spice
    except ImportError as e:
        raise RuntimeError("pip install spiceypy==8.4.0 to use the NAIF computation") from e
    samples=[]
    observer_radius_km=(RADIUS_KM*1000+site["site_elevation_m"]+site["observer_height_m"])/1000
    obs_km=[observer_radius_km*u for u in site_basis(site["latitude_deg"],site["longitude_deg"])[0]]
    try:
        spice.kclear()
        for k in kernel_paths: spice.furnsh(str(k))
        if spice.namfrm(FRAME)==0:
            raise RuntimeError("moon reference frame not defined by loaded NAIF FK/PCK")
        for i in range(hours*60//step_minutes):
            epoch=t0+dt.timedelta(minutes=i*step_minutes)
            utc=epoch.strftime("%Y-%m-%dT%H:%M:%S")
            et=spice.str2et(epoch.strftime("%Y %b %d %H:%M:%S UTC"))
            # Apparent (LT+S) direction from the surface site, not Moon centre.
            sun_rel,_=spice.spkcpo("SUN",et,FRAME,"OBSERVER",ABCORR,obs_km,"MOON",FRAME)
            earth_rel,_=spice.spkcpo("EARTH",et,FRAME,"OBSERVER",ABCORR,obs_km,"MOON",FRAME)
            sun=[sun_rel[j]+obs_km[j] for j in range(3)]
            earth=[earth_rel[j]+obs_km[j] for j in range(3)]
            samples.append({"sun":look_angles(sun,site["latitude_deg"],site["longitude_deg"],observer_radius_km),
                            "earth":look_angles(earth,site["latitude_deg"],site["longitude_deg"],observer_radius_km)})
    finally:
        spice.kclear()
    horizon=[{"azimuth_deg":v["azimuth_deg"],"elevation_deg":v["elevation_deg"]} for v in h["terrain_horizon"]]
    series={
        "schema":"braspace.site-series.v1","site_id":"connecting-ridge",
        "science_status":"UNVERIFIED",
        "provenance":{
            "terrain_dataset_id":p["terrain_dataset"],
            "terrain_sha256":p["terrain_sha256"],
            "ephemeris_id":"NAIF DE440s + moon_pa_de440_200625.bpc + moon_de440_250416.tf + naif0012.tls",
            "frame":"MOON_ME",
            "generator":"science/spice_lunar_angles.py v0.1",
            "note":"NASA LOLA terrain + JPL/NAIF SPICE Sun/Earth centers; UNVERIFIED independent science; not NASA-approved."
        },
        "observer_height_m":site["observer_height_m"],
        "terrain_horizon":horizon,
        "start_utc":t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step_seconds":step_minutes*60,
        "samples":samples
    }
    metadata={
        "status":"REAL_NASA_LOLA_AND_NAIF_INPUTS_PRELIMINARY",
        "validated_against_independent_reference":False,
        "pds_product":p["terrain_dataset"],
        "pds_sha256":p["terrain_sha256"],
        "jpl_naif_kernels_sha256":ids,
        "kernel_sources":KERNEL_SOURCES,
        "spice_frame":FRAME,
        "spice_aberration_correction":"LT+S from surface site (spkcpo); Horizons-airless convention",
        "site_position_km":observer_radius_km,
        "site_latitude_deg":site["latitude_deg"],
        "site_longitude_deg":site["longitude_deg"],
        "start_utc":series["start_utc"],"samples":len(samples),"step_minutes":step_minutes,
        "sun_earth_center_not_disc":True,
        "lola_horizon_independently_validated":False,
        "nasa_mission_certified":False
    }
    return series,metadata

def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--horizon",type=pathlib.Path,required=True)
    parser.add_argument("--kernels-dir",type=pathlib.Path,required=True)
    parser.add_argument("--start-utc",default="2026-11-15T00:00:00Z")
    parser.add_argument("--hours",type=int,default=72)
    parser.add_argument("--step-minutes",type=int,default=60)
    parser.add_argument("--output-series",type=pathlib.Path,required=True)
    parser.add_argument("--output-metadata",type=pathlib.Path,required=True)
    args=parser.parse_args()
    series,metadata=generate(args.kernels_dir,args.horizon,args.start_utc,args.hours,args.step_minutes)
    args.output_series.parent.mkdir(parents=True,exist_ok=True)
    args.output_series.write_text(json.dumps(series,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    args.output_metadata.parent.mkdir(parents=True,exist_ok=True)
    args.output_metadata.write_text(json.dumps(metadata,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    print("NAIF/LOLA preliminary series generated; NOT independently validated; samples:",len(series["samples"]))

if __name__=="__main__":main()
