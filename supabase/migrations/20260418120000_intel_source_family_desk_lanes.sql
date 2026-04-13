-- Source families (defense, watchdogs, indicators) + extended desk lanes + snapshot rows.

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS source_family text;

UPDATE intel.sources SET source_family = 'general' WHERE source_family IS NULL;

ALTER TABLE intel.sources ALTER COLUMN source_family SET NOT NULL;
ALTER TABLE intel.sources ALTER COLUMN source_family SET DEFAULT 'general';

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_source_family_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_source_family_check CHECK (
    source_family IN (
      'general',
      'defense_primary',
      'combatant_command',
      'defense_specialist',
      'watchdog_global',
      'indicator_hard',
      'indicator_soft',
      'indicator_anecdotal'
    )
  );

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_desk_lane_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_desk_lane_check CHECK (
    desk_lane IN ('osint', 'voices', 'watchdogs', 'defense_ops', 'indicators')
  );

ALTER TABLE intel.source_items
  ADD COLUMN IF NOT EXISTS indicator_class text;

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_indicator_class_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_indicator_class_check CHECK (
    indicator_class IS NULL OR indicator_class IN ('hard', 'soft', 'anecdotal')
  );

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_state_change_type_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_state_change_type_check CHECK (
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
      'commentary_item',
      'scheduled_release'
    )
  );

ALTER TABLE intel.live_desk_snapshot DROP CONSTRAINT IF EXISTS live_desk_snapshot_id_check;
ALTER TABLE intel.live_desk_snapshot
  ADD CONSTRAINT live_desk_snapshot_id_check CHECK (id IN (1, 2, 3, 4, 5));

INSERT INTO intel.live_desk_snapshot (id, payload, updated_at)
VALUES (
  3,
  '{"items":[],"suppressedItems":[],"duplicateItems":[],"freshness":null}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO intel.live_desk_snapshot (id, payload, updated_at)
VALUES (
  4,
  '{"items":[],"suppressedItems":[],"duplicateItems":[],"freshness":null}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO intel.live_desk_snapshot (id, payload, updated_at)
VALUES (
  5,
  '{"items":[],"suppressedItems":[],"duplicateItems":[],"freshness":null}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN intel.sources.source_family IS 'Editorial grouping for promotion rules and ops (manifest-mirrored).';
COMMENT ON COLUMN intel.source_items.indicator_class IS 'Optional: hard/soft/anecdotal thermometer items (e.g. pizza index).';
