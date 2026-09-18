-- Atomic Creator Notes Milestone 1.
-- Structured notebook-style notes extracted from one creator transcript.
-- Does NOT create Theme Memory memberships, theme identities, or ranking signals.
-- intel.events / intel.event_evidence stay unused.

CREATE TABLE IF NOT EXISTS intel.creator_note_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id text NOT NULL,
  source_identity_key text,
  creator_id text,
  model_provider text NOT NULL,
  model_name text NOT NULL,
  extraction_version text NOT NULL,
  transcript_hash text NOT NULL,
  status text NOT NULL,
  input_chars integer NOT NULL,
  notes_created integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_note_runs_status_check CHECK (
    status IN ('running', 'success', 'partial', 'failed')
  ),
  CONSTRAINT creator_note_runs_input_chars_check CHECK (input_chars >= 0),
  CONSTRAINT creator_note_runs_notes_created_check CHECK (notes_created >= 0)
);

CREATE INDEX IF NOT EXISTS creator_note_runs_source_item_id_idx
  ON intel.creator_note_runs (source_item_id);

CREATE INDEX IF NOT EXISTS creator_note_runs_creator_id_idx
  ON intel.creator_note_runs (creator_id);

CREATE INDEX IF NOT EXISTS creator_note_runs_created_at_idx
  ON intel.creator_note_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS creator_note_runs_equivalent_idx
  ON intel.creator_note_runs (
    source_item_id,
    transcript_hash,
    extraction_version,
    model_provider,
    model_name,
    status
  );

CREATE TABLE IF NOT EXISTS intel.creator_atomic_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id uuid NOT NULL REFERENCES intel.creator_note_runs (id) ON DELETE CASCADE,
  source_item_id text NOT NULL,
  creator_id text,
  start_seconds numeric,
  end_seconds numeric,
  kind text NOT NULL,
  text text NOT NULL,
  attribution text,
  event_features jsonb,
  verification_status text NOT NULL,
  note_fingerprint text NOT NULL,
  exact_quote text,
  source_segment_indexes integer[] NOT NULL DEFAULT '{}'::integer[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_atomic_notes_kind_check CHECK (
    kind IN (
      'event',
      'claim',
      'new_development',
      'context',
      'evidence_reference',
      'creator_analysis',
      'why_it_matters'
    )
  ),
  CONSTRAINT creator_atomic_notes_verification_status_check CHECK (
    verification_status IN (
      'unverified',
      'supported',
      'disputed',
      'contradicted',
      'not_applicable'
    )
  ),
  CONSTRAINT creator_atomic_notes_text_check CHECK (char_length(text) > 0),
  CONSTRAINT creator_atomic_notes_seconds_order_check CHECK (
    start_seconds IS NULL OR end_seconds IS NULL OR end_seconds >= start_seconds
  ),
  CONSTRAINT creator_atomic_notes_seconds_nonnegative_check CHECK (
    (start_seconds IS NULL OR start_seconds >= 0)
    AND (end_seconds IS NULL OR end_seconds >= 0)
  ),
  CONSTRAINT creator_atomic_notes_exact_quote_length_check CHECK (
    exact_quote IS NULL
    OR (
      char_length(exact_quote) > 0
      AND char_length(exact_quote) <= 500
    )
  ),
  CONSTRAINT creator_atomic_notes_source_segment_indexes_len_check CHECK (
    cardinality(source_segment_indexes) <= 8
  ),
  CONSTRAINT creator_atomic_notes_source_segment_indexes_values_check CHECK (
    0 <= ALL (source_segment_indexes)
  ),
  CONSTRAINT creator_atomic_notes_fingerprint_unique UNIQUE (note_fingerprint)
);

CREATE INDEX IF NOT EXISTS creator_atomic_notes_source_item_id_idx
  ON intel.creator_atomic_notes (source_item_id);

CREATE INDEX IF NOT EXISTS creator_atomic_notes_creator_id_idx
  ON intel.creator_atomic_notes (creator_id);

CREATE INDEX IF NOT EXISTS creator_atomic_notes_extraction_run_id_idx
  ON intel.creator_atomic_notes (extraction_run_id);

CREATE INDEX IF NOT EXISTS creator_atomic_notes_kind_idx
  ON intel.creator_atomic_notes (kind);

CREATE INDEX IF NOT EXISTS creator_atomic_notes_created_at_idx
  ON intel.creator_atomic_notes (created_at DESC);

ALTER TABLE intel.creator_note_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.creator_atomic_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE intel.creator_note_runs IS
  'Atomic Creator Notes extraction runs. Inspectable and idempotent. Does not mutate Theme Memory or ranking.';

COMMENT ON TABLE intel.creator_atomic_notes IS
  'Notebook-style notes from one creator transcript. Claims are unverified. Creator analysis is not fact. Not Theme Memory identity.';

COMMENT ON COLUMN intel.creator_atomic_notes.verification_status IS
  'Milestone 1 defaults: factual notes unverified; analysis/why_it_matters/evidence_reference not_applicable. LLM world knowledge must not set supported/disputed/contradicted.';

COMMENT ON COLUMN intel.creator_atomic_notes.event_features IS
  'Lightweight extraction candidates (actors/action/object/institutions/locations/documents). Not theme identity and not auto-linked.';

COMMENT ON COLUMN intel.creator_atomic_notes.note_fingerprint IS
  'Deterministic sha256 of source item + kind + normalized text + start timestamp.';

COMMENT ON COLUMN intel.creator_atomic_notes.exact_quote IS
  'Verified verbatim transcript excerpt supporting the notebook paraphrase. Null if missing or unverifiable. Never a reconstructed quotation.';

COMMENT ON COLUMN intel.creator_atomic_notes.source_segment_indexes IS
  'Original transcript segment indexes cited for provenance. Quote verification concatenates these segments in transcript order.';

COMMENT ON COLUMN intel.creator_note_runs.transcript_hash IS
  'SHA-256 of normalized transcript segments. Used with extraction_version and model identity for rerun idempotency.';
