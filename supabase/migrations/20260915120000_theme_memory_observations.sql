-- Theme Memory Milestone 1: durable Voice / Newswire observations.
-- Intel/OSINT history remains in intel.source_items and is NOT copied here.
-- intel.events / intel.event_evidence stay unused; those tables model derived
-- real-world events, not historical feed observations.

CREATE TABLE IF NOT EXISTS intel.theme_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_slug text NOT NULL,
  source_name text NOT NULL,
  identity_key text NOT NULL,
  external_id text,
  canonical_url text NOT NULL,
  title text NOT NULL,
  summary text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  role text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  observed_at timestamptz GENERATED ALWAYS AS (COALESCE(published_at, fetched_at)) STORED,
  CONSTRAINT theme_observations_source_system_check CHECK (
    source_system IN ('voice', 'newswire')
  ),
  CONSTRAINT theme_observations_role_check CHECK (
    role IN ('creator', 'reporting', 'primary', 'specialist', 'commentary', 'context')
  ),
  CONSTRAINT theme_observations_identity_unique UNIQUE (source_system, source_slug, identity_key)
);

CREATE INDEX IF NOT EXISTS theme_observations_observed_at_idx
  ON intel.theme_observations (observed_at DESC);

CREATE INDEX IF NOT EXISTS theme_observations_system_observed_at_idx
  ON intel.theme_observations (source_system, observed_at DESC);

CREATE INDEX IF NOT EXISTS theme_observations_source_observed_at_idx
  ON intel.theme_observations (source_system, source_slug, observed_at DESC);

ALTER TABLE intel.theme_observations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE intel.theme_observations IS
  'Durable Voice and Newswire feed observations for Theme Memory. Not a ranking table. Intel artifacts stay in intel.source_items.';

COMMENT ON COLUMN intel.theme_observations.identity_key IS
  'Stable dedupe key: yt:{videoId} or url:{canonicalUrl}. Never title-only.';

COMMENT ON COLUMN intel.theme_observations.role IS
  'Editorial role of the observation. Creator items are attention sensors, not independent corroboration.';

COMMENT ON COLUMN intel.theme_observations.observed_at IS
  'COALESCE(published_at, fetched_at) in UTC for time-window queries.';
