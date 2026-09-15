import type { ThemeSourceSystem } from '@/lib/themeMemory/types';

export const THEME_LIFECYCLES = [
  'new',
  'developing',
  'persistent',
  'cooling',
  'resurging',
  'dormant',
] as const;
export type ThemeLifecycle = (typeof THEME_LIFECYCLES)[number];

export const MEMBERSHIP_METHODS = ['deterministic', 'ai', 'manual'] as const;
export type MembershipMethod = (typeof MEMBERSHIP_METHODS)[number];

export const THEME_MEMBER_ROLES = [
  'creator',
  'reporting',
  'primary',
  'specialist',
  'commentary',
  'context',
] as const;
export type ThemeMemberRole = (typeof THEME_MEMBER_ROLES)[number];

export const THEME_ITEM_ANALYSIS_DECISIONS = ['attached', 'seeded', 'no_match'] as const;
export type ThemeItemAnalysisDecision = (typeof THEME_ITEM_ANALYSIS_DECISIONS)[number];

/**
 * Topical membership decision.
 * `belongs` means the item is about the same sustained subject.
 * It does NOT mean claims in the item are corroborated.
 */
export type ThemeMembershipDecision = {
  belongs: boolean;
  confidence: number;
  reasons: string[];
};

export type ThemeLabelResult = {
  canonicalLabel: string;
  headline: string;
  summary: string;
};

export type ThemeLabelMetadata = {
  provider: string;
  model: string | null;
  promptVersion: string;
  generatedAt: string;
  memberFingerprint: string;
};

export type ThemeRecord = {
  id: string;
  slug: string;
  canonical_label: string;
  display_headline: string | null;
  summary: string | null;
  first_seen_at: string;
  last_seen_at: string;
  lifecycle_status: ThemeLifecycle;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ThemeMembershipRecord = {
  id: string;
  theme_id: string;
  source_system: ThemeSourceSystem;
  source_slug: string;
  source_name: string;
  identity_key: string;
  canonical_url: string;
  title: string;
  summary: string | null;
  published_at: string | null;
  item_observed_at: string;
  member_role: ThemeMemberRole;
  membership_confidence: number;
  membership_method: MembershipMethod;
  membership_reasons: string[];
  content_hash: string;
  classification_version: string;
  membership_prompt_version: string | null;
  provenance_class: string | null;
  desk_lane: string | null;
  source_family: string | null;
  first_assigned_at: string;
  last_confirmed_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ThemeDailySignalRecord = {
  theme_id: string;
  signal_date: string;
  creator_count: number;
  creator_item_count: number;
  newswire_source_count: number;
  newswire_item_count: number;
  intel_source_count: number;
  intel_item_count: number;
  primary_source_count: number;
  specialist_source_count: number;
  creator_breadth: number;
  active_days_7: number;
  active_days_14: number;
  active_days_30: number;
  creator_momentum: number;
  evidence_depth: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ThemeItemAnalysisRecord = {
  source_system: ThemeSourceSystem;
  source_slug: string;
  identity_key: string;
  content_hash: string;
  classification_version: string;
  theme_id: string | null;
  decision: ThemeItemAnalysisDecision;
  membership_method: MembershipMethod | null;
  reasons: string[];
  created_at: string;
  updated_at: string;
};

export type ThemeFingerprint = {
  distinctiveTokens: string[];
  supportingTokens: string[];
  phrases: string[];
  weakEntities: string[];
  clusterKeys: Record<string, string>;
  actionHints: string[];
  eventType: string | null;
};

export type ThemeCandidateMatch = {
  theme: ThemeRecord;
  score: number;
  sharedDistinctive: string[];
  sharedPhrases: string[];
  sharedClusterKeys: string[];
  sharedSupporting: string[];
  distinctiveAnchor: boolean;
  weakEntityOnly: boolean;
  reasons: string[];
};

export type ThemeAIFailure = {
  kind: 'unavailable' | 'invalid' | 'timeout' | 'error';
  message: string;
};
