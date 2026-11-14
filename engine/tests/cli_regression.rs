// Integration tests execute the real Rust CLI, not a mocked implementation.
// Inputs are deliberately synthetic and are NOT NASA-validated predictions.
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn fixture() -> Value {
    json!({
        "site_id": "synthetic-regression",
        "epoch_utc": "2026-11-14T12:00:00Z",
        "sun": {"azimuth_deg": 90.0, "elevation_deg": 10.0},
        "earth": {"azimuth_deg": 270.0, "elevation_deg": -1.0},
        "terrain_horizon": [
            {"azimuth_deg":90.0, "elevation_deg":10.0},
            {"azimuth_deg":270.0, "elevation_deg":0.0}
        ],
        "provenance": {
            "terrain_dataset_id":"SYNTHETIC-TEST",
            "ephemeris_id":"SYNTHETIC-TEST",
            "frame":"MOON_ME"
        }
    })
}

fn run(raw: &[u8]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_braspace-lunar-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start Rust engine");
    child.stdin.take().expect("stdin").write_all(raw).expect("write fixture");
    child.wait_with_output().expect("wait for engine")
}

fn evaluate(request: &Value) -> Value {
    let out = run(serde_json::to_string(request).unwrap().as_bytes());
    assert!(out.status.success(), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    serde_json::from_slice(&out.stdout).expect("valid JSON response")
}

#[test]
fn equality_to_horizon_is_visible_but_not_flight_verified() {
    let result = evaluate(&fixture());
    assert_eq!(result["sun_horizon_deg"], 10.0);
    assert_eq!(result["sun_margin_deg"], 0.0);
    assert_eq!(result["sun_visible"], true);
    assert_eq!(result["earth_visible"], false);
    assert_eq!(result["simultaneous_visibility"], false);
    assert_eq!(result["science_status"], "UNVERIFIED_INPUTS");
    assert!(result["source_warning"].as_str().unwrap().contains("NOT verified"));
}

#[test]
fn periodic_horizon_wraps_across_north() {
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg":0.0,"elevation_deg":5.0});
    req["earth"] = json!({"azimuth_deg":359.0,"elevation_deg":4.0});
    let output = evaluate(&req);
    assert!((output["sun_horizon_deg"].as_f64().unwrap() - 5.0).abs() < 1e-10);
    assert_eq!(output["sun_visible"], true);
    assert_eq!(output["earth_visible"], false);
}

#[test]
fn rejects_invalid_angle_range_and_duplicate_azimuths() {
    let mut req = fixture();
    req["sun"]["azimuth_deg"] = json!(360.0);
    assert!(!run(req.to_string().as_bytes()).status.success());
    let mut req = fixture();
    req["sun"]["elevation_deg"] = json!(-91.0);
    assert!(!run(req.to_string().as_bytes()).status.success());
    let mut req = fixture();
    req["terrain_horizon"][1]["azimuth_deg"] = json!(90.0);
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn rejects_unknown_keys_and_untrusted_frame() {
    let mut req = fixture();
    req["unexpected"] = json!(true);
    assert!(!run(req.to_string().as_bytes()).status.success());
    let mut req = fixture();
    req["provenance"]["frame"] = json!("J2000");
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn rejects_short_horizon_malformed_json_and_oversized_body() {
    let mut req = fixture();
    req["terrain_horizon"] = json!([{"azimuth_deg":90.0,"elevation_deg":10.0}]);
    assert!(!run(req.to_string().as_bytes()).status.success());
    assert!(!run(b"{not-json").status.success());
    assert!(!run(&vec![b' '; 131073]).status.success());
}

#[test]
fn replay_is_byte_for_byte_deterministic() {
    let raw = fixture().to_string();
    let a = run(raw.as_bytes());
    let b = run(raw.as_bytes());
    assert!(a.status.success() && b.status.success());
    assert_eq!(a.stdout, b.stdout);
}
