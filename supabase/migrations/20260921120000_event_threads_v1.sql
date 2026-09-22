-- Event Threads V1: interpretive chronological story layer ABOVE Atomic Creator Notes.
-- Apply this file manually in the Supabase SQL Editor.
-- Do NOT run `supabase db push` for this migration.
--
-- This layer MUST NOT rewrite or mutate:
--   intel.creator_atomic_notes
--   transcript text / source quotes / transcript evidence
--   Theme Memory tables
--   ranking / source_items rows
--
-- intel.events / intel.event_evidence remain unused.

CREATE TABLE IF NOT EXISTS intel.event_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  status text NOT NULL,
  started_at timestamptz,
  last_activity_at timestamptz,
  identity_key text,
  identity_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  creator_convergence_count integer NOT NULL DEFAULT 0,
  source_corroboration_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_threads_title_check CHECK (char_length(title) > 0),
  CONSTRAINT event_threads_slug_check CHECK (char_length(slug) > 0),
  CONSTRAINT event_threads_status_check CHECK (
    status IN ('proposed', 'active', 'merged', 'closed')
  ),
  CONSTRAINT event_threads_creator_convergence_check CHECK (creator_convergence_count >= 0),
  CONSTRAINT event_threads_source_corroboration_check CHECK (source_corroboration_count >= 0)
);

CREATE INDEX IF NOT EXISTS event_threads_status_last_activity_idx
  ON intel.event_threads (status, last_activity_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS event_threads_identity_key_idx
  ON intel.event_threads (identity_key);

CREATE TABLE IF NOT EXISTS intel.event_thread_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES intel.event_threads (id) ON DELETE CASCADE,
  atomic_note_id uuid REFERENCES intel.creator_atomic_notes (id) ON DELETE SET NULL,
  occurred_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  entry_kind text NOT NULL,
  resolved_text text NOT NULL,
  resolution_type text NOT NULL,
  time_provenance text NOT NULL DEFAULT 'unknown',
  creator_name text,
  source_url text,
  listen_anchor_seconds numeric,
  confidence text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_thread_entries_resolved_text_check CHECK (char_length(resolved_text) > 0),
  CONSTRAINT event_thread_entries_entry_kind_check CHECK (
    entry_kind IN (
      'event',
      'development',
      'claim',
      'context',
      'evidence_reference',
      'creator_analysis',
      'why_it_matters'
    )
  ),
  CONSTRAINT event_thread_entries_resolution_type_check CHECK (
    resolution_type IN (
      'literal',
      'coreference',
      'semantic_role',
      'ellipsis',
      'discourse_context',
      'creator_analysis',
      'uncertain'
    )
  ),
  CONSTRAINT event_thread_entries_time_provenance_check CHECK (
    time_provenance IN ('explicit_event_time', 'source_publication_time', 'unknown')
  ),
  CONSTRAINT event_thread_entries_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low', 'uncertain')
  ),
  CONSTRAINT event_thread_entries_listen_anchor_check CHECK (
    listen_anchor_seconds IS NULL OR listen_anchor_seconds >= 0
  )
);

CREATE INDEX IF NOT EXISTS event_thread_entries_thread_chronology_idx
  ON intel.event_thread_entries (thread_id, occurred_at ASC NULLS LAST, sort_order ASC);

CREATE INDEX IF NOT EXISTS event_thread_entries_atomic_note_id_idx
  ON intel.event_thread_entries (atomic_note_id);

-- Thread memberships/links only. Never mutates intel.source_items.
CREATE TABLE IF NOT EXISTS intel.event_thread_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES intel.event_threads (id) ON DELETE CASCADE,
  source_item_id uuid REFERENCES intel.source_items (id) ON DELETE SET NULL,
  source_url text,
  source_name text,
  desk_lane text,
  link_kind text NOT NULL,
  match_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_thread_source_links_link_kind_check CHECK (
    link_kind IN ('intel', 'osint', 'creator', 'evidence')
  ),
  CONSTRAINT event_thread_source_links_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low', 'uncertain')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_thread_source_links_thread_source_unique
  ON intel.event_thread_source_links (thread_id, source_item_id)
  WHERE source_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_thread_source_links_source_item_id_idx
  ON intel.event_thread_source_links (source_item_id);

-- Human [RESIST] Editor Note. Prepared only. AI must never write this table.
CREATE TABLE IF NOT EXISTS intel.event_thread_editor_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES intel.event_threads (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_thread_editor_notes_body_check CHECK (char_length(body) > 0)
);

CREATE INDEX IF NOT EXISTS event_thread_editor_notes_thread_id_idx
  ON intel.event_thread_editor_notes (thread_id);

ALTER TABLE intel.event_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.event_thread_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.event_thread_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.event_thread_editor_notes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE intel.event_threads IS
  'Interpretive chronological event/story threads. Not Atomic Notes. Not Theme Memory. Not ranking.';

COMMENT ON TABLE intel.event_thread_entries IS
  'Resolved thread entries grounded in Atomic Creator Notes. resolved_text is interpretive; Atomic Notes remain source provenance.';

COMMENT ON COLUMN intel.event_thread_entries.resolution_type IS
  'How resolved_text was produced. creator_analysis is not a factual resolution. uncertain preserves ambiguity.';

COMMENT ON COLUMN intel.event_thread_entries.time_provenance IS
  'explicit_event_time only when the date appears in supplied context. Never invent an event date.';

COMMENT ON COLUMN intel.event_threads.creator_convergence_count IS
  'Distinct creators discussing the thread. Attention/relevance only. Not independent factual corroboration.';

COMMENT ON COLUMN intel.event_threads.source_corroboration_count IS
  'Independent Intel/OSINT source_items linked to the thread. Tracked separately from creator convergence.';

COMMENT ON TABLE intel.event_thread_source_links IS
  'Read-only memberships from Event Threads onto existing source records. Does not mutate intel.source_items.';

COMMENT ON TABLE intel.event_thread_editor_notes IS
  'Human [RESIST] Editor Note. Never authored by AI. Never mixed into facts, creator claims, creator analysis, or source evidence.';
