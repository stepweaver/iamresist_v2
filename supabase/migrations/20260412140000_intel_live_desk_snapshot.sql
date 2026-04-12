-- Last-good live desk payload when the primary read query fails (Postgres-backed fallback).

CREATE TABLE IF NOT EXISTS intel.live_desk_snapshot (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload jsonb NOT NULL DEFAULT '{"items":[],"freshness":null}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intel.live_desk_snapshot ENABLE ROW LEVEL SECURITY;
