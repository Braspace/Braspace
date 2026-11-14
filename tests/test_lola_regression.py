"""Property-style offline regressions for the LOLA byte verifier.

These tests verify bytes, checksums and sample decoding. They do not validate
the geographic registration, SPICE geometry or any landing-site forecast.
"""
import copy
import hashlib
import pathlib
import struct
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from verify_lola import verify  # noqa: E402


def synthetic_manifest(raw):
    return {
        "dataset": {
            "product_file": "synthetic-test-only.img",
            "raster": {
                "lines": 1,
                "line_samples": len(raw) // 2,
                "sample_bits": 16,
                "sample_type": "LSB_INTEGER",
                "file_size_bytes": len(raw),
                "scaling_factor": 0.5,
            },
            "map_projection": {"coordinate_system_name": "SYNTHETIC-NOT-NASA"},
        },
        "verification": {"sha256": hashlib.sha256(raw).hexdigest()},
    }


class LOLAByteVerifierRegression(unittest.TestCase):
    def test_signed_int16_extremes_and_endianness(self):
        for digital_number in (-32768, -42, 0, 42, 32767):
            with self.subTest(digital_number=digital_number):
                raw = struct.pack("<h", digital_number)
                manifest = synthetic_manifest(raw)
                with tempfile.TemporaryDirectory() as tmp:
                    source = pathlib.Path(tmp) / "fixture.img"
                    source.write_bytes(raw)
                    result = verify(source, manifest)
                self.assertEqual(result["first_dn"], digital_number)
                self.assertEqual(result["first_height_m"], digital_number * 0.5)
                self.assertEqual(result["status"], "bytes_verified_no_geolocation_or_horizon")
                self.assertEqual(result["frame"], "SYNTHETIC-NOT-NASA")

    def test_corruption_is_detected_even_with_same_byte_length(self):
        raw = struct.pack("<4h", -10, 20, 30, 40)
        manifest = synthetic_manifest(raw)
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp) / "fixture.img"
            source.write_bytes(raw[:-1] + bytes([raw[-1] ^ 0xFF]))
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                verify(source, manifest)

    def test_truncated_and_extended_payloads_are_rejected(self):
        raw = struct.pack("<2h", 1, 2)
        manifest = synthetic_manifest(raw)
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp) / "fixture.img"
            for payload in (raw[:-1], raw + b"\\x00"):
                with self.subTest(length=len(payload)):
                    source.write_bytes(payload)
                    with self.assertRaisesRegex(ValueError, "wrong file size"):
                        verify(source, manifest)

    def test_invalid_manifest_shape_and_sample_type_fail_closed(self):
        raw = struct.pack("<2h", 1, 2)
        manifest = synthetic_manifest(raw)
        cases = [
            ("bad_size", lambda m: m["dataset"]["raster"].update(file_size_bytes=10)),
            ("wrong_type", lambda m: m["dataset"]["raster"].update(sample_type="MSB_INTEGER")),
            ("wrong_dimensions", lambda m: m["dataset"]["raster"].update(lines=7)),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            source = pathlib.Path(tmp) / "fixture.img"
            source.write_bytes(raw)
            for name, mutate in cases:
                with self.subTest(name=name):
                    altered = copy.deepcopy(manifest)
                    mutate(altered)
                    with self.assertRaisesRegex(ValueError, "unsupported or inconsistent raster manifest"):
                        verify(source, altered)


if __name__ == "__main__":
    unittest.main()
