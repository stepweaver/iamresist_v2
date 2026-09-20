/**
 * Atomic Creator Notes Milestone 1 versions and bounds.
 * Bump CREATOR_NOTE_EXTRACTION_VERSION when prompt or validation semantics change.
 */

export const CREATOR_NOTE_EXTRACTION_VERSION = 'creator-notes-v1.6';
export const CREATOR_NOTE_PROMPT_VERSION = 'creator-notes-prompt-v1.6';
export const CREATOR_NOTES_DEFAULT_MODEL = 'gemma3:4b';
/** Version the canonical transcript normalizer. Bump when segment merge/text rules change. */
export const CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION = 'transcript-norm-v1';
export const CREATOR_NOTES_WINDOW_BATCH_SIZE_DEFAULT = 5;
export const CREATOR_NOTES_WINDOW_BATCH_MAX_INPUT_CHARS_DEFAULT = 9000;

export const CREATOR_NOTE_KINDS = [
  'event',
  'claim',
  'new_development',
  'context',
  'evidence_reference',
  'creator_analysis',
  'why_it_matters',
] as const;

export const VERIFICATION_STATUSES = [
  'unverified',
  'supported',
  'disputed',
  'contradicted',
  'not_applicable',
] as const;

export const CREATOR_NOTE_RUN_STATUSES = ['running', 'success', 'partial', 'failed'] as const;

/** Kinds that require a human-readable speaker attribution. */
export const ATTRIBUTION_REQUIRED_KINDS = ['claim', 'creator_analysis', 'why_it_matters'] as const;

export type CreatorNoteKind = (typeof CREATOR_NOTE_KINDS)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type CreatorNoteRunStatus = (typeof CREATOR_NOTE_RUN_STATUSES)[number];
export type AttributionRequiredKind = (typeof ATTRIBUTION_REQUIRED_KINDS)[number];

export const CREATOR_NOTES_TEXT_MIN_CHARS = 20;
export const CREATOR_NOTES_TEXT_PREFERRED_CHARS = 350;
export const CREATOR_NOTES_TEXT_MAX_CHARS = 500;
export const CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS = 500;
export const CREATOR_NOTES_SOURCE_QUOTE_MAX_CHARS = 500;
export const CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS = 2000;
export const CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS = 3;
export const CREATOR_NOTES_SOURCE_INDEX_MAX_GAP = 1;
export const CREATOR_NOTES_MAX_SOURCE_SEGMENT_INDEXES = 48;
export const CREATOR_NOTES_EVIDENCE_DURATION_FLAG_SECONDS = 90;
export const CREATOR_NOTES_EVIDENCE_DURATION_MAX_SECONDS = 180;
export const CREATOR_NOTES_NEAR_DUPLICATE_SIMILARITY = 0.85;
export const CREATOR_NOTES_COMPOUND_NUMERIC_LIMIT = 4;
export const CREATOR_NOTES_COMPOUND_SENTENCE_LIMIT = 2;
export const CREATOR_NOTES_MAX_NOTES_PER_CHUNK_DEFAULT = 8;
export const CREATOR_NOTES_EVIDENCE_WINDOW_MIN_SECONDS = 30;
export const CREATOR_NOTES_EVIDENCE_WINDOW_TARGET_SECONDS = 45;
export const CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS = 60;
export const CREATOR_NOTES_EVIDENCE_WINDOW_MIN_CHARS = 800;
export const CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS = 1500;
export const CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS = 12;
export const CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_CHARS = 200;
export const CREATOR_NOTES_CHUNK_CHARS_DEFAULT = 1500;
export const CREATOR_NOTES_CHUNK_OVERLAP_CHARS = 200;
export const CREATOR_NOTES_RETRY_CHUNK_CHARS_FLOOR = 400;
export const CREATOR_NOTES_TRANSPORT_BACKOFF_MS = 750;
export const CREATOR_NOTES_AI_TIMEOUT_MS_DEFAULT = 300000;
export const GENERIC_SPEAKER_ATTRIBUTION = 'The speaker';

/** Bounded Voice ingest. Never allow an unbounded batch. */
export const CREATOR_NOTES_BATCH_DEFAULT_LIMIT = 10;
export const CREATOR_NOTES_BATCH_HARD_MAX = 50;
export const CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS = 48;
export const CREATOR_NOTES_BATCH_MAX_SINCE_HOURS = 168;

/**
 * Automatic YouTube caption ingest is preserved in code but disabled from
 * default batch selection. Podcast transcript intake is the current path.
 */
export const CREATOR_NOTES_YOUTUBE_BATCH_ENABLED = false;
export const CREATOR_NOTES_REVIEW_DEFAULT_LIMIT = 25;
export const CREATOR_NOTES_REVIEW_HARD_MAX = 200;

export const CREATOR_NOTES_MAX_ACTORS = 12;
export const CREATOR_NOTES_MAX_INSTITUTIONS = 12;
export const CREATOR_NOTES_MAX_LOCATIONS = 8;
export const CREATOR_NOTES_MAX_REFERENCED_DOCUMENTS = 12;
export const CREATOR_NOTES_EVENT_FEATURE_STRING_MAX = 160;
export const CREATOR_NOTES_ATTRIBUTION_MAX = 120;
export const CREATOR_NOTES_ACTION_MAX = 200;
export const CREATOR_NOTES_OBJECT_MAX = 200;

function optInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

export function creatorNotesChunkChars(): number {
  return optInt('CREATOR_NOTES_CHUNK_CHARS', CREATOR_NOTES_CHUNK_CHARS_DEFAULT);
}

export function creatorNotesMaxNotesPerChunk(): number {
  return optInt('CREATOR_NOTES_MAX_NOTES_PER_CHUNK', CREATOR_NOTES_MAX_NOTES_PER_CHUNK_DEFAULT);
}

export function creatorNotesAiTimeoutMs(): number {
  return optInt('CREATOR_NOTES_AI_TIMEOUT_MS', CREATOR_NOTES_AI_TIMEOUT_MS_DEFAULT);
}

export function creatorNotesRetryChunkChars(parentCharCount: number): number {
  const parent = Number.isFinite(parentCharCount) && parentCharCount > 0 ? parentCharCount : creatorNotesChunkChars();
  if (parent <= CREATOR_NOTES_RETRY_CHUNK_CHARS_FLOOR) return parent;
  return Math.max(CREATOR_NOTES_RETRY_CHUNK_CHARS_FLOOR, Math.floor(parent / 2));
}

export function creatorNotesWindowBatchSize(): number {
  const n = optInt('CREATOR_NOTES_WINDOW_BATCH_SIZE', CREATOR_NOTES_WINDOW_BATCH_SIZE_DEFAULT);
  return Math.min(6, Math.max(1, n));
}

export function creatorNotesWindowBatchMaxInputChars(): number {
  return optInt('CREATOR_NOTES_WINDOW_BATCH_MAX_INPUT_CHARS', CREATOR_NOTES_WINDOW_BATCH_MAX_INPUT_CHARS_DEFAULT);
}
