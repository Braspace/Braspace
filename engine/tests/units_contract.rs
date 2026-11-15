// Unit contract of the engine (issue #200, decision by the science owner).
//
// Every angle field is in DEGREES and its name ends in `_deg`. The engine does not, and must not, guess the
// unit from the magnitude: at the lunar south pole the Sun's elevation stays within a few degrees of zero
// (the sub-solar latitude is within about 1.6 deg of the equator), so values such as 0.17 or 1.57 are
// ordinary degree values there. Rejecting "values that look like radians" would reject real polar geometry.
// What the engine does guarantee: a request cannot name another unit, and nothing is rescaled.
// Inputs are synthetic; these tests execute the real CLI.
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn fixture() -> Value {
    json!({
        "site_id": "synthetic-units",
        "epoch_utc": "2026-11-14T12:00:00Z",
        "sun": {"azimuth_deg": 90.0, "elevation_deg": 10.0},
        "earth": {"azimuth_deg": 270.0, "elevation_deg": -1.0},
        "terrain_horizon": [
            {"azimuth_deg": 90.0, "elevation_deg": 10.0},
            {"azimuth_deg": 270.0, "elevation_deg": 0.0}
        ],
        "provenance": {"terrain_dataset_id": "SYNTHETIC-TEST", "ephemeris_id": "SYNTHETIC-TEST", "frame": "MOON_ME"}
    })
}

fn run(request: &Value) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_braspace-lunar-engine"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start Rust engine");
    child.stdin.take().expect("stdin").write_all(request.to_string().as_bytes()).expect("write request");
    child.wait_with_output().expect("wait for engine")
}

#[test]
fn small_values_are_degrees_and_are_valid_polar_geometry() {
    // The pair from issue #200: pi/2 and 10 deg written in radians. Read as degrees they are a Sun 0.17 deg
    // above the horizontal at azimuth 1.57 deg, which is a normal situation at the pole. It must be accepted
    // and evaluated as degrees.
    let mut request = fixture();
    request["sun"] = json!({"azimuth_deg": 1.5708, "elevation_deg": 0.1745});
    let out = run(&request);
    assert!(out.status.success(), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    let result: Value = serde_json::from_slice(&out.stdout).expect("JSON");
    // Horizon between the samples at 270 deg (0) and 90 + 360 deg (10), evaluated at 361.5708 deg.
    let expected_horizon = 10.0 * (1.5708 + 360.0 - 270.0) / 180.0;
    let horizon = result["sun_horizon_deg"].as_f64().unwrap();
    let margin = result["sun_margin_deg"].as_f64().unwrap();
    assert!((horizon - expected_horizon).abs() < 1e-9, "horizon {horizon}");
    assert!((margin - (0.1745 - expected_horizon)).abs() < 1e-9, "margin {margin}");
    // Had the pair been converted from radians (azimuth 90 deg, elevation 10 deg) the margin would be 0.
    assert!(margin < -4.0);
    assert_eq!(result["sun_visible"], false);
}

#[test]
fn a_request_cannot_declare_or_use_another_unit() {
    // Unknown keys are refused everywhere, so there is no way to send radians under their own name
    // or to attach a unit that the engine would silently ignore.
    let mut top = fixture();
    top["angle_unit"] = json!("rad");
    assert!(!run(&top).status.success());

    let mut nested = fixture();
    nested["sun"] = json!({"azimuth_deg": 90.0, "elevation_deg": 10.0, "unit": "rad"});
    assert!(!run(&nested).status.success());

    let mut renamed = fixture();
    renamed["sun"] = json!({"azimuth_rad": 1.5708, "elevation_rad": 0.1745});
    assert!(!run(&renamed).status.success());

    let mut horizon = fixture();
    horizon["terrain_horizon"][0] = json!({"azimuth_rad": 1.5708, "elevation_deg": 10.0});
    assert!(!run(&horizon).status.success());
}

#[test]
fn degree_ranges_are_enforced_at_their_exact_limits() {
    // 2*pi is a valid azimuth in degrees; 360 is not (azimuth is [0, 360)). Elevation is [-90, 90].
    for (az, el, ok) in [(6.283185307179586, 0.0, true), (359.999999, 90.0, true), (360.0, 0.0, false),
                         (-0.000001, 0.0, false), (0.0, 90.000001, false), (0.0, -90.000001, false)] {
        let mut request = fixture();
        request["sun"] = json!({"azimuth_deg": az, "elevation_deg": el});
        assert_eq!(run(&request).status.success(), ok, "azimuth {az}, elevation {el}");
    }
}
