-- Milestone 1.8: relevance provenance timestamps + surfaced-first desk indexes + audit stale counts.

ALTER TABLE intel.source_items
  ADD COLUMN IF NOT EXISTS relevance_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS relevance_rule_version text;

CREATE INDEX IF NOT EXISTS source_items_surfaced_published_idx
  ON intel.source_items (published_at DESC NULLS LAST)
  WHERE surface_state = 'surfaced';

CREATE INDEX IF NOT EXISTS source_items_downranked_published_idx
  ON intel.source_items (published_at DESC NULLS LAST)
  WHERE surface_state = 'downranked';

CREATE INDEX IF NOT EXISTS source_items_suppressed_published_idx
  ON intel.source_items (published_at DESC NULLS LAST)
  WHERE surface_state = 'suppressed';

-- Replace RPC: optional expected_rule_version for stale-rule counts (must match app INTEL_RELEVANCE_RULE_VERSION).
DROP FUNCTION IF EXISTS intel.source_item_surfacing_stats();

CREATE OR REPLACE FUNCTION intel.source_item_surfacing_stats(expected_rule_version text DEFAULT NULL)
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
  suppressed_7d bigint,
  items_never_scored_total bigint,
  items_rule_stale_total bigint
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
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '7 days' AND si.surface_state = 'suppressed')::bigint AS suppressed_7d,
    count(*) FILTER (WHERE si.relevance_computed_at IS NULL)::bigint AS items_never_scored_total,
    count(*) FILTER (
      WHERE expected_rule_version IS NOT NULL
        AND trim(expected_rule_version) <> ''
        AND coalesce(si.relevance_rule_version, '') IS DISTINCT FROM trim(expected_rule_version)
    )::bigint AS items_rule_stale_total
  FROM intel.source_items si
  GROUP BY si.source_id;
$$;

COMMENT ON COLUMN intel.source_items.relevance_computed_at IS 'When relevance fields were last computed (ingest or rescore).';
COMMENT ON COLUMN intel.source_items.relevance_rule_version IS 'App rule-set stamp; mismatch vs current version implies rescore recommended.';
