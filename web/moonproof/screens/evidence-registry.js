// Copy of the fields used from data/ASSET_REGISTRY.json and the table of docs/ASSET_LICENSE_MATRIX.md.
// Static pages cannot read those repo files, so tests/evidence-registry.test.mjs fails when this copy drifts from them.
export const REGISTRY = {
    "registry_version": "1.0.0",
    "reviewed_at": "2026-11-14",
    "assets": [
        {
            "asset_id": "nasa-svs-cgi-moon-kit-lroc-color-2k-2025",
            "category": "global_albedo_visualization",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "lroc_color_2k.jpg",
            "sha256": "f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170",
            "author_credit": "NASA Scientific Visualization Studio; visualizer Ernie Wright; scientist Noah Petro (NASA/GSFC); source LROC WAC Color Mosaic collected by Arizona State University",
            "redistribution_status": "approved_candidate",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "nasa-svs-14959-moon-small-glb-2026",
            "category": "visual_model_3d",
            "source_page": "https://svs.gsfc.nasa.gov/14959/",
            "file_id": "moon_small.glb",
            "sha256": "12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4",
            "author_credit": "NASA's Goddard Space Flight Center; NASA SVS 14959 (producer Dan Gallagher); made with LRO imagery; color source CGI Moon Kit (SVS 4720)",
            "redistribution_status": "approved_candidate",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "nasa-svs-cgi-moon-kit-lroc-color-4k-2025",
            "category": "global_albedo_visualization",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "lroc_color_16bit_srgb_4k.tif",
            "sha256": "9731fa8af425b6c2f88f277ecca82bf8c603f3743894f64ed7b25c5bfefa22ff",
            "author_credit": "NASA Scientific Visualization Studio; visualizer Ernie Wright; scientist Noah Petro (NASA/GSFC); source LROC WAC Color Mosaic collected by Arizona State University",
            "redistribution_status": "approved_candidate",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "nasa-svs-cgi-moon-kit-lola-dem-4",
            "category": "global_dem_render",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "ldem_4.tif",
            "sha256": "330afa2556a86fd05ac6ba2f912f246600fdade35de2a0d90593d50d07b01b65",
            "author_credit": "NASA Scientific Visualization Studio; LRO LOLA data source",
            "redistribution_status": "approved_candidate",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "lroc-pds-archive",
            "category": "lroc_pds_source",
            "source_page": "https://lroc.im-ldi.com/about/terms",
            "file_id": null,
            "sha256": null,
            "author_credit": "NASA/GSFC/Arizona State University; LROC Science Operations Center",
            "redistribution_status": "source_approved_product_specific_review_required",
            "scientific_role": "potential_science_source"
        },
        {
            "asset_id": "lroc-featured-image-1276",
            "category": "lroc_website_showcase",
            "source_page": "https://lroc.im-ldi.com/images/1276",
            "file_id": "LROC image page 1276",
            "sha256": null,
            "author_credit": "NASA/GSFC/Arizona State University",
            "redistribution_status": "external_link_only",
            "scientific_role": "illustrative_only"
        },
        {
            "asset_id": "lroc-quickmap-and-lunaserv",
            "category": "interactive_service",
            "source_page": "https://lroc.im-ldi.com/about/terms",
            "file_id": null,
            "sha256": null,
            "author_credit": "LROC Science Operations Center",
            "redistribution_status": "service_link_only",
            "scientific_role": "discovery_and_validation_reference"
        },
        {
            "asset_id": "google-map-tiles",
            "category": "restricted_external_tiles",
            "source_page": "https://developers.google.com/maps/documentation/tile/policies",
            "file_id": null,
            "sha256": null,
            "author_credit": "Google and applicable third-party providers",
            "redistribution_status": "rejected",
            "scientific_role": "not_used"
        },
        {
            "asset_id": "pgda-78-site01-5mpp-ldem",
            "category": "polar_dem_5m_site",
            "source_page": "https://pgda.gsfc.nasa.gov/products/78",
            "file_id": "Site01_final_adj_5mpp_surf.tif",
            "sha256": null,
            "author_credit": "Michael Kenneth Barker (author on page); NASA Official Erwan Mazarico; NASA GSFC PGDA",
            "redistribution_status": "review_required",
            "scientific_role": "candidate_high_res_terrain; ~90% of 5 m pixels are interpolated per the page; not ingested"
        },
        {
            "asset_id": "pgda-81-south-pole-87s-mosaic-5mpp",
            "category": "polar_dem_5m_mosaic",
            "source_page": "https://pgda.gsfc.nasa.gov/products/81",
            "file_id": "ldem_87s_5mpp.tif",
            "sha256": null,
            "author_credit": "Michael Kenneth Barker; NASA Official Erwan Mazarico",
            "redistribution_status": "review_required",
            "scientific_role": "candidate_terrain_context; not ingested; too large for browser"
        },
        {
            "asset_id": "pgda-69-avgvisib-85s-60m",
            "category": "polar_illumination_map",
            "source_page": "https://pgda.gsfc.nasa.gov/products/69",
            "file_id": "AVGVISIB_85S_060M_201608.TIF",
            "sha256": "ccf67d4f39e0a970c111196da7d6551ffcf50d075470b93067fb3904c0b05806",
            "author_credit": "Erwan Mazarico (page author); LOLA team; PDS Geosciences Node",
            "redistribution_status": "review_required",
            "scientific_role": "candidate_independent_benchmark_for_horizon_gates_G4_G5; averages over ~18.6 yr nutation cycle at hourly steps, NOT a time series for a 2026-12 window; not ingested"
        },
        {
            "asset_id": "nasa-svs-5127-lola-south-pole-coded-color",
            "category": "visualization_still",
            "source_page": "https://svs.gsfc.nasa.gov/5127",
            "file_id": "lola_sp_still_print.jpg",
            "sha256": "9c9d4cca94425c041217dca09a0fb44962968c0cdf9d7babbf0a6058fca3ed8b",
            "author_credit": "Please give credit for this item to: NASA's Scientific Visualization Studio. Visualizers Ernie Wright (STC), Alex Kekesi (GST); Producer David Ladd; Scientist Noah Petro (NASA/GSFC)",
            "redistribution_status": "approved_candidate",
            "scientific_role": "visualization_only (quality target for front); elevation colours are not visibility science"
        },
        {
            "asset_id": "lroc-curated-nac-south-pole-mosaic",
            "category": "polar_imagery_mosaic",
            "source_page": "https://lroc.im-ldi.com/images/downloads",
            "file_id": "NAC_POLE_P900S0000.zip",
            "sha256": null,
            "author_credit": "NASA/GSFC/Arizona State University",
            "redistribution_status": "external_link_only",
            "scientific_role": "none; 189 GB, far outside P0"
        },
        {
            "asset_id": "lroc-curated-polar-illumination-map",
            "category": "polar_psr_illumination_map",
            "source_page": "https://lroc.im-ldi.com/images/downloads",
            "file_id": "LROC_Polar_Illumination_Map.tif",
            "sha256": null,
            "author_credit": "NASA/GSFC/Arizona State University",
            "redistribution_status": "external_link_only",
            "scientific_role": "none (page text: 'Illumination maps for the lunar north and south poles derived from LROC WAC images'); the page does not say it is a PSR layer"
        },
        {
            "asset_id": "lroc-wac-south-pole-mosaic-image-237",
            "category": "polar_imagery_page",
            "source_page": "https://lroc.im-ldi.com/images/237",
            "file_id": null,
            "sha256": null,
            "author_credit": "NASA/GSFC/Arizona State University",
            "redistribution_status": "external_link_only",
            "scientific_role": "none"
        },
        {
            "asset_id": "usgs-sldem2015-60n60s-not-polar",
            "category": "global_dem_not_for_pole",
            "source_page": "https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m",
            "file_id": "Lunar_LRO_LOLAKaguya_DEMmerge_60N060S_512ppd.tif",
            "sha256": null,
            "author_credit": "Page: 'Please credit NASA's LOLA Team and JAXA's SELENE/Kaguya Team.'",
            "redistribution_status": "review_required",
            "scientific_role": "NOT_APPLICABLE_AT_POLE: covers latitudes within +/-60 deg only"
        },
        {
            "asset_id": "braspace-terrain-shade-87s",
            "category": "project_derived_terrain_background",
            "source_page": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "file_id": "terrain-shade-87s.webp",
            "sha256": "43fef36738628d83a03450e786e7c676b7e597539930b02005bfdfbf4457378d",
            "author_credit": "Elevation: NASA/GSFC/LOLA (LRO LOLA LDEM_80S_80M). Rendering: BRASPACE (science/render_terrain_backgrounds.py).",
            "redistribution_status": "project_derived_from_nasa_pds",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-terrain-shade-84s",
            "category": "project_derived_terrain_background",
            "source_page": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "file_id": "terrain-shade-84s.webp",
            "sha256": "8cf3eae7b2edd61cf06d95eca040aabe76a6cef3b85936ccb76fb53a5f1bf4e9",
            "author_credit": "Elevation: NASA/GSFC/LOLA (LRO LOLA LDEM_80S_80M). Rendering: BRASPACE (science/render_terrain_backgrounds.py).",
            "redistribution_status": "project_derived_from_nasa_pds",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-terrain-altitude-87s",
            "category": "project_derived_terrain_background",
            "source_page": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "file_id": "terrain-altitude-87s.webp",
            "sha256": "1e09edb121a2b6f5de0a0985844c7e8e85dada75f0f2afe805b73a5a6a9a7a6a",
            "author_credit": "Elevation: NASA/GSFC/LOLA (LRO LOLA LDEM_80S_80M). Rendering: BRASPACE (science/render_terrain_backgrounds.py).",
            "redistribution_status": "project_derived_from_nasa_pds",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "iau-usgs-moon-nomenclature-south-pole",
            "category": "polar_feature_names",
            "source_page": "https://planetarynames.wr.usgs.gov/",
            "file_id": "features.json",
            "sha256": "126d1918965a73e0379ede8b650afa2295a13e48fce7c47c0ef7e4bdcd584309",
            "author_credit": "IAU Gazetteer of Planetary Nomenclature, USGS Astrogeology Science Center. Source file MOON_nomenclature_center_pts.zip (metadata pubdate 2012-10-02, public domain), accessed 2026-11-14 UTC.",
            "redistribution_status": "public_domain_source_cited",
            "scientific_role": "labels_only"
        },
        {
            "asset_id": "braspace-moonhd-color-4k",
            "category": "global_albedo_visualization",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "color_4k.jpg",
            "sha256": "4d579d6e85e1f81e95ec8b9922f6fde251ec3ba8e63c8f3ce30c002abd99203c",
            "author_credit": "NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LROC WAC colour mosaic (Arizona State University). Resampling: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_svs",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-color-8k",
            "category": "global_albedo_visualization",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "color_8k.jpg",
            "sha256": "5b8c60f57ef2b4f9c27b1eb3e73d2a9c472458dcd7a7c5f4e561ed8214aa3056",
            "author_credit": "NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LROC WAC colour mosaic (Arizona State University). Resampling: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_svs",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-height-4k",
            "category": "global_relief_visualization",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "height_4k.jpg",
            "sha256": "1b427d5c427dd58b74fdb85ff7ba3abfd2e7872d92c598818c969cd6064b7388",
            "author_credit": "NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LOLA 16 px/deg elevation (ldem_16.tif). Resampling: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_svs",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-normal-4k",
            "category": "global_relief_visualization",
            "source_page": "https://svs.gsfc.nasa.gov/4720/",
            "file_id": "normal_4k.jpg",
            "sha256": "c8c7ab2e69edb179dabc5237bfd7476bdcffb591e943e0d85b9931a2ebee4837",
            "author_credit": "NASA's Scientific Visualization Studio (CGI Moon Kit, SVS 4720); LOLA 16 px/deg elevation (ldem_16.tif). Resampling: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_svs",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-stars-4k",
            "category": "star_background",
            "source_page": "https://svs.gsfc.nasa.gov/4851/",
            "file_id": "stars_4k.jpg",
            "sha256": "4328f598aade1a7fb868dd62d382d317e2fd214f1520d0faf0d155e8944f7bda",
            "author_credit": "NASA's Scientific Visualization Studio (Deep Star Maps 2020, SVS 4851). Tone mapping: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_svs",
            "scientific_role": "illustrative_only"
        },
        {
            "asset_id": "braspace-moonhd-earth-2k",
            "category": "earth_visualization",
            "source_page": "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/",
            "file_id": "earth_2k.jpg",
            "sha256": "5189fd3cebb90cf48495ae98aa92d6c695be9c776a9b3b7ab003ef6102834d97",
            "author_credit": "NASA Earth Observatory, Blue Marble Next Generation (December 2004 composite with topography and bathymetry). Resampling: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_blue_marble",
            "scientific_role": "illustrative_only"
        },
        {
            "asset_id": "braspace-moonhd-south-pole-80m",
            "category": "project_derived_terrain_grid",
            "source_page": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "file_id": "south_pole_80m.bin",
            "sha256": "a1244e43cb392feb55aa63ee2289de5a7a098847f2511ce5fba2fcafceccf23c",
            "author_credit": "Elevation: NASA LRO/LOLA Science Team, PDS Geosciences Node (LRO-L-LOLA-4-GDR-V1.0, LDEM_80S_80M). Centre crop: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_pds",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-south-pole-320m",
            "category": "project_derived_terrain_grid",
            "source_page": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "file_id": "south_pole_320m.bin",
            "sha256": "2c44c11438246c878d82841047b859fcd394eccac0b61ca64a21746a5c1d0299",
            "author_credit": "Elevation: NASA LRO/LOLA Science Team, PDS Geosciences Node (LRO-L-LOLA-4-GDR-V1.0, LDEM_80S_80M). 4 x 4 block mean: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_nasa_pds",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-ephemeris",
            "category": "project_derived_ephemeris",
            "source_page": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
            "file_id": "ephemeris.bin",
            "sha256": "bb2e7661e9de2c250543b237b5021692af4840a4abb32f0598c554774ad6044d",
            "author_credit": "NASA/JPL NAIF SPICE generic kernels (DE440). Computation: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_naif_spice",
            "scientific_role": "visualization_only"
        },
        {
            "asset_id": "braspace-moonhd-earth-orientation",
            "category": "project_derived_ephemeris",
            "source_page": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
            "file_id": "earth_orientation.bin",
            "sha256": "80449193e0376819eacf35178c9632cde6e304c53c9254fb2afe7d62ec307073",
            "author_credit": "NASA/JPL NAIF SPICE generic kernels (DE440). Computation: BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_derived_from_naif_spice",
            "scientific_role": "illustrative_only"
        },
        {
            "asset_id": "braspace-moonhd-features",
            "category": "feature_names",
            "source_page": "https://planetarynames.wr.usgs.gov/",
            "file_id": "features.json",
            "sha256": "62361ecd3b0002b2be9c4efe9526df6ec0203e4bd1fca882b093ce36e7276826",
            "author_credit": "IAU Gazetteer of Planetary Nomenclature, USGS Astrogeology Science Center. Source file MOON_nomenclature_center_pts.zip (public domain).",
            "redistribution_status": "public_domain_source_cited",
            "scientific_role": "labels_only"
        },
        {
            "asset_id": "braspace-moonhd-manifest",
            "category": "project_metadata",
            "source_page": "docs/MOON_HD.md",
            "file_id": "manifest.json",
            "sha256": "baab41d5f7f8a2e9f7fedcf7c18f1d391f018e5b73dfd13d8753dae4a5915ccc",
            "author_credit": "BRASPACE (science/build_moon_hd_assets.py).",
            "redistribution_status": "project_metadata",
            "scientific_role": "none"
        },
        {
            "asset_id": "braspace-moonhd-pole-preview",
            "category": "project_derived_visualization",
            "source_page": "https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
            "file_id": "pole-preview.webp",
            "sha256": "9eacf3af78202bb35ee41d5c795621ecb1cf168a30260e5cda39f26eba4e99b7",
            "author_credit": "NASA LRO/LOLA Science Team; Moon HD terrain integration Joel (@joeljato), BRASPACE; offline CPU preview BRASPACE.",
            "redistribution_status": "project_derived_from_nasa_pds",
            "scientific_role": "visualization_only"
        }
    ],
    "matrix": [
        {
            "class": "NASA SVS CGI Moon Kit",
            "example": "lroc_color_2k.jpg`, `lroc_color_16bit_srgb_4k.tif",
            "status": "approved_candidate"
        },
        {
            "class": "NASA SVS LOLA-derived global render",
            "example": "ldem_4.tif",
            "status": "approved_candidate"
        },
        {
            "class": "LROC PDS product",
            "example": "PDS archive product",
            "status": "source_approved_product_specific_review_required"
        },
        {
            "class": "LROC website Featured Image",
            "example": "Page 1276",
            "status": "external_link_only"
        },
        {
            "class": "QuickMap/Lunaserv",
            "example": "Interactive service",
            "status": "service_link_only"
        },
        {
            "class": "Google Map/Moon tiles",
            "example": "Google Maps Tile API content",
            "status": "rejected"
        },
        {
            "class": "IAU/USGS Gazetteer of Planetary Nomenclature (Moon, centre points)",
            "example": "web/moonproof/data/features.json",
            "status": "public_domain_source_cited"
        },
        {
            "class": "BRASPACE polar elevation map (derived)",
            "example": "web/assets/polar-elevation-87s.webp` + `.json",
            "status": "project_derived_from_nasa_pds"
        },
        {
            "class": "PGDA 78 5 m site LDEMs",
            "example": "Site01_final_adj_5mpp_surf.tif",
            "status": "review_required"
        },
        {
            "class": "PGDA 81 south pole 87S mosaic",
            "example": "ldem_87s_5mpp.tif` (3.3 GB)",
            "status": "review_required"
        },
        {
            "class": "PGDA 69 polar illumination",
            "example": "AVGVISIB_85S_060M_201608.TIF",
            "status": "review_required"
        },
        {
            "class": "NASA SVS 5127",
            "example": "lola_sp_still_print.jpg",
            "status": "approved_candidate"
        },
        {
            "class": "LROC curated downloads",
            "example": "NAC_POLE_P900S0000.zip`, `LROC_Polar_Illumination_Map.tif",
            "status": "external_link_only"
        },
        {
            "class": "LROC Featured Image 237",
            "example": "WAC south polar mosaic page",
            "status": "external_link_only"
        },
        {
            "class": "SLDEM2015 (USGS/PGDA 54)",
            "example": "Lunar_LRO_LOLAKaguya_DEMmerge_60N060S_512ppd.tif",
            "status": "review_required"
        },
        {
            "class": "`lroc_color_2k.jpg` (SVS 4720)",
            "example": "layer `lroc-color-2k",
            "status": "approved_candidate"
        },
        {
            "class": "`moon_small.glb` (SVS 14959)",
            "example": "layer `svs-14959-moon-small-glb",
            "status": "approved_candidate"
        },
        {
            "class": "`ldem_4.tif` (SVS 4720)",
            "example": "layer `lola-dem-4ppd-render",
            "status": "approved_candidate"
        },
        {
            "class": "LROC Featured Image 1276 (M1407524099LR)",
            "example": "media `LROC-1276",
            "status": "external_link_only"
        },
        {
            "class": "LROC Featured Image 1247 (M1348682369LR)",
            "example": "media `LROC-1247",
            "status": "external_link_only"
        },
        {
            "class": "LROC Featured Image 1294 (M1432398306LR)",
            "example": "media `LROC-1294",
            "status": "external_link_only"
        },
        {
            "class": "LROC Featured Image 237",
            "example": "media `LROC-237",
            "status": "external_link_only"
        },
        {
            "class": "LROC Featured Image 1105",
            "example": "media `LROC-1105",
            "status": "external_link_only"
        },
        {
            "class": "`color_4k.jpg` (Moon HD)",
            "example": "braspace-moonhd-color-4k",
            "status": "project_derived_from_nasa_svs"
        },
        {
            "class": "`color_8k.jpg` (Moon HD)",
            "example": "braspace-moonhd-color-8k",
            "status": "project_derived_from_nasa_svs"
        },
        {
            "class": "`height_4k.jpg` (Moon HD)",
            "example": "braspace-moonhd-height-4k",
            "status": "project_derived_from_nasa_svs"
        },
        {
            "class": "`normal_4k.jpg` (Moon HD)",
            "example": "braspace-moonhd-normal-4k",
            "status": "project_derived_from_nasa_svs"
        },
        {
            "class": "`stars_4k.jpg` (Moon HD)",
            "example": "braspace-moonhd-stars-4k",
            "status": "project_derived_from_nasa_svs"
        },
        {
            "class": "`earth_2k.jpg` (Moon HD)",
            "example": "braspace-moonhd-earth-2k",
            "status": "project_derived_from_nasa_blue_marble"
        },
        {
            "class": "`south_pole_80m.bin` (Moon HD)",
            "example": "braspace-moonhd-south-pole-80m",
            "status": "project_derived_from_nasa_pds"
        },
        {
            "class": "`south_pole_320m.bin` (Moon HD)",
            "example": "braspace-moonhd-south-pole-320m",
            "status": "project_derived_from_nasa_pds"
        },
        {
            "class": "`ephemeris.bin` (Moon HD)",
            "example": "braspace-moonhd-ephemeris",
            "status": "project_derived_from_naif_spice"
        },
        {
            "class": "`earth_orientation.bin` (Moon HD)",
            "example": "braspace-moonhd-earth-orientation",
            "status": "project_derived_from_naif_spice"
        },
        {
            "class": "`features.json` (Moon HD)",
            "example": "braspace-moonhd-features",
            "status": "public_domain_source_cited"
        },
        {
            "class": "`manifest.json` (Moon HD)",
            "example": "braspace-moonhd-manifest",
            "status": "project_metadata"
        },
        {
            "class": "`pole-preview.webp` (Moon HD)",
            "example": "braspace-moonhd-pole-preview",
            "status": "project_derived_from_nasa_pds"
        }
    ]
};
