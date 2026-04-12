export type ProvenanceClass =
  | 'PRIMARY'
  | 'WIRE'
  | 'SPECIALIST'
  | 'INDIE'
  | 'COMMENTARY'
  | 'SCHEDULE';

export type FetchKind = 'rss' | 'json_api';

/** Hint for rule-based copy; separate from future procedural_stage on events. */
export type StateChangeType =
  | 'unknown'
  | 'pre_publication'
  | 'published_document'
  | 'press_statement'
  | 'legislative_feed_item'
  | 'congressional_record_feed_item'
  | 'wire_item'
  | 'specialist_item';

export type IngestRunStatus = 'running' | 'success' | 'partial' | 'failed';

export type SignalSourceConfig = {
  slug: string;
  name: string;
  provenanceClass: ProvenanceClass;
  fetchKind: FetchKind;
  /** When null/empty, source is skipped (wire URLs from env). */
  endpointUrl: string | null;
  isEnabled: boolean;
  /** Shown in Live UI / ops; not user-facing essay. */
  notes?: string;
};

export type NormalizedItem = {
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
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
