-- Milestone: trust-warning posture for politically interested official sources.
-- Adds deterministic, queryable source-level columns used by UI + ranking.

ALTER TABLE intel.sources
  ADD COLUMN IF NOT EXISTS trust_warning_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trust_warning_level text NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS requires_independent_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_eligibility_mode text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS trust_warning_text text;

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_trust_warning_mode_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_trust_warning_mode_check CHECK (
    trust_warning_mode IN (
      'none',
      'source_controlled_official_claims'
    )
  );

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_trust_warning_level_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_trust_warning_level_check CHECK (
    trust_warning_level IN (
      'info',
      'caution',
      'high'
    )
  );

ALTER TABLE intel.sources DROP CONSTRAINT IF EXISTS sources_hero_eligibility_mode_check;
ALTER TABLE intel.sources
  ADD CONSTRAINT sources_hero_eligibility_mode_check CHECK (
    hero_eligibility_mode IN (
      'normal',
      'demote_low_substance',
      'never_hero_without_corroboration'
    )
  );

COMMENT ON COLUMN intel.sources.trust_warning_mode IS 'Deterministic trust posture classification for the source (synced from manifest).';
COMMENT ON COLUMN intel.sources.trust_warning_level IS 'UI prominence level for trust warning badge/copy (info|caution|high).';
COMMENT ON COLUMN intel.sources.requires_independent_verification IS 'True when claims/framing should be treated as needing independent corroboration.';
COMMENT ON COLUMN intel.sources.hero_eligibility_mode IS 'Deterministic lead/hero eligibility behavior for this source.';
COMMENT ON COLUMN intel.sources.trust_warning_text IS 'Short, editorially reviewed explanation shown as tooltip/inline copy.';

