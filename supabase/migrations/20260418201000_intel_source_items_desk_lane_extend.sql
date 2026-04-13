-- Align source_items.desk_lane with intel.sources (20260418120000 extended sources only).
-- Required for ingest into watchdogs / defense_ops / indicators; without this, upserts fail with:
--   new row for relation "source_items" violates check constraint "source_items_desk_lane_check"
-- Verify after apply:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'intel.source_items'::regclass AND conname = 'source_items_desk_lane_check';

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_desk_lane_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_desk_lane_check CHECK (
    desk_lane IN ('osint', 'voices', 'watchdogs', 'defense_ops', 'indicators')
  );
