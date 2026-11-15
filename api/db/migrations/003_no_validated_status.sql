-- VALIDATED needs independent benchmark evidence, which the schema cannot hold
-- yet. Refuse it here too, not only in the Go loader (#185). Fails if a row is
-- already marked VALIDATED, so a forged status is never kept silently.
ALTER TABLE site_series DROP CONSTRAINT site_series_science_status_check;
ALTER TABLE site_series ADD CONSTRAINT site_series_science_status_check
    CHECK (science_status IN ('SYNTHETIC', 'UNVERIFIED', 'PRELIMINARY'));
