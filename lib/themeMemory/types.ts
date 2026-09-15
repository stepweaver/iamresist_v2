/**
 * Internal Theme Memory types.
 * This is a normalization boundary for future thematic analysis, not a public content model.
 */

export const THEME_SOURCE_SYSTEMS = ['voice', 'newswire', 'intel'] as const;
export type ThemeSourceSystem = (typeof THEME_SOURCE_SYSTEMS)[number];

export const THEME_OBSERVATION_SOURCE_SYSTEMS = ['voice', 'newswire'] as const;
export type ThemeObservationSourceSystem = (typeof THEME_OBSERVATION_SOURCE_SYSTEMS)[number];

export const THEME_CANDIDATE_ROLES = [
  'creator',
  'reporting',
  'primary',
  'specialist',
  'commentary',
  'context',
] as const;
export type ThemeCandidateRole = (typeof THEME_CANDIDATE_ROLES)[number];

export const THEME_MEMORY_WINDOW_DAYS = [1, 3, 7, 14, 30] as const;
export type ThemeMemoryWindowDays = (typeof THEME_MEMORY_WINDOW_DAYS)[number];

/**
 * Max RSS items persisted per favorite creator per ingest.
 * Typical daily/weekly podcast feeds return far fewer; daily ingest accumulates
 * 7-, 14-, and 30-day history without requesting unbounded RSS backfill.
 */
export const THEME_MEMORY_ITEMS_PER_VOICE = 25;

/** Matches the existing Newswire per-source fetch cap (not a homepage display slot limit). */
export const THEME_MEMORY_ITEMS_PER_NEWSWIRE_SOURCE = 20;

/** Hard cap on Intel source_items pulled into a single theme-candidate query. */
export const THEME_MEMORY_INTEL_CANDIDATE_LIMIT = 1000;

/** Hard cap on persisted Voice/Newswire observations returned by a single query. */
export const THEME_MEMORY_OBSERVATION_QUERY_LIMIT = 4000;

export type ThemeCandidateItem = {
  id: string;
  sourceSystem: ThemeSourceSystem;
  sourceSlug: string;
  sourceName: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  externalId: string | null;
  publishedAt: string | null;
  fetchedAt: string | null;
  role: ThemeCandidateRole;
  provenanceClass?: string | null;
  deskLane?: string | null;
  sourceFamily?: string | null;
  contentHash: string;
  identityKey: string;
  metadata: Record<string, unknown>;
};

export type ThemeMemoryWindow = {
  start: Date;
  end: Date;
  days: number | null;
};

export type ThemeObservationRow = {
  id: string;
  source_system: ThemeObservationSourceSystem;
  source_slug: string;
  source_name: string;
  identity_key: string;
  external_id: string | null;
  canonical_url: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  content_hash: string;
  role: ThemeCandidateRole;
  metadata: Record<string, unknown>;
  observed_at?: string;
  created_at?: string;
  updated_at?: string;
};
