-- BS-020: site catalog, horizon/ephemeris series and NASA source manifest.
-- Every series row keeps its source file hash and a hash of its canonical
-- content so a readback can prove the database matches the source.

CREATE TABLE source_manifest (
    dataset_id          text PRIMARY KEY,
    product_file        text NOT NULL,
    product_version     text NOT NULL,
    pds_dataset_id      text NOT NULL,
    source_url          text NOT NULL CHECK (source_url LIKE 'https://%'),
    sha256              char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size_bytes          bigint NOT NULL CHECK (size_bytes > 0),
    verification_status text NOT NULL,
    validated_at        date,
    manifest_sha256     char(64) NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    raw                 jsonb NOT NULL,
    ingested_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingest_runs (
    id             bigserial PRIMARY KEY,
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    catalog_sha256 char(64) NOT NULL,
    site_count     integer,
    series_count   integer,
    sample_count   bigint,
    status         text NOT NULL CHECK (status IN ('running', 'ok', 'failed'))
);

CREATE TABLE sites (
    id                   text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    ordinal              integer NOT NULL UNIQUE,
    name                 text NOT NULL CHECK (name <> ''),
    kind                 text NOT NULL,
    note                 text NOT NULL DEFAULT '',
    latitude_deg         double precision CHECK (latitude_deg BETWEEN -90 AND 90),
    longitude_deg        double precision CHECK (longitude_deg BETWEEN -180 AND 360),
    coordinate_role      text NOT NULL DEFAULT '',
    coordinate_frame     text NOT NULL DEFAULT '',
    coordinate_source    text NOT NULL DEFAULT '',
    coordinate_inventory text NOT NULL DEFAULT '',
    source_accuracy_m    text NOT NULL DEFAULT '',
    CHECK ((latitude_deg IS NULL) = (longitude_deg IS NULL)),
    CHECK (latitude_deg IS NULL OR coordinate_source <> '')
);

CREATE TABLE site_nearby (
    site_id   text NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    nearby_id text NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    ordinal   integer NOT NULL,
    PRIMARY KEY (site_id, nearby_id),
    CHECK (site_id <> nearby_id)
);

CREATE TABLE site_series (
    site_id            text PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
    schema             text NOT NULL CHECK (schema = 'braspace.site-series.v1'),
    science_status     text NOT NULL CHECK (science_status IN ('SYNTHETIC', 'UNVERIFIED', 'VALIDATED')),
    terrain_dataset_id text NOT NULL CHECK (terrain_dataset_id <> ''),
    terrain_sha256     text NOT NULL DEFAULT '',
    ephemeris_id       text NOT NULL CHECK (ephemeris_id <> ''),
    frame              text NOT NULL CHECK (frame = 'MOON_ME'),
    generator          text NOT NULL CHECK (generator <> ''),
    provenance_note    text NOT NULL DEFAULT '',
    observer_height_m  double precision NOT NULL CHECK (observer_height_m BETWEEN 0 AND 100),
    start_utc          timestamptz NOT NULL,
    step_seconds       integer NOT NULL CHECK (step_seconds BETWEEN 60 AND 86400),
    sample_count       integer NOT NULL CHECK (sample_count BETWEEN 2 AND 200000),
    source_file        text NOT NULL,
    file_sha256        char(64) NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    content_sha256     char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    ingest_run_id      bigint NOT NULL REFERENCES ingest_runs (id)
);

CREATE TABLE horizon_samples (
    site_id       text NOT NULL REFERENCES site_series (site_id) ON DELETE CASCADE,
    idx           integer NOT NULL CHECK (idx >= 0),
    azimuth_deg   double precision NOT NULL CHECK (azimuth_deg >= 0 AND azimuth_deg < 360),
    elevation_deg double precision NOT NULL CHECK (elevation_deg BETWEEN -90 AND 90),
    PRIMARY KEY (site_id, idx)
);

CREATE TABLE ephemeris_samples (
    site_id             text NOT NULL REFERENCES site_series (site_id) ON DELETE CASCADE,
    idx                 integer NOT NULL CHECK (idx >= 0),
    epoch_utc           timestamptz NOT NULL,
    sun_azimuth_deg     double precision NOT NULL CHECK (sun_azimuth_deg >= 0 AND sun_azimuth_deg < 360),
    sun_elevation_deg   double precision NOT NULL CHECK (sun_elevation_deg BETWEEN -90 AND 90),
    earth_azimuth_deg   double precision NOT NULL CHECK (earth_azimuth_deg >= 0 AND earth_azimuth_deg < 360),
    earth_elevation_deg double precision NOT NULL CHECK (earth_elevation_deg BETWEEN -90 AND 90),
    PRIMARY KEY (site_id, idx),
    UNIQUE (site_id, epoch_utc)
);
