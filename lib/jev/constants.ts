/**
 * Jev shadow evaluation, milestone 1: concrete Event Thread membership.
 * `same_event` means the notes should attach to the same concrete Event Thread.
 * It does not require them to state the same proposition.
 * Later phases (note role, theme membership, creator-analysis, ranking signals)
 * are intentionally absent from this module.
 */

/** Alias sent on every shadow call. Startup refuses any other id, including jev-preview. */
export const JEV_PINNED_MODEL = 'jev-latest';
export const JEV_API_BASE_URL = 'https://api.typesafe.ai/v1';

/** Diagnostic pool. Query-level candidate recall is measured against this set. */
export const JEV_RETRIEVED_CANDIDATE_LIMIT = 10;
/** Only this prefix of the retrieved set is sent to Jev. */
export const JEV_DECISION_CANDIDATE_LIMIT = 5;

/**
 * Cap diagnostic pairs outside the raw top 5.
 * Pairs that can enter the sanitized Jev set are not capped.
 */
export const JEV_SHADOW_LABEL_CAP = 40;
/** Older sheets used this cap on V1 pairs. Current exports do not drop Jev-set pairs to meet it. */
export const JEV_SHADOW_V1_MERGE_CAP = 24;

export const JEV_NOUL_THRESHOLDS = [0.5, 0.7, 0.8, 0.9, 0.95] as const;

export const JEV_EVENT_IDENTITY_RELATIONS = [
  'same_event',
  'related_but_distinct',
  'unrelated',
  'uncertain',
] as const;

/**
 * Human judgment of an upstream Atomic Note, stored once per note id.
 * Only a `usable` note may be a Jev query or a Jev candidate.
 * Only pairs whose notes are both `usable` enter Jev accuracy denominators.
 */
export const JEV_UPSTREAM_NOTE_STATUSES = [
  'usable',
  'misattributed',
  'unsupported',
  'non_editorial',
  'unclear',
] as const;

/**
 * Human rhetorical ownership of an Atomic Note proposition.
 * Distinct from quality `status`: a note can be textually supported and still
 * voice someone other than the creator.
 */
export const JEV_SPEECH_MODES = [
  'creator_assertion',
  'creator_inference',
  'quoted_other',
  'paraphrased_other',
  'hypothetical_or_sarcastic_other',
  'unclear',
] as const;

/** Speech modes where the proposition is not the creator's own. */
export const JEV_NON_CREATOR_SPEECH_MODES = [
  'quoted_other',
  'paraphrased_other',
  'hypothetical_or_sarcastic_other',
] as const;

/**
 * Wider transcript window for speaker and rhetorical-mode review.
 * This is not evidence that the Atomic Note's factual content is supported.
 */
export const JEV_DISCOURSE_MIN_SECONDS = 90;
export const JEV_DISCOURSE_MAX_SECONDS = 180;

/** Stored artifact that supplied a wider discourse window. */
export const JEV_DISCOURSE_SOURCES = [
  'stored_podcast_transcript',
  'transcript_cache',
  'source_item_transcript',
  'unavailable',
] as const;

export const JEV_DISCOURSE_FAILURE_CACHE_MISSING = 'transcript_cache_missing';
export const JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED = 'segment_indexes_do_not_map';
export const JEV_DISCOURSE_FAILURE_NO_NEIGHBORS = 'no_neighboring_segments';
export const JEV_DISCOURSE_FAILURE_EXCERPT_EMPTY = 'excerpt_empty';

export const JEV_SHADOW_LOG_DIR = 'tmp/jev-shadow';

export const JEV_VENDOR_REQUEST_HEADERS = ['x-typesafe-request-id', 'x-request-id'] as const;
