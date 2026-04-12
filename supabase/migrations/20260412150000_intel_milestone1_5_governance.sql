-- Milestone 1.5: source governance fields (synced from TS manifest on ingest) + index for audit aggregates.

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS trusted_for text,
  ADD COLUMN IF NOT EXISTS not_trusted_for text,
  ADD COLUMN IF NOT EXISTS editorial_notes text,
  ADD COLUMN IF NOT EXISTS is_core_source boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS source_items_source_fetched_idx ON intel.source_items (source_id, fetched_at DESC);

-- Aggregates for /intel/sources (single round-trip; service role / PostgREST schema intel).
CREATE OR REPLACE FUNCTION intel.source_item_stats()
RETURNS TABLE (
  source_id uuid,
  item_total bigint,
  items_24h bigint,
  items_7d bigint,
  last_item_fetched_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    si.source_id,
    count(*)::bigint AS item_total,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '24 hours')::bigint AS items_24h,
    count(*) FILTER (WHERE si.fetched_at >= now() - interval '7 days')::bigint AS items_7d,
    max(si.fetched_at) AS last_item_fetched_at
  FROM intel.source_items si
  GROUP BY si.source_id;
$$;
