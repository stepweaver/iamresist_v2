/**
 * Event Threads V1 — interpretive layer above Atomic Creator Notes.
 * Bump EVENT_THREADS_VERSION when prompt or identity/resolution semantics change.
 */

export const EVENT_THREADS_VERSION = 'event-threads-v1.1';
export const EVENT_THREADS_PROMPT_VERSION = 'event-threads-prompt-v1.1';
export const EVENT_THREADS_DEFAULT_MODEL = 'gemma3:4b';
export const EVENT_THREADS_OLLAMA_KEEP_ALIVE_DEFAULT = '5m';
export const EVENT_THREADS_AI_TIMEOUT_MS_DEFAULT = 300000;
export const EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS = 500;
export const EVENT_THREADS_TITLE_MAX_CHARS = 160;
export const EVENT_THREADS_SUMMARY_MAX_CHARS = 400;
export const EVENT_THREADS_NEIGHBOR_NOTE_LIMIT = 4;
export const EVENT_THREADS_INTEL_CANDIDATE_LIMIT = 400;
export const EVENT_THREADS_INTEL_LINK_LIMIT = 12;
export const EVENT_THREADS_TIME_PROXIMITY_DAYS = 14;

export const EVENT_THREAD_STATUSES = ['proposed', 'active', 'merged', 'closed'] as const;

export const EVENT_THREAD_ENTRY_KINDS = [
  'event',
  'development',
  'claim',
  'context',
  'evidence_reference',
  'creator_analysis',
  'why_it_matters',
] as const;

export const EVENT_THREAD_RESOLUTION_TYPES = [
  'literal',
  'coreference',
  'semantic_role',
  'ellipsis',
  'discourse_context',
  'creator_analysis',
  'uncertain',
] as const;

export const EVENT_THREAD_CONFIDENCE_VALUES = ['high', 'medium', 'low', 'uncertain'] as const;

export const EVENT_THREAD_TIME_PROVENANCES = [
  'explicit_event_time',
  'source_publication_time',
  'unknown',
] as const;

export const EVENT_THREAD_LINK_KINDS = ['intel', 'osint', 'creator', 'evidence'] as const;

export const FACTUAL_ENTRY_KINDS = ['event', 'development', 'claim', 'context'] as const;
export const ANALYSIS_ENTRY_KINDS = ['creator_analysis', 'why_it_matters'] as const;

export const NOTE_KIND_TO_ENTRY_KIND = {
  event: 'event',
  new_development: 'development',
  claim: 'claim',
  context: 'context',
  evidence_reference: 'evidence_reference',
  creator_analysis: 'creator_analysis',
  why_it_matters: 'why_it_matters',
} as const;

/**
 * Broad topics that are never enough to identify or merge a thread.
 * Same person/country overlap alone must not merge threads.
 */
export const GENERIC_THREAD_ENTITIES = [
  'iran',
  'iranian',
  'iranians',
  'hormuz',
  'strait of hormuz',
  'trump',
  'donald trump',
  'president trump',
  'united states',
  'u.s.',
  'u.s',
  'usa',
  'us',
  'america',
  'american',
  'americans',
  'china',
  'chinese',
  'israel',
  'israeli',
  'russia',
  'russian',
  'gulf',
  'persian gulf',
  'middle east',
  'pentagon',
  'white house',
  'administration',
  'president',
  'washington',
  'military',
  'escalation',
  'defense',
  'war',
  'conflict',
  'region',
  'regional',
] as const;

export const GENERIC_THREAD_STOPWORDS = [
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'after',
  'before',
  'about',
  'into',
  'over',
  'under',
  'than',
  'then',
  'them',
  'they',
  'their',
  'its',
  'his',
  'her',
  'she',
  'him',
  'who',
  'what',
  'when',
  'where',
  'which',
  'while',
  'also',
  'even',
  'still',
  'just',
  'very',
  'more',
  'most',
  'some',
  'many',
  'much',
  'such',
  'only',
  'same',
  'other',
  'another',
  'each',
  'both',
  'between',
  'among',
  'because',
  'however',
  'therefore',
  'says',
  'said',
  'argues',
  'notes',
  'cites',
  'according',
  'speaker',
  'creator',
  'professor',
  'official',
  'officials',
  'people',
  'region',
  'regional',
  'military',
  'event',
  'events',
  'story',
  'stories',
  'least',
  'separate',
  'several',
  'occurred',
  'occurs',
  'occur',
  'happened',
  'happens',
  'toward',
  'towards',
] as const;

/** Verbs that must not define thread identity on their own. */
export const GENERIC_IDENTITY_VERBS = [
  'says',
  'said',
  'argues',
  'argue',
  'notes',
  'cites',
  'cite',
  'according',
  'announced',
  'announce',
  'announces',
  'held',
  'hold',
  'holds',
  'trying',
  'tried',
  'tries',
  'looks',
  'looking',
  'looked',
  'going',
  'using',
  'making',
  'taking',
  'getting',
  'being',
  'doing',
  'having',
  'launched',
  'launch',
  'launches',
  'fired',
  'fires',
  'fire',
  'attacked',
  'attacks',
  'attack',
  'escalating',
  'escalate',
  'escalates',
  'intercept',
  'intercepts',
  'intercepted',
  'destroyed',
  'destroy',
  'ground',
  'grounded',
  'widened',
  'widen',
  'expanded',
  'expand',
  'occurred',
  'occurs',
  'occur',
  'happened',
  'reported',
  'reports',
  'believes',
  'believe',
  'thinks',
  'considers',
  'consider',
  'claims',
  'claimed',
] as const;

export const GENERIC_IDENTITY_ADJECTIVES = [
  'new',
  'old',
  'big',
  'small',
  'major',
  'minor',
  'recent',
  'current',
  'latest',
  'separate',
  'several',
  'least',
  'official',
  'public',
  'broader',
  'wider',
  'strong',
  'weak',
  'quiet',
  'quietly',
  'desperate',
  'possible',
  'likely',
  'unlikely',
] as const;

export const GENERIC_NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'hundred',
  'thousand',
  'million',
  'billion',
] as const;

/**
 * Common nouns that can appear in many unrelated stories.
 * Useful inside a distinctive phrase, never as a merge key alone.
 */
export const WEAK_EVENT_NOUNS = [
  'missile',
  'missiles',
  'rocket',
  'rockets',
  'drone',
  'drones',
  'ship',
  'ships',
  'plane',
  'planes',
  'force',
  'forces',
  'troop',
  'troops',
  'attack',
  'attacks',
  'strike',
  'strikes',
  'war',
  'conflict',
  'event',
  'events',
  'story',
  'stories',
  'situation',
  'issue',
  'issues',
  'action',
  'actions',
  'system',
  'systems',
  'support',
  'statement',
  'statements',
  'year',
  'years',
  'state',
  'states',
  'port',
  'ports',
  'public',
  'billion',
  'defense',
  'zone',
  'warning',
  'target',
  'targets',
  'data',
] as const;

/**
 * Generic Intel/OSINT tokens. Overlap on these never qualifies a candidate.
 */
export const GENERIC_INTEL_TOKENS = [
  'system',
  'systems',
  'defense',
  'state',
  'states',
  'billion',
  'port',
  'ports',
  'military',
  'year',
  'years',
  'support',
  'statement',
  'statements',
  'public',
  'attack',
  'attacks',
  'official',
  'officials',
  'government',
  'security',
  'report',
  'reports',
  'article',
  'news',
] as const;

export type EventThreadStatus = (typeof EVENT_THREAD_STATUSES)[number];
export type EventThreadEntryKind = (typeof EVENT_THREAD_ENTRY_KINDS)[number];
export type EventThreadResolutionType = (typeof EVENT_THREAD_RESOLUTION_TYPES)[number];
export type EventThreadConfidence = (typeof EVENT_THREAD_CONFIDENCE_VALUES)[number];
export type EventThreadTimeProvenance = (typeof EVENT_THREAD_TIME_PROVENANCES)[number];
export type EventThreadLinkKind = (typeof EVENT_THREAD_LINK_KINDS)[number];

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

export function eventThreadsModel(sharedOllamaModel?: string | null): string {
  const dedicated = optString('EVENT_THREADS_MODEL') || optString('CREATOR_NOTES_MODEL');
  if (dedicated) return dedicated;
  const shared = String(sharedOllamaModel || '').trim();
  if (shared) return shared;
  return EVENT_THREADS_DEFAULT_MODEL;
}

export function eventThreadsAiTimeoutMs(): number {
  return optInt(
    'EVENT_THREADS_AI_TIMEOUT_MS',
    optInt('CREATOR_NOTES_AI_TIMEOUT_MS', EVENT_THREADS_AI_TIMEOUT_MS_DEFAULT),
  );
}

export function eventThreadsOllamaKeepAlive(): string {
  const dedicated = optString('EVENT_THREADS_OLLAMA_KEEP_ALIVE') || optString('CREATOR_NOTES_OLLAMA_KEEP_ALIVE');
  if (dedicated) return dedicated;
  return EVENT_THREADS_OLLAMA_KEEP_ALIVE_DEFAULT;
}
