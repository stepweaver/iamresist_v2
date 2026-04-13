-- Milestone: desk lanes (OSINT vs Voices), content-use modes, expanded fetch_kind, commentary state, denormalized item columns, dual live snapshots.

-- Allow snapshot id 1 = OSINT desk, 2 = Voices desk.
ALTER TABLE intel.live_desk_snapshot DROP CONSTRAINT IF EXISTS live_desk_snapshot_id_check;
ALTER TABLE intel.live_desk_snapshot
  ADD CONSTRAINT live_desk_snapshot_id_check CHECK (id IN (1, 2));

INSERT INTO intel.live_desk_snapshot (id, payload, updated_at)
VALUES (
  2,
  '{"items":[],"suppressedItems":[],"duplicateItems":[],"freshness":null}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Sources: lane + content policy + expanded fetch_kind
ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS desk_lane text,
  ADD COLUMN IF NOT EXISTS content_use_mode text;

UPDATE intel.sources SET desk_lane = 'osint' WHERE desk_lane IS NULL;
UPDATE intel.sources SET content_use_mode = 'feed_summary' WHERE content_use_mode IS NULL;

ALTER TABLE intel.sources ALTER COLUMN desk_lane SET NOT NULL;
ALTER TABLE intel.sources ALTER COLUMN desk_lane SET DEFAULT 'osint';
ALTER TABLE intel.sources ALTER COLUMN content_use_mode SET NOT NULL;
ALTER TABLE intel.sources ALTER COLUMN content_use_mode SET DEFAULT 'feed_summary';

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_fetch_kind_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_fetch_kind_check CHECK (
    fetch_kind IN (
      'rss',
      'json_api',
      'podcast_rss',
      'unsupported',
      'manual',
      'newsletter_only',
      'scrape'
    )
  );

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_desk_lane_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_desk_lane_check CHECK (desk_lane IN ('osint', 'voices'));

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_content_use_mode_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_content_use_mode_check CHECK (
    content_use_mode IN (
      'metadata_only',
      'feed_summary',
      'preview_and_link',
      'full_text_if_feed_includes',
      'manual_review'
    )
  );

COMMENT ON COLUMN intel.sources.desk_lane IS 'Which live intel desk ingested items target: osint or voices.';
COMMENT ON COLUMN intel.sources.content_use_mode IS 'How much of feed-native text to retain; manual_review = registry only, no auto-fetch.';

-- Items: denormalized lane + mode for PostgREST filtering; backfill from parent source
ALTER TABLE intel.source_items
  ADD COLUMN IF NOT EXISTS desk_lane text,
  ADD COLUMN IF NOT EXISTS content_use_mode text;

UPDATE intel.source_items si
SET
  desk_lane = s.desk_lane,
  content_use_mode = s.content_use_mode
FROM intel.sources s
WHERE si.source_id = s.id AND (si.desk_lane IS NULL OR si.content_use_mode IS NULL);

UPDATE intel.source_items SET desk_lane = 'osint' WHERE desk_lane IS NULL;
UPDATE intel.source_items SET content_use_mode = 'feed_summary' WHERE content_use_mode IS NULL;

ALTER TABLE intel.source_items ALTER COLUMN desk_lane SET NOT NULL;
ALTER TABLE intel.source_items ALTER COLUMN desk_lane SET DEFAULT 'osint';
ALTER TABLE intel.source_items ALTER COLUMN content_use_mode SET NOT NULL;
ALTER TABLE intel.source_items ALTER COLUMN content_use_mode SET DEFAULT 'feed_summary';

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_desk_lane_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_desk_lane_check CHECK (desk_lane IN ('osint', 'voices'));

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_content_use_mode_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_content_use_mode_check CHECK (
    content_use_mode IN (
      'metadata_only',
      'feed_summary',
      'preview_and_link',
      'full_text_if_feed_includes',
      'manual_review'
    )
  );

CREATE INDEX IF NOT EXISTS source_items_desk_lane_published_idx
  ON intel.source_items (desk_lane, published_at DESC NULLS LAST);

-- state_change_type: commentary
ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_state_change_type_check;
ALTER TABLE intel.source_items ADD CONSTRAINT source_items_state_change_type_check CHECK (
  state_change_type IN (
    'unknown',
    'pre_publication',
    'published_document',
    'presidential_action',
    'press_statement',
    'legislative_feed_item',
    'congressional_record_feed_item',
    'wire_item',
    'specialist_item',
    'commentary_item'
  )
);
