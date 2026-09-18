/**
 * Atomic Creator Notes Milestone 1 versions and bounds.
 * Bump CREATOR_NOTE_EXTRACTION_VERSION when prompt or validation semantics change.
 */

export const CREATOR_NOTE_EXTRACTION_VERSION = 'creator-notes-v1.2';
export const CREATOR_NOTE_PROMPT_VERSION = 'creator-notes-prompt-v1.2';
export const CREATOR_NOTES_DEFAULT_MODEL = 'gemma3:4b';

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
export const CREATOR_NOTES_TEXT_MAX_CHARS = 800;
export const CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS = 500;
export const CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS = 800;
export const CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS = 3;
export const CREATOR_NOTES_SOURCE_INDEX_MAX_GAP = 1;
export const CREATOR_NOTES_MAX_SOURCE_SEGMENT_INDEXES = 8;
export const CREATOR_NOTES_MAX_NOTES_PER_CHUNK_DEFAULT = 30;
export const CREATOR_NOTES_CHUNK_CHARS_DEFAULT = 12000;
export const CREATOR_NOTES_CHUNK_OVERLAP_CHARS = 800;
export const GENERIC_SPEAKER_ATTRIBUTION = 'The speaker';

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
