-- Theme Memory Milestone 2: persistent creator-led themes.
-- intel.events / intel.event_evidence stay unused. Events are discrete real-world
-- occurrences; themes are sustained editorial subjects across coverage.
--
-- Theme membership is topical association, NOT factual corroboration.
-- Creator members are editorial-attention sensors, not independent evidence.

CREATE TABLE IF NOT EXISTS intel.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  canonical_label text NOT NULL,
  display_headline text,
  summary text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT themes_slug_unique UNIQUE (slug),
  CONSTRAINT themes_lifecycle_status_check CHECK (
    lifecycle_status IN ('new', 'developing', 'persistent', 'cooling', 'resurging', 'dormant')
  )
);

CREATE INDEX IF NOT EXISTS themes_last_seen_at_idx
  ON intel.themes (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS themes_lifecycle_last_seen_idx
  ON intel.themes (lifecycle_status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS intel.theme_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES intel.themes (id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_slug text NOT NULL,
  source_name text NOT NULL,
  identity_key text NOT NULL,
  canonical_url text NOT NULL,
  title text NOT NULL,
  summary text,
  published_at timestamptz,
  item_observed_at timestamptz NOT NULL,
  member_role text NOT NULL,
  membership_confidence double precision NOT NULL,
  membership_method text NOT NULL,
  membership_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL,
  classification_version text NOT NULL,
  membership_prompt_version text,
  provenance_class text,
  desk_lane text,
  source_family text,
  first_assigned_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT theme_memberships_source_system_check CHECK (
    source_system IN ('voice', 'newswire', 'intel')
  ),
  CONSTRAINT theme_memberships_role_check CHECK (
    member_role IN ('creator', 'reporting', 'primary', 'specialist', 'commentary', 'context')
  ),
  CONSTRAINT theme_memberships_method_check CHECK (
    membership_method IN ('deterministic', 'ai', 'manual')
  ),
  CONSTRAINT theme_memberships_confidence_check CHECK (
    membership_confidence >= 0 AND membership_confidence <= 1
  ),
  CONSTRAINT theme_memberships_theme_identity_unique UNIQUE (
    theme_id, source_system, source_slug, identity_key
  ),
  CONSTRAINT theme_memberships_item_unique UNIQUE (
    source_system, source_slug, identity_key
  )
);

CREATE INDEX IF NOT EXISTS theme_memberships_theme_id_idx
  ON intel.theme_memberships (theme_id, item_observed_at DESC);

CREATE INDEX IF NOT EXISTS theme_memberships_role_observed_idx
  ON intel.theme_memberships (member_role, item_observed_at DESC);

CREATE INDEX IF NOT EXISTS theme_memberships_theme_role_idx
  ON intel.theme_memberships (theme_id, member_role);

CREATE TABLE IF NOT EXISTS intel.theme_daily_signals (
  theme_id uuid NOT NULL REFERENCES intel.themes (id) ON DELETE CASCADE,
  signal_date date NOT NULL,
  creator_count integer NOT NULL DEFAULT 0,
  creator_item_count integer NOT NULL DEFAULT 0,
  newswire_source_count integer NOT NULL DEFAULT 0,
  newswire_item_count integer NOT NULL DEFAULT 0,
  intel_source_count integer NOT NULL DEFAULT 0,
  intel_item_count integer NOT NULL DEFAULT 0,
  primary_source_count integer NOT NULL DEFAULT 0,
  specialist_source_count integer NOT NULL DEFAULT 0,
  creator_breadth integer NOT NULL DEFAULT 0,
  active_days_7 integer NOT NULL DEFAULT 0,
  active_days_14 integer NOT NULL DEFAULT 0,
  active_days_30 integer NOT NULL DEFAULT 0,
  creator_momentum double precision NOT NULL DEFAULT 0,
  evidence_depth integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (theme_id, signal_date)
);

CREATE INDEX IF NOT EXISTS theme_daily_signals_date_idx
  ON intel.theme_daily_signals (signal_date DESC);

CREATE TABLE IF NOT EXISTS intel.theme_item_analyses (
  source_system text NOT NULL,
  source_slug text NOT NULL,
  identity_key text NOT NULL,
  content_hash text NOT NULL,
  classification_version text NOT NULL,
  theme_id uuid REFERENCES intel.themes (id) ON DELETE SET NULL,
  decision text NOT NULL,
  membership_method text,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system, source_slug, identity_key),
  CONSTRAINT theme_item_analyses_decision_check CHECK (
    decision IN ('attached', 'seeded', 'no_match')
  ),
  CONSTRAINT theme_item_analyses_source_system_check CHECK (
    source_system IN ('voice', 'newswire', 'intel')
  )
);

CREATE INDEX IF NOT EXISTS theme_item_analyses_theme_id_idx
  ON intel.theme_item_analyses (theme_id);

ALTER TABLE intel.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.theme_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.theme_daily_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.theme_item_analyses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE intel.themes IS
  'Persistent creator-led editorial themes. Not a ranking table. Membership is topical association, not corroboration.';

COMMENT ON TABLE intel.theme_memberships IS
  'Topical membership of Voice/Newswire/Intel items in a theme. Creator members are attention sensors, not factual corroboration. PRIMARY members are primary-source records related to the subject, not proof of every claim in the theme.';

COMMENT ON TABLE intel.theme_daily_signals IS
  'Deterministic daily theme statistics. Not ranking points. evidence_depth counts related primary/specialist/reporting context, not claim verification.';

COMMENT ON TABLE intel.theme_item_analyses IS
  'Cached Theme Memory classification decisions so unchanged items are not re-analyzed.';

COMMENT ON COLUMN intel.themes.slug IS
  'Stable URL-safe identity. Never title-only; includes a unique id suffix.';

COMMENT ON COLUMN intel.theme_memberships.membership_reasons IS
  'Inspectable reasons the item was assigned. Topical association only.';
