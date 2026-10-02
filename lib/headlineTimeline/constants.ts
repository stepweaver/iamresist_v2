/**
 * Headline timeline thresholds.
 * Attention is inferred from title overlap and source convergence.
 * No model score is involved.
 */

/** Titles further apart than this are never the same current cluster. */
export const HEADLINE_TIMELINE_WINDOW_HOURS = 36;

/** Recent source rows and Newswire items pulled into one build. */
export const HEADLINE_TIMELINE_FETCH_LIMIT = 400;

/** Clusters rendered on /brief after convergence sorting. */
export const HEADLINE_TIMELINE_DISPLAY_LIMIT = 40;

/** Calendar day for the timeline. US desk, matching the publishing day readers expect. */
export const HEADLINE_TIMELINE_TIME_ZONE = 'America/New_York';

/** Floor for titleSimilarity when two support tokens and a number already agree. */
export const HEADLINE_CLUSTER_MIN_SIMILARITY = 0.36;

/** Two support tokens and no shared number need a clearer overlap. */
export const HEADLINE_CLUSTER_LEXICAL_SIMILARITY = 0.5;

/** One shared token cannot clear this cap. */
export const HEADLINE_SINGLE_TOKEN_SCORE_CAP = 0.12;

export const RANK_PER_UNIQUE_CREATOR = 40;
export const RANK_PER_UNIQUE_NEWS_SOURCE = 32;
export const RANK_CROSS_SOURCE_BONUS = 28;
export const RANK_RECENCY_MAX = 20;
export const RANK_REPEAT_PER_EXTRA = 2;
export const RANK_REPEAT_CAP = 6;

/** Notes shown under one creator on a cluster. */
export const HEADLINE_NOTES_PER_CREATOR = 4;

export const HEADLINE_NOTE_DISPLAY_KINDS = [
  'creator_analysis',
  'event',
  'new_development',
  'claim',
  'why_it_matters',
  'context',
] as const;
