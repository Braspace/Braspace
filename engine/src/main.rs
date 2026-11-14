//! BRASPACE minimal Rust geometric classifier.
//! This executable DOES NOT derive ephemerides or load NASA LOLA terrain.
//! Its output always identifies supplied inputs as unverified.
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LookAngle { azimuth_deg: f64, elevation_deg: f64 }

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Sample { azimuth_deg: f64, elevation_deg: f64 }

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Provenance { terrain_dataset_id: String, ephemeris_id: String, frame: String }

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
 site_id: String, epoch_utc: String, sun: LookAngle, earth: LookAngle,
 terrain_horizon: Vec<Sample>, provenance: Provenance,
}

#[derive(Debug, Serialize)]
struct ResultBody {
 site_id: String,
 epoch_utc: String,
 science_status: &'static str,
 source_warning: &'static str,
 sun_horizon_deg: f64,
 earth_horizon_deg: f64,
 sun_margin_deg: f64,
 earth_margin_deg: f64,
 sun_visible: bool,
 earth_visible: bool,
 simultaneous_visibility: bool,
}

fn direction_valid(d: &LookAngle) -> bool {
 d.azimuth_deg.is_finite() && d.elevation_deg.is_finite()
 && (0.0..360.0).contains(&d.azimuth_deg) && (-90.0..=90.0).contains(&d.elevation_deg)
}
fn validate(req: &Request) -> Result<(), &'static str> {
 if req.site_id.trim().is_empty() || req.site_id.len() > 80 || req.epoch_utc.trim().is_empty() { return Err("invalid site or epoch"); }
 if !direction_valid(&req.sun) || !direction_valid(&req.earth) { return Err("invalid look angle"); }
 if req.provenance.frame != "MOON_ME" || req.provenance.terrain_dataset_id.is_empty() || req.provenance.ephemeris_id.is_empty() {return Err("incomplete provenance metadata");}
 if !(2..=1440).contains(&req.terrain_horizon.len()) {return Err("invalid horizon sample count");}
 let mut previous = -1.0;
 for sample in &req.terrain_horizon {
  if !direction_valid(&LookAngle {azimuth_deg:sample.azimuth_deg,elevation_deg:sample.elevation_deg}) || sample.azimuth_deg <= previous {return Err("invalid horizon azimuth sequence");}
  previous = sample.azimuth_deg;
 }
 Ok(())
}

/// Periodic linear interpolation of a sorted skyline over [0, 360) degrees.
/// This only applies to user-supplied data; it does not ray-cast a DEM.
fn horizon_at(samples: &[Sample], azimuth: f64) -> f64 {
 let i = samples.partition_point(|s| s.azimuth_deg <= azimuth);
 let (left_az, left_el, right_az, right_el) =
  if i == 0 {
   let last = samples.last().unwrap(); let first = &samples[0];
   (last.azimuth_deg - 360.0, last.elevation_deg, first.azimuth_deg, first.elevation_deg)
  } else if i == samples.len() {
   let last = samples.last().unwrap(); let first = &samples[0];
   (last.azimuth_deg, last.elevation_deg, first.azimuth_deg + 360.0, first.elevation_deg)
  } else {
   let left = &samples[i-1]; let right = &samples[i];
   (left.azimuth_deg, left.elevation_deg, right.azimuth_deg, right.elevation_deg)
  };
 left_el + (right_el - left_el) * (azimuth - left_az) / (right_az - left_az)
}
fn evaluate(req: Request) -> Result<ResultBody, &'static str> {
 validate(&req)?;
 let sun_horizon = horizon_at(&req.terrain_horizon,req.sun.azimuth_deg);
 let earth_horizon = horizon_at(&req.terrain_horizon,req.earth.azimuth_deg);
 let sun_margin = req.sun.elevation_deg - sun_horizon;
 let earth_margin = req.earth.elevation_deg - earth_horizon;
 Ok(ResultBody {
  site_id:req.site_id, epoch_utc:req.epoch_utc,
  science_status:"UNVERIFIED_INPUTS",
  source_warning:"Angles and horizon supplied by caller; NASA provenance and physics NOT verified",
  sun_horizon_deg:sun_horizon, earth_horizon_deg:earth_horizon,
  sun_margin_deg:sun_margin, earth_margin_deg:earth_margin,
  sun_visible:sun_margin>=0.0, earth_visible:earth_margin>=0.0,
  simultaneous_visibility:sun_margin>=0.0 && earth_margin>=0.0,
 })
}
fn run() -> Result<(),Box<dyn std::error::Error>> {
 let mut raw=String::new();
 io::stdin().take(131073).read_to_string(&mut raw)?;
 if raw.len()>131072 {return Err("request too large".into());}
 let req:Request=serde_json::from_str(&raw)?;
 let result=evaluate(req).map_err(|e|io::Error::new(io::ErrorKind::InvalidInput,e))?;
 serde_json::to_writer(io::stdout(),&result)?;
 println!();
 Ok(())
}
fn main() {
 if let Err(error)=run() {eprintln!("engine rejected request: {error}");std::process::exit(2);}
}
#[cfg(test)]
mod tests {
 use super::*;
 fn example() -> Request {
  Request {site_id:"synthetic".into(),epoch_utc:"2026-11-14T00:00:00Z".into(),
   sun:LookAngle {azimuth_deg:0.0,elevation_deg:2.0},
   earth:LookAngle {azimuth_deg:180.0,elevation_deg:-1.0},
   terrain_horizon:vec![Sample {azimuth_deg:0.0,elevation_deg:0.0},Sample {azimuth_deg:180.0,elevation_deg:0.0}],
   provenance:Provenance {terrain_dataset_id:"SYNTHETIC".into(),ephemeris_id:"SYNTHETIC".into(),frame:"MOON_ME".into()},
  }
 }
 #[test] fn tests_visibility_and_provenance_flag() {
  let result=evaluate(example()).unwrap();
  assert!(result.sun_visible);assert!(!result.earth_visible);
  assert!(!result.simultaneous_visibility);
  assert_eq!(result.science_status,"UNVERIFIED_INPUTS");
 }
 #[test] fn tests_azimuth_wrap() {
  let samples=vec![Sample {azimuth_deg:90.0,elevation_deg:10.0},Sample {azimuth_deg:270.0,elevation_deg:0.0}];
  assert!((horizon_at(&samples,0.0)-5.0).abs()<1e-12);
  assert!((horizon_at(&samples,360.0-1e-9)-5.0).abs()<1e-8);
 }
 #[test] fn rejects_unsorted_horizons() {
  let mut request=example();request.terrain_horizon.swap(0,1);
  assert!(evaluate(request).is_err());
 }
}
