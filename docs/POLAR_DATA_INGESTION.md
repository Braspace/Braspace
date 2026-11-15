# BRASPACE | South-pole data, visual references and scientific-ingestion gate

**Status (2026-11-14):** source catalog and analysis plan. NOT trained, NOT a new physics implementation, NOT independently scientifically validated.

Machine-readable catalog: [`data/POLAR_SOURCE_EVIDENCE.json`](../data/POLAR_SOURCE_EVIDENCE.json).
The catalog contains 12 official source or reference entries and SHA-256/size/dimensions for 5 user-provided screenshots. The original images and large scientific binaries have NOT been committed or redistributed.

## Correcting the source list

The user-supplied string `svs.gsfc.nasa.gov/5127lpi.usra.edu/lunar/lunar-south-pole-atlas` concatenated two different URLs:
- NASA SVS: https://svs.gsfc.nasa.gov/5127
- LPI South Pole Atlas: https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/

Current LROC site links: https://lroc.im-ldi.com/images and https://quickmap.im-ldi.com/ (catalog page; verify exact image product identifiers separately). For LROC website-featured imagery, follow https://www.lroc.im-ldi.com/about/terms; **LROC PDS data** and **copyrighted website showcase images** have distinct rights. The URLs above are discovery/reference links, not direct DEMs or permissions to mass download.

## Interpreting the five screenshots without inventing scientific data

| Reference | What is visible | Safe application use | Forbidden interpretation |
| --- | --- | --- | --- |
| REF-01 | Color-coded south-pole elevation overview with Shackleton, Shoemaker, Sverdrup, de Gerlache and Slater | UI placement, cartographic palette, geographic nomenclature | Pixel color -> raw elevation without original legend, raster, projection and datum |
| REF-02 | Oblique 3D lunar terrain with named craters, Mons Mouton and Malapert | 3D camera framing, terrain labels, educational context | Recover absolute DEM heights from oblique rendering |
| REF-03 | Average Sun visibility graphic, 0-1 color scale, candidate-area rectangles and km axes | UX mockup for model *outputs*, candidate region comparison | Treat color as site-and-date visibility probability absent original dataset, time range and methodology |
| REF-04 | Earth above horizon and labeled lunar features; image visibly credits JAXA/NHK | Explain why local horizon determines Earth visibility | Certify line-of-sight duration, communications link budget or right to redistribute |
| REF-05 | Celestial Mapping System interface with orbital landing-site overlay | UI inspiration: layers, terrain profile, viewshed, coordinates, measurement | Claim CMS output or a displayed IM-1 historical footprint is a selected BRASPACE landing site |

**Image attribution is not established merely because the uploader named NASA or shared a related link.** REF-04 carries a visible JAXA/NHK credit; the other screenshots also require exact original provenance/licensing before publication. These uploads are references, not model-training inputs.

## Reality check for numeric sources

- **Current primary MVP source:** native PDS LOLA `LDEM_80S_80M.IMG` (80 m/pixel), documented with exact hash in [existing verification](../data/LOLA_80S_80M_VERIFICATION.md). Its existence does not prove an operational scientific pipeline.
- **Next terrain source:** PGDA [high-resolution 5 m/pixel products](https://pgda.gsfc.nasa.gov/products/78) and [5 m/pixel south-pole mosaic](https://pgda.gsfc.nasa.gov/products/81). Their effective terrain detail and model uncertainty depend on measurement density and interpolation. Every source must retain its own no-data masks, count map, slope uncertainty and vertical reference.
- **Optional enhanced detail:** PGDA [shape-from-shading DEMs](https://pgda.gsfc.nasa.gov/products/104); their photometric inference can complement LOLA but is not direct altimetry.
- **Optical/PSR imagery:** [LROC native PDS products](https://data.lroc.im-ldi.com/lroc/) and [ShadowCam calibrated archive](https://shadowcam.im-ldi.com/archive). ShadowCam brightness does not itself prove water ice.
- **ISRO OHRC:** [PRADAN](https://pradan.issdc.gov.in/ch2/) lists imagery, but [ISRO terms](https://pradan.issdc.gov.in/ch2/disclaimer.xhtml) assert copyright and non-commercial scientific-use limits; block redistribution and model training until permission/terms are resolved.
- **Coverage trap:** USGS [SLDEM2015](https://fdp.astrogeology.usgs.gov/fdp/moon/) is described as extending from latitude 60°S to 60°N, so it cannot be the primary DEM at 87–90°S. Do not extrapolate it into the polar region.
- **Interactive explorers:** [Moon Trek](https://trek.nasa.gov/moon/) and [LROC QuickMap](https://quickmap.im-ldi.com/) help identify and compare source products. Moon Trek's advanced planning tools can require registered access. Do not substitute explorer screenshots/tiles for original instrument products.

## Scientific flow and acceptance gates

1. **Acquisition (data owner):** Select exact original PDS/PGDA product and label; record `product_id`, version, source URL, acquisition time (when applicable), size, SHA-256, units, nominal and effective resolution, datum, CRS, longitude convention, nodata semantics, restrictions and citeable source.
2. **Projection and terrain (science owner):** Decode physical height values and pixel registration from source metadata, transform planetocentric site coordinates to the corresponding polar stereographic grid, test pixel centers and reversibility. Keep DEM, slope and source-density/uncertainty layers distinct.
3. **Local horizon (science owner):** Calculate terrain skyline for observer location/height over many azimuths with lunar curvature, a documented range and interpolation rule; test 40 m half-pixel shifts and extend ray reach beyond only 30 km where distant ridges matter. Compare two implementations or independent reference to quantify residuals; pass unknown/no-data as unavailable.
4. **Celestial geometry (science owner):** Pin NAIF SPICE kernels, time conversions and Moon body-fixed frame. Compute topocentric Sun/Earth directions with documented light-time/aberration choices; compare selected epochs and angles with JPL Horizons. Handle finite solar disc and Earth-disc visibility only when implemented and tested.
5. **Mission metrics (Go/Rust owners):** For each location and time grid, calculate `sun_visible`, `earth_visible`, contiguous darkness and blackout duration; add conservative power and communications margins only when panel geometry/hardware and link budget assumptions are declared. Do not infer visibility from elevation-color screenshots.
6. **Replanning (API/onboard):** Perturb landing time, location, observer height, terrain error, degraded power, or antenna downtime; report alternative **candidate scenarios**, never guaranteed safe touchdown points. If inputs lack native provenance or science validation, propagate `UNVERIFIED` / `UNVERIFIED_INPUTS`.
7. **UI and evidence:** Show polar DEM, rim labels, scientific/visual layer attribution, Sun/Earth horizon plots, separate physical units, uncertainty ranges and an immutable evidence passport (hashes, kernels, epochs, code commit). Provide CSV/GeoJSON/report export with a visible scientific status.

The current science effort is being developed separately in PR [#75](https://github.com/Braspace/Braspace/pull/75), with corrective work in [#86](https://github.com/Braspace/Braspace/pull/86), and grid/integrity work in PR [#76](https://github.com/Braspace/Braspace/pull/76) and [#85](https://github.com/Braspace/Braspace/pull/85). This catalog changes **none** of those physics or API files; review and integration are required before scientific claims.

## If ML training is pursued

**Do not train a numerical landing-safety model on the five screenshots.** Physical labels should come from calibrated, time-indexed original products and a validated simulator. If training a segmentation or detection model for imagery, obtain per-product reuse/ML rights, PDS geometry and annotations, and split train/validation/test geographically **and temporally** (not adjacent pixels from one crater in both sets). Publish provenance, held-out locations, no-data masks, leakage check, label confidence, class imbalance, uncertainty and calibration results. A model trained on rendered visuals is suitable only for illustration/recognition tasks, not for unqualified predictions about sunlight, energy, terrain safety or Earth line-of-sight.

## Reproducible QA

```sh
python3 scripts/validate_polar_source_evidence.py
python3 -m unittest discover -s tests -p 'test_polar_source_evidence.py'
# Only in the original chat upload environment with access to all five files:
python3 scripts/validate_polar_source_evidence.py --verify-uploads /path/to/original/uploads
```

The validator is an **offline catalog integrity gate**. It checks source/ref uniqueness, HTTPS locators, coverage exclusion for SLDEM2015, fingerprint metadata and the prohibition against treating screenshots as science ground truth. With `--verify-uploads` it additionally recomputes all five SHA-256 values, otherwise it does not pretend to have inspected image files. It does not download data, interpret DEMs, reproduce ephemerides or validate landing-site physics.

## Done versus not done

- Done: cited source mapping, declared rights caveats, deduplicated catalog, five image fingerprints, reproducible catalog checks.
- Not done: rights clearance, native LROC/PGDA/ShadowCam batch downloads, geospatial reprojection, real 5 m/px science run, model training, independent scientific validation, flight qualification or production integration.
