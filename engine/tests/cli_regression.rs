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

// --- BR105 (#13): polos, antimeridiano e unidades ---
// O motor não tem latitude nem unidade explícita: o contrato declarado é
// azimuth_deg em [0,360) e elevation_deg em [-90,90] (zênite = +90, nadir = -90).

#[test]
fn zenith_and_nadir_pole_elevations_are_accepted_exactly() {
    // Elevação exatamente +90 (zênite) e -90 (nadir) estão no intervalo declarado.
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg": 90.0, "elevation_deg": 90.0});
    let up = evaluate(&req);
    assert_eq!(up["sun_margin_deg"], 80.0);
    assert_eq!(up["sun_visible"], true);

    req["sun"] = json!({"azimuth_deg": 90.0, "elevation_deg": -90.0});
    let down = evaluate(&req);
    assert_eq!(down["sun_margin_deg"], -100.0);
    assert_eq!(down["sun_visible"], false);
}

#[test]
fn pole_elevation_just_outside_range_is_rejected() {
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg": 90.0, "elevation_deg": 90.000001});
    assert!(!run(req.to_string().as_bytes()).status.success());
    req["sun"] = json!({"azimuth_deg": 90.0, "elevation_deg": -90.000001});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn horizon_sample_at_pole_elevation_is_accepted() {
    let mut req = fixture();
    req["terrain_horizon"] = json!([
        {"azimuth_deg": 0.0, "elevation_deg": 90.0},
        {"azimuth_deg": 180.0, "elevation_deg": -90.0}
    ]);
    let out = evaluate(&req);
    assert!(out["sun_horizon_deg"].as_f64().is_some());
}

#[test]
fn azimuth_zero_and_just_below_360_are_the_same_side_of_the_wrap() {
    // Antimeridiano do azimute: 359.999 e 0.0 são vizinhos. Horizonte 0 em 0°,
    // 10 em 359.9: consulta em 359.95 deve interpolar perto de 5, e 0.0 deve dar 0.
    let mut req = fixture();
    req["terrain_horizon"] = json!([
        {"azimuth_deg": 0.0, "elevation_deg": 0.0},
        {"azimuth_deg": 359.9, "elevation_deg": 10.0}
    ]);
    req["sun"] = json!({"azimuth_deg": 359.95, "elevation_deg": 0.0});
    req["earth"] = json!({"azimuth_deg": 0.0, "elevation_deg": 0.0});
    let out = evaluate(&req);
    let sun_h = out["sun_horizon_deg"].as_f64().unwrap();
    // Entre (359.9, 10) e (360, 0): em 359.95 o horizonte é exatamente 5.
    assert!((sun_h - 5.0).abs() < 1e-9, "horizonte em 359.95 deve ser 5, obtido {sun_h}");
    assert_eq!(out["earth_horizon_deg"], 0.0);
}

#[test]
fn azimuth_360_is_rejected_but_359_999_is_accepted() {
    let mut req = fixture();
    // Horizonte da fixture em 359.999 interpola (270,0)-(450,10) ≈ 5: elevação 10 fica visível.
    req["earth"] = json!({"azimuth_deg": 359.999, "elevation_deg": 10.0});
    assert_eq!(evaluate(&req)["earth_visible"], true);
    req["earth"] = json!({"azimuth_deg": 360.0, "elevation_deg": 10.0});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn unit_suffix_other_than_deg_is_rejected_as_unknown_key() {
    // Entrada em radianos com outro nome de campo deve ser recusada (deny_unknown_fields).
    let mut req = fixture();
    req["sun"] = json!({"azimuth_rad": 1.5708, "elevation_rad": 0.1745});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
fn negative_azimuth_in_degrees_is_rejected() {
    // Azimute negativo (ex.: -10 graus) não está no intervalo [0,360) declarado.
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg": -10.0, "elevation_deg": 5.0});
    assert!(!run(req.to_string().as_bytes()).status.success());
}

#[test]
#[ignore = "bug #13-unidades: motor aceita radianos sob campo _deg sem recusar"]
fn radians_passed_under_deg_name_is_a_known_gap() {
    // DEFEITO/LACUNA (#13): o motor não tem como saber a unidade. Um valor em radianos
    // com nome _deg (elevação 0.1745 "graus" = ~10 graus reais) passa e é tratado como grau.
    // Esperado: recusar ou exigir unidade explícita. Hoje passa sem aviso.
    let mut req = fixture();
    req["sun"] = json!({"azimuth_deg": 1.5708, "elevation_deg": 0.1745});
    assert!(!run(req.to_string().as_bytes()).status.success());
}
