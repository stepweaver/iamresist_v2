-- Minimal deterministic event layer (Milestone 1).
-- Events are derived/curated from source_items; evidence links bind events to ingested artifacts.

CREATE TABLE IF NOT EXISTS intel.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desk_lane text NOT NULL DEFAULT 'osint',
  event_class text NOT NULL,
  severity smallint NOT NULL DEFAULT 50,
  confidence smallint NOT NULL DEFAULT 70,
  title text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  explanations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intel.events
  ADD CONSTRAINT events_severity_check CHECK (severity >= 0 AND severity <= 100);
ALTER TABLE intel.events
  ADD CONSTRAINT events_confidence_check CHECK (confidence >= 0 AND confidence <= 100);
ALTER TABLE intel.events
  ADD CONSTRAINT events_desk_lane_check CHECK (
    desk_lane IN ('osint', 'voices', 'watchdogs', 'defense_ops', 'indicators', 'statements')
  );

CREATE INDEX IF NOT EXISTS events_desk_lane_last_seen_idx
  ON intel.events (desk_lane, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS intel.event_evidence (
  event_id uuid NOT NULL REFERENCES intel.events(id) ON DELETE CASCADE,
  source_item_id uuid NOT NULL REFERENCES intel.source_items(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'context',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source_item_id)
);

ALTER TABLE intel.event_evidence
  ADD CONSTRAINT event_evidence_role_check CHECK (role IN ('primary', 'reporting', 'claim', 'context'));

CREATE INDEX IF NOT EXISTS event_evidence_source_item_id_idx
  ON intel.event_evidence (source_item_id);

