/**
 * Central semantic-feature strength for Theme Memory matching.
 *
 * A weak/low-information feature can SUPPORT a match.
 * It must not, by itself, create a strong deterministic match.
 *
 * Keep this file the single place for weak/supporting/strong rules.
 * Do not scatter one-off stopword checks through candidate scoring.
 */

export type SemanticFeatureStrength = 'strong' | 'supporting' | 'weak';

/**
 * Famous-person surnames. These are weak as standalone story identity,
 * but they can complete a First+Last named-entity span.
 */
const WEAK_PERSON_ENTITY_TOKENS = new Set([
  'trump',
  'biden',
  'obama',
  'harris',
  'vance',
  'clinton',
  'musk',
  'putin',
  'zelensky',
  'netanyahu',
  'miller',
  'bondi',
  'desantis',
  'newsom',
  'johnson',
  'mcconnell',
  'schumer',
  'pelosi',
]);

/**
 * Broad country, party, institution, office, and celebrity tokens.
 * Matching only on these is not enough to claim the same subject.
 */
const WEAK_ENTITY_TOKENS = new Set([
  ...WEAK_PERSON_ENTITY_TOKENS,
  'president',
  'presidential',
  'administration',
  'government',
  'american',
  'america',
  'officials',
  'official',
  'people',
  'white',
  'house',
  'congress',
  'senate',
  'court',
  'supreme',
  'scotus',
  'united',
  'states',
  'stat',
  'usa',
  'canada',
  'canadian',
  'mexico',
  'mexican',
  'china',
  'chinese',
  'russia',
  'russian',
  'israel',
  'israeli',
  'ukraine',
  'ukrainian',
  'britain',
  'british',
  'germany',
  'german',
  'france',
  'french',
  'europe',
  'european',
  'republican',
  'republicans',
  'democrat',
  'democrats',
  'democratic',
  'gop',
  'party',
  'election',
  'elections',
  'campaign',
  'vote',
  'voting',
  'voter',
  'senator',
  'representative',
  'representatives',
  'congressman',
  'congresswoman',
  'lawmaker',
  'lawmakers',
]);

/**
 * Function / glue words that survive tokenization but never identify a story.
 */
const FUNCTION_WORDS = new Set([
  'during',
  'another',
  'other',
  'others',
  'against',
  'because',
  'through',
  'while',
  'under',
  'above',
  'below',
  'between',
  'without',
  'within',
  'among',
  'across',
  'every',
  'each',
  'both',
  'same',
  'such',
  'most',
  'some',
  'many',
  'much',
  'using',
  'based',
  'related',
  'including',
  'includes',
  'include',
  'himself',
  'herself',
  'itself',
  'themselves',
  'down',
  'could',
]);

/**
 * Social/video boilerplate and generic news verbs. These are noise, not story identity.
 */
const BOILERPLATE_WEAK_TOKENS = new Set([
  'short',
  'shorts',
  'live',
  'latestnews',
  'latestnew',
  'breaking',
  'omg',
  'just',
  'goes',
  'get',
  'gets',
  'today',
  'year',
  'years',
  'major',
  'brutal',
  'nightmare',
  'feared',
  'trying',
  'try',
  'make',
  'makes',
  'making',
  'again',
  'lose',
  'losing',
  'lost',
  'dark',
]);

/**
 * Generic process / legal / news words. Useful as supporting context
 * when a distinctive object already exists; not a subject by themselves.
 */
const SUPPORTING_TOKENS = new Set([
  'order',
  'orders',
  'case',
  'cases',
  'hearing',
  'hear',
  'hears',
  'heard',
  'ruling',
  'decision',
  'opinion',
  'list',
  'lists',
  'block',
  'blocks',
  'blocked',
  'announce',
  'announces',
  'announced',
  'action',
  'actions',
  'policy',
  'policies',
  'bill',
  'bills',
  'executive',
  'lawsuit',
  'lawsuits',
  'legislation',
  'memorandum',
  'memo',
  'memos',
  'regulation',
  'regulations',
  'proclamation',
  'proclamations',
  'filing',
  'filings',
  'complaint',
  'complaints',
  'law',
  'laws',
  'legal',
  'justice',
  'department',
  'agency',
  'office',
  'offices',
  'committee',
  'commission',
  'judge',
  'judges',
  'justices',
  'plan',
  'plans',
  'rule',
  'rules',
  'notice',
  'notices',
  'continue',
  'continues',
  'coverage',
  'cover',
  'tracked',
  'creator',
  'creators',
  'began',
  'latestnew',
  'explained',
  'explainer',
  'fight',
  'dispute',
  'issue',
  'issues',
  'candidate',
  'candidates',
  'consider',
  'considers',
  'files',
  'filed',
  'file',
  'update',
  'updates',
  'into',
  'from',
  'those',
  'them',
  'also',
  'have',
  'been',
  'will',
  'your',
  'city',
  'major',
  'break',
  'unrelated',
  'controversy',
  'debate',
  'bombshell',
  'bombshells',
  'breaking',
  'headline',
  'headlines',
  'secretary',
  'federal',
  'attack',
  'attacks',
  'attacked',
  'return',
  'returns',
  'returned',
  'camera',
  'cameras',
  'fighter',
  'fighters',
  'shot',
  'shots',
  'shoot',
  'shooting',
  'shootdown',
  'public',
  'chance',
  'risk',
  'risks',
]);

/**
 * Policy/action words that remain distinctive even when short.
 * Mirrored in features.ts action-hint extraction.
 */
const DISTINCTIVE_ACTION_TOKENS = new Set([
  'tariff',
  'tariffs',
  'immigration',
  'raid',
  'raids',
  'deploy',
  'deployment',
  'surveillance',
  'injunction',
  'subpoena',
  'detention',
  'fisa',
  'impeach',
  'pardon',
  'sanction',
  'strike',
  'indict',
  'deport',
  'ballot',
  'gerrymander',
  'national',
  'guard',
  'troops',
  'militia',
  'appeal',
  'emergency',
  'authority',
  'domestically',
  'domestic',
]);

/**
 * Institutional office/branch adjectives. These name a class of actor, not
 * a specific event. They may complete a document-type phrase.
 */
const INSTITUTIONAL_TYPE_MODIFIERS = new Set([
  'executive',
  'presidential',
  'congressional',
  'legislative',
  'judicial',
  'federal',
  'court',
  'supreme',
  'senate',
  'house',
  'congress',
  'agency',
  'department',
  'government',
  'administration',
  'president',
  'white',
]);

/**
 * Document / proceeding nouns. Sharing the TYPE of instrument is not the
 * same as sharing a specific order, case, bill, or hearing.
 */
const INSTITUTIONAL_DOCUMENT_NOUNS = new Set([
  'order',
  'orders',
  'ruling',
  'decision',
  'opinion',
  'regulation',
  'regulations',
  'rule',
  'rules',
  'hearing',
  'hearings',
  'lawsuit',
  'lawsuits',
  'bill',
  'bills',
  'legislation',
  'memorandum',
  'memo',
  'memos',
  'proclamation',
  'proclamations',
  'notice',
  'notices',
  'filing',
  'filings',
  'complaint',
  'complaints',
]);

/**
 * Multi-word low-information phrases. Token-level weakness already covers
 * most of these; the set exists so a remaining unstemmed phrase cannot
 * become a strong shared_phrase by itself.
 */
const WEAK_PHRASES = new Set([
  'supreme court',
  'united states',
  'united stat',
  'white house',
  'republican party',
  'democratic party',
  'republican senate',
  'democratic senate',
  'senate candidate',
  'senate hearing',
  'senate debate',
  'house hearing',
  'republican candidate',
  'democratic candidate',
  'supreme court ruling',
  'supreme court decision',
  'house representatives',
  'federal government',
  'latest news',
  'shot down',
  'year today',
  'trump goes',
  'goes dark',
  'could lose',
  'just again',
  'trying make',
]);

export function stemThemeToken(token: string): string {
  const t = token.toLowerCase();
  if (t.endsWith('tion') && t.length > 8) return t.slice(0, -4);
  if (t.endsWith('ments') && t.length > 8) return t.slice(0, -5);
  if (t.endsWith('ment') && t.length > 7) return t.slice(0, -4);
  if (t.endsWith('ing') && t.length > 6) return t.slice(0, -3);
  if (t.endsWith('ers') && t.length > 6) return t.slice(0, -3);
  if (t.endsWith('ies') && t.length > 5) return `${t.slice(0, -3)}y`;
  if (t.endsWith('es') && t.length > 5 && !t.endsWith('sses')) return t.slice(0, -2);
  if (t.endsWith('s') && t.length > 4 && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

export function isWeakEntityToken(token: string): boolean {
  const raw = token.toLowerCase();
  const stemmed = stemThemeToken(token);
  return WEAK_ENTITY_TOKENS.has(stemmed) || WEAK_ENTITY_TOKENS.has(raw);
}

export function isWeakPersonEntityToken(token: string): boolean {
  const raw = token.toLowerCase();
  const stemmed = stemThemeToken(token);
  return WEAK_PERSON_ENTITY_TOKENS.has(stemmed) || WEAK_PERSON_ENTITY_TOKENS.has(raw);
}

function isBoilerplateToken(token: string): boolean {
  const raw = token.toLowerCase();
  const stemmed = stemThemeToken(raw);
  if (BOILERPLATE_WEAK_TOKENS.has(raw) || BOILERPLATE_WEAK_TOKENS.has(stemmed)) return true;
  for (const candidate of BOILERPLATE_WEAK_TOKENS) {
    if (stemThemeToken(candidate) === stemmed) return true;
  }
  return false;
}

function isCalendarYearToken(token: string): boolean {
  return /^\d{4}$/.test(token);
}

export function isDistinctiveActionToken(token: string): boolean {
  const raw = token.toLowerCase();
  const stemmed = stemThemeToken(token);
  return DISTINCTIVE_ACTION_TOKENS.has(stemmed) || DISTINCTIVE_ACTION_TOKENS.has(raw) || DISTINCTIVE_ACTION_TOKENS.has(`${stemmed}s`);
}

export function isWeakPhrase(phrase: string): boolean {
  const normalized = phrase.toLowerCase().replace(/\s+/g, ' ').trim();
  if (WEAK_PHRASES.has(normalized)) return true;
  const parts = normalized.split(' ').filter(Boolean);
  return parts.length >= 2 && parts.every((part) => isWeakEntityToken(part) || isBoilerplateToken(part));
}

function tokenMatchesSet(token: string, set: Set<string>): boolean {
  const raw = token.toLowerCase();
  const stemmed = stemThemeToken(raw);
  if (set.has(raw) || set.has(stemmed)) return true;
  for (const candidate of set) {
    if (stemThemeToken(candidate) === stemmed) return true;
  }
  return false;
}

function isSupportingToken(token: string): boolean {
  return tokenMatchesSet(token, SUPPORTING_TOKENS);
}

export function isInstitutionalTypeModifier(token: string): boolean {
  return tokenMatchesSet(token, INSTITUTIONAL_TYPE_MODIFIERS);
}

export function isInstitutionalDocumentNoun(token: string): boolean {
  return tokenMatchesSet(token, INSTITUTIONAL_DOCUMENT_NOUNS);
}

function isGenericInstitutionalPart(token: string): boolean {
  if (!token) return false;
  if (isDistinctiveActionToken(token)) return false;
  if (isWeakEntityToken(token)) return true;
  if (isBoilerplateToken(token)) return true;
  if (isInstitutionalTypeModifier(token)) return true;
  if (isInstitutionalDocumentNoun(token)) return true;
  if (isSupportingToken(token)) return true;
  return false;
}

/**
 * A shared document/action TYPE is not a shared specific event.
 * "executive order" or "court ruling" can support a match only with another
 * independent specific anchor (named order, policy/object, case, cluster key).
 */
export function isGenericInstitutionalEventType(phrase: string): boolean {
  const parts = phrase
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (parts.length < 2) return false;
  if (parts.some((part) => isDistinctiveActionToken(part))) return false;
  if (!parts.some((part) => isInstitutionalDocumentNoun(part))) return false;
  return parts.every((part) => isGenericInstitutionalPart(part));
}

/**
 * Classify a single extracted token.
 * Action/policy hints stay strong even if they also look like process words.
 */
export function featureStrength(token: string): SemanticFeatureStrength {
  const raw = token.toLowerCase().trim();
  if (!raw) return 'weak';
  const stemmed = stemThemeToken(raw);
  if (FUNCTION_WORDS.has(raw) || FUNCTION_WORDS.has(stemmed)) return 'weak';
  if (isBoilerplateToken(raw)) return 'weak';
  if (isWeakEntityToken(raw)) return 'weak';
  if (isCalendarYearToken(raw) || isCalendarYearToken(stemmed)) return 'supporting';
  if (isDistinctiveActionToken(raw)) return 'strong';
  if (isSupportingToken(raw)) return 'supporting';
  return 'strong';
}

export function phraseStrength(phrase: string): SemanticFeatureStrength {
  const normalized = phrase.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return 'weak';
  if (isWeakPhrase(normalized)) return 'weak';
  if (isGenericInstitutionalEventType(normalized)) return 'supporting';
  const parts = normalized.split(' ').filter(Boolean);
  const strengths = parts.map((part) => featureStrength(part));
  if (strengths.every((strength) => strength === 'weak')) return 'weak';
  if (strengths.some((strength) => strength === 'strong')) return 'strong';
  return 'supporting';
}

export function isLowInformationFeature(tokenOrPhrase: string): boolean {
  return tokenOrPhrase.includes(' ')
    ? phraseStrength(tokenOrPhrase) === 'weak'
    : featureStrength(tokenOrPhrase) === 'weak';
}
