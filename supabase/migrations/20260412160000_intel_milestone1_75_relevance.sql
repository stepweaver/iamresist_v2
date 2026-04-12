-- Milestone 1.75: deterministic relevance / surfacing on source_items + editorial controls on sources.

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS editorial_controls jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE intel.source_items
  ADD COLUMN IF NOT EXISTS mission_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS branch_of_government text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS institutional_area text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS relevance_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surface_state text NOT NULL DEFAULT 'surfaced',
  ADD COLUMN IF NOT EXISTS suppression_reason text,
  ADD COLUMN IF NOT EXISTS relevance_explanations jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'intel' AND t.relname = 'source_items' AND c.conname = 'source_items_surface_state_check'
  ) THEN
    ALTER TABLE intel.source_items
      ADD CONSTRAINT source_items_surface_state_check CHECK (
        surface_state IN ('surfaced', 'downranked', 'suppressed')
      );
  END IF;
END $$;

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
    'specialist_item'
  )
);

CREATE INDEX IF NOT EXISTS source_items_desk_surface_fetched_idx
  ON intel.source_items (fetched_at DESC)
  WHERE surface_state <> 'suppressed';

-- Aggregates for /intel/sources: ingest-time surfacing breakdown (per source).
CREATE OR REPLACE FUNCTION intel.source_item_surfacing_stats()
RETURNS TABLE (
  source_id uuid,
  item_total bigint,
  items_24h bigint,
  items_7d bigint,
  last_item_fetched_at timestamptz,
  surfaced_total bigint,
  downranked_total bigint,
  suppressed_total bigint,
  surfaced_7d bigint,
  downranked_7d bigint,
  suppressed_7d bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    si.source_id,
    count(*)::bigint AS item_total,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '24 hours')::bigint AS items_24h,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '7 days')::bigint AS items_7d,
    max(si.fetched_at) AS last_item_fetched_at,
    count(*) FILTER (WHERE si.surface_state = 'surfaced')::bigint AS surfaced_total,
    count(*) FILTER (WHERE si.surface_state = 'downranked')::bigint AS downranked_total,
    count(*) FILTER (WHERE si.surface_state = 'suppressed')::bigint AS suppressed_total,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '7 days' AND si.surface_state = 'surfaced')::bigint AS surfaced_7d,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '7 days' AND si.surface_state = 'downranked')::bigint AS downranked_7d,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '7 days' AND si.surface_state = 'suppressed')::bigint AS suppressed_7d
  FROM intel.source_items si
  GROUP BY si.source_id;
$$;

COMMENT ON COLUMN intel.sources.editorial_controls IS 'Mirrors optional manifest editorial controls (keywords, patterns, default priority) for audit and ingest.';
COMMENT ON COLUMN intel.source_items.relevance_explanations IS 'JSON array of {ruleId, message} from deterministic relevance rules at ingest.';
