-- Milestone 1: live intel desk (`intel` schema). No `events` / `event_attachments` in this cut.
-- After apply: Supabase Dashboard → Settings → API → add `intel` to "Exposed schemas".

CREATE SCHEMA IF NOT EXISTS intel;

CREATE TABLE IF NOT EXISTS intel.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  provenance_class text NOT NULL CHECK (
    provenance_class IN ('PRIMARY', 'WIRE', 'SPECIALIST', 'INDIE', 'COMMENTARY', 'SCHEDULE')
  ),
  fetch_kind text NOT NULL CHECK (fetch_kind IN ('rss', 'json_api')),
  endpoint_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intel.source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES intel.sources (id) ON DELETE CASCADE,
  external_id text,
  canonical_url text NOT NULL,
  title text NOT NULL,
  summary text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  cluster_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_change_type text NOT NULL DEFAULT 'unknown' CHECK (
    state_change_type IN (
      'unknown',
      'pre_publication',
      'published_document',
      'press_statement',
      'legislative_feed_item',
      'congressional_record_feed_item',
      'wire_item',
      'specialist_item'
    )
  ),
  CONSTRAINT source_items_source_url_unique UNIQUE (source_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS source_items_published_at_idx ON intel.source_items (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS source_items_fetched_at_idx ON intel.source_items (fetched_at DESC);

CREATE TABLE IF NOT EXISTS intel.ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES intel.sources (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  items_upserted integer NOT NULL DEFAULT 0,
  error_message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE intel.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.source_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.ingest_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN intel.source_items.state_change_type IS 'Template-friendly hint for rule-based “why it matters” copy; not procedural stage.';
COMMENT ON TABLE intel.source_items IS 'Normalized ingested rows; cluster_keys holds deterministic IDs only (Milestone 1).';
