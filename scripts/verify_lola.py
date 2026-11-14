"""Verify the selected LOLA PDS raster against the repository manifest.

Usage: python3 scripts/verify_lola.py /path/to/ldem_80s_80m.img
"""

import hashlib
import json
import pathlib
import struct
import sys


def verify(path: pathlib.Path, manifest: dict) -> dict:
    dataset = manifest["dataset"]
    raster = dataset["raster"]
    expected_size = raster["lines"] * raster["line_samples"] * (raster["sample_bits"] // 8)
    if expected_size != raster["file_size_bytes"] or raster["sample_type"] != "LSB_INTEGER":
        raise ValueError("unsupported or inconsistent raster manifest")
    if path.stat().st_size != expected_size:
        raise ValueError(f"wrong file size: expected {expected_size} bytes")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if digest.hexdigest() != manifest["verification"]["sha256"]:
        raise ValueError("SHA-256 mismatch")
    with path.open("rb") as stream:
        sample = struct.unpack("<h", stream.read(2))[0]
    return {
        "product": dataset["product_file"],
        "bytes": expected_size,
        "sha256": digest.hexdigest(),
        "first_dn": sample,
        "first_height_m": sample * raster["scaling_factor"],
        "frame": dataset["map_projection"]["coordinate_system_name"],
        "status": "bytes_verified_no_geolocation_or_horizon",
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify_lola.py /path/to/ldem_80s_80m.img")
    manifest = json.loads((pathlib.Path(__file__).resolve().parents[1] / "data/manifest.json").read_text())
    try:
        result = verify(pathlib.Path(sys.argv[1]), manifest)
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
