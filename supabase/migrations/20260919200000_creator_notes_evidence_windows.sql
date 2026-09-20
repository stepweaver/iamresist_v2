-- Atomic Creator Notes v1.6: store the full deterministic evidence window.
-- Windows are ~30-60s / 800-1500 characters and may cite more than 8 original segments.

ALTER TABLE intel.creator_atomic_notes
  DROP CONSTRAINT IF EXISTS creator_atomic_notes_source_excerpt_length_check;

ALTER TABLE intel.creator_atomic_notes
  ADD CONSTRAINT creator_atomic_notes_source_excerpt_length_check CHECK (
    source_excerpt IS NULL
    OR (
      char_length(source_excerpt) > 0
      AND char_length(source_excerpt) <= 2000
    )
  );

ALTER TABLE intel.creator_atomic_notes
  DROP CONSTRAINT IF EXISTS creator_atomic_notes_source_segment_indexes_len_check;

ALTER TABLE intel.creator_atomic_notes
  ADD CONSTRAINT creator_atomic_notes_source_segment_indexes_len_check CHECK (
    cardinality(source_segment_indexes) <= 48
  );

COMMENT ON COLUMN intel.creator_atomic_notes.source_excerpt IS
  'Deterministic verbatim evidence window copied from original transcript segments. Never model-generated. Null if source segment indexes are missing or invalid.';

COMMENT ON COLUMN intel.creator_atomic_notes.source_segment_indexes IS
  'Original transcript segment indexes of the application-defined evidence window. The model does not choose global indexes.';

COMMENT ON COLUMN intel.creator_atomic_notes.exact_quote IS
  'Illustrative verbatim substring copied from the evidence window and mechanically verified. Not the entire grounding contract. Null if missing or unverifiable.';
