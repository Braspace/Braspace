-- PRELIMINARY: series derived from NASA LOLA + NAIF SPICE, not independently validated.
ALTER TABLE site_series DROP CONSTRAINT site_series_science_status_check;
ALTER TABLE site_series ADD CONSTRAINT site_series_science_status_check
    CHECK (science_status IN ('SYNTHETIC', 'UNVERIFIED', 'PRELIMINARY', 'VALIDATED'));
