/**
 * Atomic Creator Notes Milestone 1 versions and bounds.
 * Bump CREATOR_NOTE_EXTRACTION_VERSION when prompt, validation, or content-role
 * filtering changes what can be written into the corpus.
 */

export const CREATOR_NOTE_EXTRACTION_VERSION = 'creator-notes-v1.12';
export const CREATOR_NOTE_PROMPT_VERSION = 'creator-notes-prompt-v1.10';
export const CREATOR_NOTES_DEFAULT_MODEL = 'gemma3:4b';
export const CREATOR_NOTES_GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';
export const CREATOR_NOTES_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const CREATOR_NOTES_AI_PROVIDERS = ['groq', 'ollama'] as const;
export const CREATOR_NOTES_OLLAMA_KEEP_ALIVE_DEFAULT = '5m';
/** Version the canonical transcript normalizer. Bump when segment merge/text rules change. */
export const CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION = 'transcript-norm-v1';
/** Production default: one evidence window per text-inference request. */
export const CREATOR_NOTES_WINDOW_BATCH_SIZE_DEFAULT = 1;
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
 * Podcast batch --limit counts successful processing.
 * The scan window is how many eligible episodes may be inspected to fill that quota.
 * Default is max(floor, limit * multiplier), still inside the recency window.
 */
export const CREATOR_NOTES_BATCH_SCAN_FLOOR = 10;
export const CREATOR_NOTES_BATCH_SCAN_MULTIPLIER = 5;
export const CREATOR_NOTES_BATCH_SCAN_HARD_MAX = 250;

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

function optString(name: string): string {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).trim();
}

/**
 * Ollama and legacy model resolution. Independent of Theme Memory.
 * An explicit CREATOR_NOTES_MODEL wins.
 * Otherwise the shared Ollama model (OLLAMA_MODEL), then gemma3:4b.
 * Groq does not use this fallback; creatorNotesModelForProvider() applies openai/gpt-oss-20b.
 */
export function creatorNotesModel(sharedOllamaModel?: string | null): string {
  const dedicated = optString('CREATOR_NOTES_MODEL');
  if (dedicated) return dedicated;
  const shared = String(sharedOllamaModel || '').trim();
  if (shared) return shared;
  return CREATOR_NOTES_DEFAULT_MODEL;
}

export type CreatorNotesAiProviderName = (typeof CREATOR_NOTES_AI_PROVIDERS)[number];

/**
 * CREATOR_NOTES_AI_PROVIDER selects Creator Notes text inference (`groq` or `ollama`).
 * An explicit value does not consult THEME_AI_PROVIDER, so Theme Memory does not need to be ollama when Groq is selected.
 * When CREATOR_NOTES_AI_PROVIDER is unset, THEME_AI_PROVIDER=ollama keeps the legacy local path.
 * Any other Theme Memory provider is not a Creator Notes provider.
 */
export function creatorNotesAiProvider(themeAiProvider?: string | null): string {
  const dedicated = optString('CREATOR_NOTES_AI_PROVIDER').toLowerCase();
  if (dedicated) return dedicated;
  const fromEnv = optString('THEME_AI_PROVIDER').toLowerCase();
  const theme = fromEnv || String(themeAiProvider || '').trim().toLowerCase();
  if (theme === 'ollama') return 'ollama';
  return '';
}

/**
 * Model for the selected text provider.
 * An explicit CREATOR_NOTES_MODEL wins for groq and ollama.
 * Groq falls back to openai/gpt-oss-20b and does not inherit an Ollama model name.
 * Ollama falls back through creatorNotesModel(): OLLAMA_MODEL, then gemma3:4b.
 */
export function creatorNotesModelForProvider(provider: string, sharedOllamaModel?: string | null): string {
  const dedicated = optString('CREATOR_NOTES_MODEL');
  if (dedicated) return dedicated;
  if (String(provider || '').toLowerCase() === 'groq') return CREATOR_NOTES_GROQ_DEFAULT_MODEL;
  return creatorNotesModel(sharedOllamaModel);
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

/**
 * Creator Notes Ollama keep-alive is independent of Theme Memory's 30m warm-up.
 * Production default: CREATOR_NOTES_OLLAMA_KEEP_ALIVE=5m
 */
export function creatorNotesOllamaKeepAlive(): string {
  const dedicated = optString('CREATOR_NOTES_OLLAMA_KEEP_ALIVE');
  if (dedicated) return dedicated;
  return CREATOR_NOTES_OLLAMA_KEEP_ALIVE_DEFAULT;
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
