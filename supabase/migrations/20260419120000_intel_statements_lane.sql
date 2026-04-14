-- Statements desk lane + claims_public source family + snapshot id 6.

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_desk_lane_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_desk_lane_check CHECK (
    desk_lane IN ('osint', 'voices', 'watchdogs', 'defense_ops', 'indicators', 'statements')
  );

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
      'indicator_anecdotal',
      'claims_public'
    )
  );

ALTER TABLE intel.live_desk_snapshot DROP CONSTRAINT IF EXISTS live_desk_snapshot_id_check;
ALTER TABLE intel.live_desk_snapshot
  ADD CONSTRAINT live_desk_snapshot_id_check CHECK (id IN (1, 2, 3, 4, 5, 6));

INSERT INTO intel.live_desk_snapshot (id, payload, updated_at)
VALUES (
  6,
  '{"items":[],"suppressedItems":[],"duplicateItems":[],"leadItems":[],"secondaryLeadItems":[],"metadataOnlyItems":[],"freshness":null}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON CONSTRAINT sources_desk_lane_check ON intel.sources IS 'Includes statements lane for direct-claims monitoring (manifest-mirrored).';
