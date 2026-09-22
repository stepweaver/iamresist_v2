-- Atomic Creator Notes V1.7: allow 45–60s evidence windows with up to 64 transcript segments.
-- Apply this file manually in the Supabase SQL Editor.
-- Do NOT run `supabase db push` for this migration.

ALTER TABLE intel.creator_atomic_notes
  DROP CONSTRAINT IF EXISTS creator_atomic_notes_source_segment_indexes_len_check;

ALTER TABLE intel.creator_atomic_notes
  ADD CONSTRAINT creator_atomic_notes_source_segment_indexes_len_check CHECK (
    source_segment_indexes IS NULL
    OR cardinality(source_segment_indexes) BETWEEN 1 AND 64
  );
