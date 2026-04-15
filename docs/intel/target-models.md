# Target models (minimal, incremental)

This defines the minimal data models for **events, entities, stories, and the accountability ledger** that can be introduced without rewriting the existing `intel.sources` + `intel.source_items` pipeline.

## Guiding constraints

- **Keep `intel.source_items`** as the canonical ingested artifact store (provenance, trust posture, deterministic rules).
- Add new tables as **derived read models** that *reference* `source_items` (never replace them).
- Prefer **deterministic IDs and explainable fields** first; allow assistive ML only as suggestions later.

## 1) Events (V1)

### Purpose

An **event** is the canonical “real-world development” we want to track across items and updates.

### Minimal schema (implemented)

Implemented by migration `supabase/migrations/20260415123000_intel_events_v1.sql`:

- `intel.events`
  - `id uuid`
  - `desk_lane text` (same lane enum as existing system)
  - `event_class text` (deterministic taxonomy, v1)
  - `severity smallint` \(0..100\)
  - `confidence smallint` \(0..100\)
  - `title text`
  - `first_seen_at`, `last_seen_at`
  - `explanations jsonb` (array of short strings)
- `intel.event_evidence`
  - `(event_id, source_item_id)` join table
  - `role text` in `('primary','reporting','claim','context')`

### Why V1 is safe

- Events do **not** change ingest; they only add a layer that references existing items.
- Evidence links keep provenance and trust warnings intact.

## 2) Entities (V1 proposal)

### Purpose

Entities are stable identifiers for politicians/agencies/committees/courts/etc, enabling watchlists and “what changed for X.”

### Minimal schema (proposed)

- `intel.entities`
  - `id uuid`
  - `entity_type text` (e.g. `politician|agency|committee|court|org`)
  - `name text`
  - `slug text unique`
  - `status text` (`active|inactive`)
  - `created_at`, `updated_at`
- `intel.entity_aliases`
  - `entity_id uuid`
  - `alias text`
  - unique `(entity_id, alias)`
- `intel.entity_edges`
  - `from_entity_id uuid`
  - `to_entity_id uuid`
  - `edge_type text` (e.g. `member_of|chairs|appointed_by|donates_to`)
  - `evidence_source_item_id uuid null` (optional)
  - `created_at`

### Incremental integration strategy

- Start with **editorial-only entity creation** (no auto-NER).
- Attach entities to events later via `intel.event_entities(event_id, entity_id, role)`.

## 3) Stories (V1 proposal)

### Purpose

Stories are evolving clusters of events (“what’s the arc?”), with a human-readable headline and timeline.

### Minimal schema (proposed)

- `intel.stories`
  - `id uuid`
  - `desk_lane text`
  - `headline text`
  - `status text` (`developing|resolved|archived`)
  - `severity smallint` \(0..100\) (story-level rollup)
  - `confidence smallint` \(0..100\)
  - `created_at`, `updated_at`
- `intel.story_events`
  - `story_id uuid`
  - `event_id uuid`
  - `pinned boolean default false`
  - primary key `(story_id, event_id)`

### Incremental integration strategy

- Start with **manual story creation** and later add deterministic clustering helpers.

## 4) Politician accountability ledger (V1 proposal)

### Purpose

An evidence-led ledger of accountability-relevant developments keyed to a politician entity, with explicit evidence states.

### Minimal schema (proposed)

- `intel.ledger_entries`
  - `id uuid`
  - `entity_id uuid` (politician)
  - `event_id uuid null` (if an event exists)
  - `title text` (human label)
  - `evidence_state text` (enum below)
  - `summary text null` (optional; should be conservative)
  - `created_at`, `updated_at`
- `intel.ledger_evidence`
  - `ledger_entry_id uuid`
  - `source_item_id uuid`
  - `role text` (`primary|reporting|claim|context`)
  - primary key `(ledger_entry_id, source_item_id)`

### Evidence states (proposed)

Keep a short, legally defensible ladder:

- `allegation`
- `corroborated_report`
- `complaint_filed`
- `investigation_opened`
- `charged`
- `convicted`
- `dismissed`
- `unresolved`

Ledger entries should always have **at least one evidence link** (preferably more) and must keep **claims vs verified actions** separated via role tags.

