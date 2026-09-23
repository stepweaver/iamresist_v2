-- Orthogonal content role for Atomic Notes.
-- sponsor_read / housekeeping / intro_outro / uncertain notes are not editorial evidence.
-- Null preserves notes extracted before content-role classification.

ALTER TABLE intel.creator_atomic_notes
  ADD COLUMN IF NOT EXISTS content_role text;

ALTER TABLE intel.creator_atomic_notes
  DROP CONSTRAINT IF EXISTS creator_atomic_notes_content_role_check;

ALTER TABLE intel.creator_atomic_notes
  ADD CONSTRAINT creator_atomic_notes_content_role_check CHECK (
    content_role IS NULL
    OR content_role IN (
      'editorial',
      'sponsor_read',
      'housekeeping',
      'intro_outro',
      'uncertain'
    )
  );

COMMENT ON COLUMN intel.creator_atomic_notes.content_role IS
  'Segment role of the evidence used for this note. Only editorial notes are eligible for theme memory, event threads, reasoning edges, and editorial boost. Null means extracted before content-role classification.';
