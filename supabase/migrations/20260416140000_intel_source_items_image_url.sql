-- Optional RSS/OG thumbnail URL for intel desk (Phase 1); not part of content_hash identity.
ALTER TABLE intel.source_items
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN intel.source_items.image_url IS 'Optional feed-native or resolved thumbnail URL; may be filled at ingest or desk OG fallback.';
