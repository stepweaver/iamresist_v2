-- Atomic Creator Notes V1.7: allow deterministic evidence-window excerpts up to 4000 chars.
-- Apply this file manually in the Supabase SQL Editor.
-- Do NOT run `supabase db push` for this migration.

ALTER TABLE intel.creator_atomic_notes
  DROP CONSTRAINT IF EXISTS creator_atomic_notes_source_excerpt_length_check;

ALTER TABLE intel.creator_atomic_notes
  ADD CONSTRAINT creator_atomic_notes_source_excerpt_length_check CHECK (
    source_excerpt IS NULL OR char_length(source_excerpt) <= 4000
  );
