# BS-002 — Verified NASA LOLA south-pole dataset

Status: verified dataset selection for the BRASPACE MVP.

Validation date: 2026-11-14 (America/Sao_Paulo)

## Selected product

The single dataset selected for the first terrain and horizon demonstration is
the NASA LRO/LOLA south-polar GDR product:

| Field | Verified value |
| --- | --- |
| Product | `LDEM_80S_80M.IMG` |
| Label | `LDEM_80S_80M.LBL` |
| PDS dataset ID | `LRO-L-LOLA-4-GDR-V1.0` |
| Product version | `V2.0` |
| Coverage | 80°S to 90°S |
| Dimensions | 7,600 × 7,600 samples |
| Record layout | 7,600 records × 15,200 bytes |
| File size | 115,520,000 bytes |
| Sample encoding | 16-bit `LSB_INTEGER` |
| Measurement unit | metre, relative to the reference radius |
| Scaling factor | `0.5` metre per DN |
| Reference radius | 1,737,400 m |
| Projection | Polar Stereographic |
| Coordinate convention | Planetocentric latitude; east-positive longitude |
| Body-fixed frame | Mean Earth/Polar Axis of DE421 |

The product label is the authoritative source for the binary interpretation.
It defines:

```text
HEIGHT_m = DN * 0.5
PLANETARY_RADIUS_m = (DN * 0.5) + 1737400
```

The source file itself is not committed to Git. The local file and the file
downloaded from the official PDS URL both produced this SHA-256:

```text
e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc
```

This checksum identifies the bytes validated on 2026-11-14. It is not claimed
to be a PDS-issued checksum or a permanent content identifier.

## Official source URLs

- Product directory: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/>
- Binary product: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img>
- PDS3 label: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl>
- PDS XML label: <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.xml>
- LOLA mission/data page: <https://pds-geosciences.wustl.edu/missions/lro/lola.htm>

## Reproducible verification

The following commands download the product to a local directory, keep the
label beside the binary, and verify the expected size and checksum. The
115 MB binary should remain outside the Git repository.

```bash
set -eu

base="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
mkdir -p data/raw/lola

curl -fL "$base/ldem_80s_80m.img" -o data/raw/lola/ldem_80s_80m.img
curl -fL "$base/ldem_80s_80m.lbl" -o data/raw/lola/ldem_80s_80m.lbl

test "$(stat -c '%s' data/raw/lola/ldem_80s_80m.img)" = "115520000"
test "$(sha256sum data/raw/lola/ldem_80s_80m.img | cut -d ' ' -f 1)" = \
  "e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc"

grep -E 'DATA_SET_ID|PRODUCT_VERSION_ID|LINES|LINE_SAMPLES|SAMPLE_TYPE|SAMPLE_BITS|SCALING_FACTOR|OFFSET|MAP_PROJECTION_TYPE|CENTER_LATITUDE|CENTER_LONGITUDE|MAP_SCALE' \
  data/raw/lola/ldem_80s_80m.lbl
```

Observed verification results:

```text
IMG size: 115520000 bytes
IMG SHA-256: e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc
LBL size: 4986 bytes
```

## Provenance, attribution and limits

The product was produced by the NASA LOLA team at Goddard Space Flight Center
and is archived by the PDS Geosciences Node. BRASPACE should preserve the
original label, cite NASA/LRO/LOLA and the PDS Geosciences Node, and verify the
applicable PDS/NASA reuse terms before redistributing derived assets. This
document does not assign a separate license that is not stated by the product
label and does not imply NASA endorsement.

This verification proves dataset identity and binary interpretation. It does
not prove that the BRASPACE application has integrated the raster, calculated
a horizon, or produced mission-grade landing recommendations. Those are later
implementation and validation steps.

## BS-002 acceptance mapping

- Real NASA dataset: verified `LDEM_80S_80M.IMG` and matching PDS label.
- Source and provenance: official PDS URLs and LRO/LOLA/GSFC provenance recorded.
- Size and format: verified from the file and label.
- Checksum: local and freshly downloaded PDS bytes match.
- Reproducible fetch: commands above.
- Binary interpretation: dimensions, endianess, scaling, offset and projection recorded.
- Large-file policy: binary excluded from Git; only metadata and evidence are committed.
- Scientific claim boundary: no terrain integration or NASA validation claimed.
