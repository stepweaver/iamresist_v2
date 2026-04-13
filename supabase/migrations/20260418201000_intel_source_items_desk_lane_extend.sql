-- Align source_items.desk_lane with intel.sources (was left on osint|voices in 20260418120000).

ALTER TABLE intel.source_items DROP CONSTRAINT IF EXISTS source_items_desk_lane_check;
ALTER TABLE intel.source_items
  ADD CONSTRAINT source_items_desk_lane_check CHECK (
    desk_lane IN ('osint', 'voices', 'watchdogs', 'defense_ops', 'indicators')
  );
