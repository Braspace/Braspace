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

// ---- BS-013: poles, angle wrap, dimensional units, degeneracies, invalid inputs ----

fn with_sun(az: f64, el: f64) -> Value {
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg": az, "elevation_deg": el});
    req
}

#[test]
fn zenith_and_nadir_poles_are_accepted_and_azimuth_is_irrelevant_there() {
    // Elevation +-90 deg is the pole of the local sky: azimuth is degenerate.
    // The classifier must accept both limits and keep the margin arithmetic exact.
    for az in [0.0, 90.0, 359.999] {
        let up = evaluate(&with_sun(az, 90.0));
        assert_eq!(up["sun_visible"], true);
        let margin = up["sun_margin_deg"].as_f64().unwrap();
        let horizon = up["sun_horizon_deg"].as_f64().unwrap();
        assert!((margin - (90.0 - horizon)).abs() < 1e-9);
        let down = evaluate(&with_sun(az, -90.0));
        assert_eq!(down["sun_visible"], false);
    }
    // Just past either pole is rejected.
    assert!(!run(with_sun(0.0, 90.000001).to_string().as_bytes()).status.success());
    assert!(!run(with_sun(0.0, -90.000001).to_string().as_bytes()).status.success());
}

#[test]
fn angle_wrap_is_continuous_at_the_0_360_seam() {
    // Horizon samples at 90 and 270 with elevations 10 and 0: the seam at 0/360
    // interpolates 0 -> 10 across 180 deg, so az=0 must equal the midpoint, 5.
    let at_zero = evaluate(&with_sun(0.0, 5.0));
    let just_below = evaluate(&with_sun(359.999999, 5.0));
    let h0 = at_zero["sun_horizon_deg"].as_f64().unwrap();
    let h1 = just_below["sun_horizon_deg"].as_f64().unwrap();
    assert!((h0 - 5.0).abs() < 1e-9, "horizon at az 0 was {h0}");
    assert!((h0 - h1).abs() < 1e-6, "seam jump {h0} vs {h1}");
}

#[test]
fn units_are_degrees_not_radians() {
    // 1.0 is one degree, not one radian: a radian-style value must not be rescaled.
    let out = evaluate(&with_sun(90.0, 1.0));
    assert_eq!(out["sun_horizon_deg"], 10.0);
    assert!((out["sun_margin_deg"].as_f64().unwrap() - (1.0 - 10.0)).abs() < 1e-12);
    assert_eq!(out["sun_visible"], false);
    // Output fields carry the _deg suffix and are plain numbers.
    for key in ["sun_horizon_deg", "earth_horizon_deg", "sun_margin_deg", "earth_margin_deg"] {
        assert!(out[key].is_f64(), "{key} must be a number");
    }
}

#[test]
fn degenerate_flat_horizon_gives_a_constant_horizon_at_any_azimuth() {
    let mut req = fixture();
    req["terrain_horizon"] = json!([
        {"azimuth_deg": 0.0, "elevation_deg": 3.0},
        {"azimuth_deg": 120.0, "elevation_deg": 3.0},
        {"azimuth_deg": 240.0, "elevation_deg": 3.0}
    ]);
    for az in [0.0, 17.3, 119.9999, 120.0, 301.7, 359.9999] {
        req["sun"] = json!({"azimuth_deg": az, "elevation_deg": 3.0});
        let out = evaluate(&req);
        assert!((out["sun_horizon_deg"].as_f64().unwrap() - 3.0).abs() < 1e-12);
        assert_eq!(out["sun_visible"], true, "margin 0 counts as visible at az {az}");
    }
}

#[test]
fn horizon_sample_count_limits_are_2_to_1440() {
    let samples = |n: usize| -> Value {
        Value::Array((0..n).map(|i| json!({"azimuth_deg": i as f64 * 360.0 / n as f64, "elevation_deg": 0.0})).collect())
    };
    let mut req = fixture();
    req["terrain_horizon"] = samples(1440);
    assert!(run(req.to_string().as_bytes()).status.success());
    req["terrain_horizon"] = samples(1441);
    assert!(!run(req.to_string().as_bytes()).status.success());
    req["terrain_horizon"] = json!([]);
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn rejects_non_finite_non_numeric_and_unsorted_inputs() {
    // JSON has no NaN/Infinity literals; the engine must refuse them, strings and nulls.
    for bad in ["NaN", "Infinity", "-Infinity", "\"10\"", "null"] {
        let raw = fixture().to_string().replacen("\"elevation_deg\":10.0", &format!("\"elevation_deg\":{bad}"), 1);
        assert!(!run(raw.as_bytes()).status.success(), "accepted {bad}");
    }
    let raw = fixture().to_string().replacen("\"elevation_deg\":10.0", "\"elevation_deg\":1e999", 1);
    assert!(!run(raw.as_bytes()).status.success(), "accepted 1e999");
    let mut req = fixture();
    req["terrain_horizon"] = json!([
        {"azimuth_deg": 270.0, "elevation_deg": 0.0},
        {"azimuth_deg": 90.0, "elevation_deg": 10.0}
    ]);
    assert!(!run(req.to_string().as_bytes()).status.success(), "unsorted horizon accepted");
}

#[test]
fn rejects_empty_or_overlong_site_id_and_empty_provenance() {
    let mut req = fixture();
    req["site_id"] = json!("   ");
    assert!(!run(req.to_string().as_bytes()).status.success());
    req["site_id"] = json!("x".repeat(81));
    assert!(!run(req.to_string().as_bytes()).status.success());
    req["site_id"] = json!("x".repeat(80));
    assert!(run(req.to_string().as_bytes()).status.success());
    let mut req = fixture();
    req["provenance"]["terrain_dataset_id"] = json!("");
    assert!(!run(req.to_string().as_bytes()).status.success());
}

// ---- Casos trazidos do PR #205 que a main (#201) ainda não cobria ----

#[test]
fn horizon_sample_at_pole_elevation_is_accepted() {
    let mut req = fixture();
    req["terrain_horizon"] = json!([
        {"azimuth_deg": 0.0, "elevation_deg": 90.0},
        {"azimuth_deg": 180.0, "elevation_deg": -90.0}
    ]);
    assert!(evaluate(&req)["sun_horizon_deg"].as_f64().is_some());
}

#[test]
fn horizon_interpolates_between_last_sample_and_first_plus_360() {
    // Amostra em az 0.0 e outra em 359.9: o segmento de fechamento (359.9 -> 360) é curto.
    // Em 359.95 o horizonte vale exatamente 5 (metade de 10 -> 0).
    let mut req = fixture();
    req["terrain_horizon"] = json!([
        {"azimuth_deg": 0.0, "elevation_deg": 0.0},
        {"azimuth_deg": 359.9, "elevation_deg": 10.0}
    ]);
    req["sun"] = json!({"azimuth_deg": 359.95, "elevation_deg": 0.0});
    req["earth"] = json!({"azimuth_deg": 0.0, "elevation_deg": 0.0});
    let out = evaluate(&req);
    let h = out["sun_horizon_deg"].as_f64().unwrap();
    assert!((h - 5.0).abs() < 1e-9, "horizonte em 359.95 deve ser 5, obtido {h}");
    assert_eq!(out["earth_horizon_deg"], 0.0);
}

#[test]
fn earth_azimuth_360_is_rejected_but_359_999_is_accepted() {
    // Mesma regra de [0,360) vale para o campo `earth`, não só para `sun`.
    let mut req = fixture();
    req["earth"] = json!({"azimuth_deg": 359.999, "elevation_deg": 10.0});
    assert_eq!(evaluate(&req)["earth_visible"], true);
    req["earth"] = json!({"azimuth_deg": 360.0, "elevation_deg": 10.0});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn unit_suffix_other_than_deg_is_rejected_as_unknown_key() {
    let mut req = fixture();
    req["sun"] = json!({"azimuth_rad": 1.5708, "elevation_rad": 0.1745});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn negative_azimuth_in_degrees_is_rejected() {
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg": -10.0, "elevation_deg": 5.0});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

