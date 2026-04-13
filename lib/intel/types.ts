export type ProvenanceClass =
  | 'PRIMARY'
  | 'WIRE'
  | 'SPECIALIST'
  | 'INDIE'
  | 'COMMENTARY'
  | 'SCHEDULE';

export type FetchKind =
  | 'rss'
  | 'json_api'
  | 'podcast_rss'
  | 'unsupported'
  | 'manual'
  | 'newsletter_only'
  | 'scrape'
  | 'html_index';

export type DeskLane = 'osint' | 'voices';

/** How feed-native text is stored and surfaced; manual_review = registry row only (no auto-fetch). */
export type ContentUseMode =
  | 'metadata_only'
  | 'feed_summary'
  | 'preview_and_link'
  | 'full_text_if_feed_includes'
  | 'manual_review';

export type TrustWarningMode = 'none' | 'source_controlled_official_claims';

export type TrustWarningLevel = 'info' | 'caution' | 'high';

export type HeroEligibilityMode =
  | 'normal'
  | 'demote_low_substance'
  | 'never_hero_without_corroboration';

/** Hint for rule-based copy; separate from future procedural_stage on events. */
export type StateChangeType =
  | 'unknown'
  | 'pre_publication'
  | 'published_document'
  | 'presidential_action'
  | 'press_statement'
  | 'legislative_feed_item'
  | 'congressional_record_feed_item'
  | 'wire_item'
  | 'specialist_item'
  | 'commentary_item';

/** Deterministic mission vocabulary for OSINT relevance (expand only with explicit rules). */
export type MissionTag =
  | 'executive_power'
  | 'regulation'
  | 'congress'
  | 'courts'
  | 'elections'
  | 'voting_rights'
  | 'federal_agencies'
  | 'civil_liberties'
  | 'media_disinfo'
  | 'economy_major'
  | 'protest'
  | 'international_relevant';

export type BranchOfGovernment =
  | 'executive'
  | 'legislative'
  | 'judicial'
  | 'administrative'
  | 'unknown';

export type InstitutionalArea =
  | 'white_house'
  | 'federal_register'
  | 'congress'
  | 'courts'
  | 'wire'
  | 'specialist'
  | 'unknown';

export type SurfaceState = 'surfaced' | 'downranked' | 'suppressed';

export type RelevanceExplanation = {
  ruleId: string;
  message: string;
};

/** Optional per-source rules mirrored to intel.sources.editorial_controls. */
export type EditorialControls = {
  defaultPriority?: number;
  allowKeywords?: string[];
  blockKeywords?: string[];
  allowPatterns?: string[];
  blockPatterns?: string[];
  preferredStateChangeTypes?: StateChangeType[];
  noiseNotes?: string;
  relevanceNotes?: string;
};

export type IngestRunStatus = 'running' | 'success' | 'partial' | 'failed';

export type SignalSourceConfig = {
  slug: string;
  name: string;
  provenanceClass: ProvenanceClass;
  fetchKind: FetchKind;
  /** OSINT institutional/specialist desk vs ingested creator commentary desk. */
  deskLane: DeskLane;
  /** Feed-native text retention policy (enforced at parse + UI). */
  contentUseMode: ContentUseMode;
  /** When null/empty, source is skipped (wire URLs from env). */
  endpointUrl: string | null;
  isEnabled: boolean;
  /** Shown in Live UI / ops; not user-facing essay. */
  notes?: string;
  /** Why this feed exists on the OSINT desk. */
  purpose: string;
  /** What this source is appropriate evidence for. */
  trustedFor: string;
  /** What this source must not be treated as. */
  notTrustedFor: string;
  /** Operational or editorial caveats (merged into DB editorial_notes). */
  editorialNotes?: string;
  /** Core institutional / document stack vs optional wires or specialists. */
  isCoreSource: boolean;

  /** Trust-warning posture (synced to intel.sources). */
  trustWarningMode: TrustWarningMode;
  trustWarningLevel: TrustWarningLevel;
  requiresIndependentVerification: boolean;
  heroEligibilityMode: HeroEligibilityMode;
  /** Short, editorially reviewed explanation (tooltip/inline copy). */
  trustWarningText?: string | null;
  /** Deterministic relevance / surfacing rules (persisted to DB as JSON). */
  editorialControls?: EditorialControls;
  /** Minutes between ingest attempts when healthy; clamped 5–1440, default 30. Mirrored to intel.sources. */
  ingestIntervalMinutes?: number;
};

export type NormalizedItem = {
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  /** Feed-native image when available; OG backfill may happen at desk composition time. */
  imageUrl: string | null;
  contentHash: string;
  structured: Record<string, unknown>;
  clusterKeys: Record<string, string>;
  stateChangeType: StateChangeType;
};

export type FederalRegisterDoc = {
  title?: string;
  type?: string;
  abstract?: string | null;
  document_number?: string;
  html_url?: string;
  publication_date?: string;
  /** Public inspection filing time (ISO). */
  filed_at?: string;
};
