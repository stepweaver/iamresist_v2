-- Per-source adaptive ingest scheduling + content fingerprint for cache revalidation.

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS ingest_interval_minutes integer NOT NULL DEFAULT 30
    CHECK (ingest_interval_minutes >= 5 AND ingest_interval_minutes <= 1440);

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS next_ingest_at timestamptz;

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS last_ingest_content_fingerprint text;

COMMENT ON COLUMN intel.sources.ingest_interval_minutes IS
  'Target minutes between successful ingest attempts; mirrored from manifest (default 30).';
COMMENT ON COLUMN intel.sources.next_ingest_at IS
  'When this source is next eligible for fetch; NULL means due immediately.';
COMMENT ON COLUMN intel.sources.last_ingest_content_fingerprint IS
  'SHA-256 of sorted item content_hash values from last ingest; used to skip Next cache revalidation when payload unchanged.';
