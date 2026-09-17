/**
 * Theme Memory Milestone 2 versions and deterministic thresholds.
 * Bump prompt/classification versions when membership or labeling rules change.
 */

export const THEME_MEMBERSHIP_PROMPT_VERSION = 'tm-membership-v3';
export const THEME_LABEL_PROMPT_VERSION = 'tm-label-v2';
export const THEME_CLASSIFICATION_VERSION = 'tm-classify-v3';
/** Bump when deterministic matcher/feature semantics change. */
export const THEME_DETERMINISTIC_MATCH_VERSION = 'tm-match-v4';

/**
 * Analysis cache key. A prior none/deterministic analysis must not permanently
 * block AI-assisted classification after the provider, prompt, or deterministic
 * matcher changes.
 */
export function themeClassificationCacheVersion(providerName?: string | null): string {
  const name = String(providerName || 'none').toLowerCase();
  const aiMode = name === 'none' || name === 'deterministic' ? 'none' : 'ai';
  return `${THEME_CLASSIFICATION_VERSION}:${THEME_DETERMINISTIC_MATCH_VERSION}:${aiMode}:${THEME_MEMBERSHIP_PROMPT_VERSION}`;
}

/** Membership is topical association. It is never factual corroboration. */
export const THEME_MEMBERSHIP_IS_NOT_CORROBORATION = true;

export const THEME_PROCESS_WINDOW_DAYS = 14;
export const THEME_MATCH_LOOKBACK_DAYS = 45;
export const THEME_MAX_AI_CANDIDATES_PER_ITEM = 3;
export const THEME_MAX_AI_MEMBERSHIP_CHECKS_PER_RUN = 80;
export const THEME_MAX_AI_LABELS_PER_RUN = 20;
export const THEME_MAX_REASONS = 8;
export const THEME_MAX_REASON_CHARS = 160;
export const THEME_MAX_LABEL_CHARS = 80;
export const THEME_MAX_HEADLINE_CHARS = 140;
export const THEME_MAX_SUMMARY_CHARS = 400;

/**
 * Deterministic candidate narrowing.
 * False merges are worse than temporary duplicate themes.
 */
export const THEME_CANDIDATE_MIN_SCORE = 0.32;
export const THEME_DETERMINISTIC_ACCEPT_SCORE = 0.72;
export const THEME_DETERMINISTIC_MIN_DISTINCTIVE = 2;
export const THEME_STRONG_SUBJECT_MIN_LENGTH = 6;

export const THEME_LIFECYCLE_THRESHOLDS = {
  /** First appeared recently with little history. */
  NEW_MAX_AGE_DAYS: 3,
  NEW_MAX_ACTIVE_DAYS_14: 1,
  /** Active on multiple recent days and attention increasing. */
  DEVELOPING_MIN_ACTIVE_DAYS_7: 2,
  DEVELOPING_MIN_MOMENTUM: 1.15,
  /** Present across several distinct days. */
  PERSISTENT_MIN_ACTIVE_DAYS_14: 4,
  /** Previously active but activity recently falling. */
  COOLING_MAX_MOMENTUM: 0.55,
  COOLING_MIN_DAYS_SINCE_ACTIVITY: 3,
  COOLING_MIN_ACTIVE_DAYS_14: 2,
  /** No meaningful creator activity for this many UTC days. */
  DORMANT_DAYS_WITHOUT_CREATOR: 10,
  /** Inactive/cooling period followed by significant new creator activity. */
  RESURGE_MIN_TODAY_CREATOR_ITEMS: 1,
  RESURGE_MIN_MOMENTUM: 1.25,
} as const;

export const THEME_SIGNAL_FORMULAS = {
  CREATOR_MOMENTUM_PRIOR_DAYS: 6,
  EVIDENCE_PRIMARY_WEIGHT: 2,
  EVIDENCE_SPECIALIST_WEIGHT: 1,
  EVIDENCE_REPORTING_WEIGHT: 1,
  SYNDICATION_TITLE_JACCARD: 0.85,
} as const;
