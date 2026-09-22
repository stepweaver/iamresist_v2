import { createHash } from 'node:crypto';

import {
  ANALYSIS_ENTRY_KINDS,
  EVENT_THREADS_TITLE_MAX_CHARS,
  GENERIC_IDENTITY_ADJECTIVES,
  GENERIC_IDENTITY_VERBS,
  GENERIC_NUMBER_WORDS,
  GENERIC_THREAD_ENTITIES,
  GENERIC_THREAD_STOPWORDS,
  WEAK_EVENT_NOUNS,
} from '@/lib/eventThreads/constants';
import { normalizeMatchText } from '@/lib/eventThreads/grounding';
import type {
  EventThreadIdentityAnchors,
  ProposedEventThread,
  ResolvedThreadEntry,
} from '@/lib/eventThreads/types';

const GENERIC_SET = new Set(GENERIC_THREAD_ENTITIES.map((value) => normalizeMatchText(value)));
const STOP_SET = new Set(GENERIC_THREAD_STOPWORDS.map((value) => normalizeMatchText(value)));
const VERB_SET = new Set(GENERIC_IDENTITY_VERBS.map((value) => normalizeMatchText(value)));
const ADJ_SET = new Set(GENERIC_IDENTITY_ADJECTIVES.map((value) => normalizeMatchText(value)));
const NUMBER_WORD_SET = new Set(GENERIC_NUMBER_WORDS.map((value) => normalizeMatchText(value)));
const WEAK_NOUN_SET = new Set(WEAK_EVENT_NOUNS.map((value) => normalizeMatchText(value)));

const EMPTY_ANCHORS: EventThreadIdentityAnchors = {
  actors: [],
  actions: [],
  objects: [],
  institutions: [],
  locations: [],
  documents: [],
};

export type ThreadIdentity = {
  terms: string[];
  phrases: string[];
  generic: string[];
  actors: string[];
  actions: string[];
  objects: string[];
  institutions: string[];
  locations: string[];
  documents: string[];
};

function uniqueNormalized(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeMatchText(String(value || ''));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function isGenericNumberToken(token: string): boolean {
  const normalized = normalizeMatchText(token);
  if (!normalized) return true;
  if (NUMBER_WORD_SET.has(normalized)) return true;
  return /^\d+$/.test(normalized);
}

export function isWeakIdentityToken(token: string): boolean {
  const normalized = normalizeMatchText(token);
  if (!normalized || normalized.length < 3) return true;
  if (STOP_SET.has(normalized)) return true;
  if (VERB_SET.has(normalized)) return true;
  if (ADJ_SET.has(normalized)) return true;
  if (WEAK_NOUN_SET.has(normalized)) return true;
  if (isGenericNumberToken(normalized)) return true;
  return false;
}

export function isGenericEntity(value: string): boolean {
  const normalized = normalizeMatchText(value);
  if (!normalized) return false;
  if (GENERIC_SET.has(normalized)) return true;
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => GENERIC_SET.has(token) || STOP_SET.has(token) || isWeakIdentityToken(token));
}

export function tokenizeIdentity(text: string, exclude: Iterable<string> = []): string[] {
  const excluded = new Set([...exclude].map((value) => normalizeMatchText(value)).filter(Boolean));
  return normalizeMatchText(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => {
      if (token.length < 3) return false;
      if (excluded.has(token)) return false;
      if (STOP_SET.has(token)) return false;
      return true;
    });
}

export function ngrams(tokens: string[], size: number): string[] {
  if (tokens.length < size) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    out.push(tokens.slice(i, i + size).join(' '));
  }
  return out;
}

function creatorExcludeTokens(creatorName: string | null | undefined): string[] {
  return tokenizeIdentity(String(creatorName || ''));
}

export function isDistinctiveIdentityToken(token: string, exclude: Iterable<string> = []): boolean {
  const normalized = normalizeMatchText(token);
  if (!normalized) return false;
  if ([...exclude].some((value) => normalizeMatchText(value) === normalized)) return false;
  if (isGenericEntity(normalized)) return false;
  if (isWeakIdentityToken(normalized)) return false;
  return normalized.length >= 4;
}

export function isDistinctiveEventPhrase(phrase: string, exclude: Iterable<string> = []): boolean {
  const parts = normalizeMatchText(phrase).split(' ').filter(Boolean);
  if (parts.length < 2) return false;
  if (isGenericEntity(phrase)) return false;
  const strong = parts.filter((part) => isDistinctiveIdentityToken(part, exclude));
  if (strong.length >= 1 && parts.length >= 3) return true;
  if (strong.length >= 1 && parts.some((part) => !isGenericEntity(part) && !STOP_SET.has(part))) return true;
  return strong.length >= 2;
}

function collapseDuplicateNgrams(phrases: string[]): string[] {
  const unique = uniqueNormalized(phrases);
  const byLength = [...unique].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const kept: string[] = [];
  for (const phrase of byLength) {
    if (kept.some((existing) => existing === phrase || existing.includes(phrase))) continue;
    kept.push(phrase);
  }
  return kept;
}

export function distinctiveTermsFromText(
  text: string,
  exclude: Iterable<string> = [],
): { terms: string[]; phrases: string[]; generic: string[] } {
  const tokens = tokenizeIdentity(text, exclude);
  const generic = uniqueNormalized(tokens.filter((token) => isGenericEntity(token)));
  const terms = uniqueNormalized(tokens.filter((token) => isDistinctiveIdentityToken(token, exclude)));
  const rawPhrases = [...ngrams(tokens, 2), ...ngrams(tokens, 3)].filter((phrase) =>
    isDistinctiveEventPhrase(phrase, exclude),
  );
  return { terms, phrases: uniqueNormalized(rawPhrases), generic };
}

function anchorsFromFeatures(
  features: EventThreadIdentityAnchors | null | undefined,
): EventThreadIdentityAnchors {
  return {
    actors: uniqueNormalized(features?.actors || []).filter((value) => !isWeakIdentityToken(value) || value.split(' ').length >= 2),
    actions: uniqueNormalized(features?.actions || []),
    objects: uniqueNormalized(features?.objects || []).filter((value) => !isGenericEntity(value) && (!isWeakIdentityToken(value) || value.split(' ').length >= 2)),
    institutions: uniqueNormalized(features?.institutions || []).filter((value) => !isGenericEntity(value)),
    locations: uniqueNormalized(features?.locations || []),
    documents: uniqueNormalized(features?.documents || []).filter((value) => !isGenericEntity(value)),
  };
}

export function identityFromEntry(entry: ResolvedThreadEntry): ThreadIdentity {
  const exclude = creatorExcludeTokens(entry.creatorName);
  const fromText = distinctiveTermsFromText(entry.resolvedText, exclude);
  const anchors = anchorsFromFeatures(entry.identityAnchors ?? EMPTY_ANCHORS);
  const objectPhrases = anchors.objects.filter((value) => value.split(' ').length >= 2 || isDistinctiveIdentityToken(value, exclude));
  const documentPhrases = anchors.documents.filter((value) => value.split(' ').length >= 1);
  const institutionPhrases = anchors.institutions;
  const locationObject = anchors.locations
    .filter((location) => !isGenericEntity(location))
    .flatMap((location) => anchors.objects.map((object) => `${location} ${object}`));
  const actorAction = anchors.actors
    .filter((actor) => !isGenericEntity(actor))
    .flatMap((actor) => anchors.actions.map((action) => `${actor} ${action}`));
  const institutionAction = anchors.institutions.flatMap((institution) =>
    anchors.actions.map((action) => `${institution} ${action}`),
  );

  const phrases = uniqueNormalized([
    ...fromText.phrases,
    ...entry.identityPhrases,
    ...objectPhrases,
    ...documentPhrases,
    ...institutionPhrases,
    ...locationObject.filter((phrase) => isDistinctiveEventPhrase(phrase, exclude) || phrase.split(' ').length >= 2),
    ...actorAction.filter((phrase) => isDistinctiveEventPhrase(phrase, exclude)),
    ...institutionAction,
  ]);
  const terms = uniqueNormalized([
    ...fromText.terms,
    ...entry.identityTerms,
    ...anchors.institutions,
    ...anchors.documents.flatMap((value) => value.split(' ')),
    ...anchors.objects.flatMap((value) => value.split(' ')),
    ...anchors.actors,
    ...anchors.locations,
  ]).filter((term) => isDistinctiveIdentityToken(term, exclude));

  return {
    terms,
    phrases,
    generic: uniqueNormalized([
      ...fromText.generic,
      ...anchors.actors.filter((actor) => isGenericEntity(actor)),
      ...anchors.locations.filter((location) => isGenericEntity(location)),
    ]),
    actors: anchors.actors,
    actions: anchors.actions,
    objects: anchors.objects,
    institutions: anchors.institutions,
    locations: anchors.locations,
    documents: anchors.documents,
  };
}

function overlap(a: string[], b: string[]): string[] {
  const bSet = new Set(b.map((value) => normalizeMatchText(value)));
  return a.filter((value) => bSet.has(normalizeMatchText(value)));
}

function phrasesOverlap(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const left of a) {
    if (!isDistinctiveEventPhrase(left) && left.split(' ').length < 2) continue;
    for (const right of b) {
      if (!isDistinctiveEventPhrase(right) && right.split(' ').length < 2) continue;
      if (left === right || left.includes(right) || right.includes(left)) {
        const key = left.length >= right.length ? left : right;
        if (seen.has(key)) continue;
        if (!isDistinctiveEventPhrase(key) && !isDistinctiveEventPhrase(left) && !isDistinctiveEventPhrase(right)) continue;
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

export function sharedDistinctiveEvidence(
  a: { terms: string[]; phrases: string[] },
  b: { terms: string[]; phrases: string[] },
): { terms: string[]; phrases: string[] } {
  const terms = overlap(a.terms, b.terms).filter((term) => isDistinctiveIdentityToken(term));
  const phrases = phrasesOverlap(a.phrases, b.phrases);
  return { terms, phrases };
}

function eventOverlapScore(a: ThreadIdentity, b: ThreadIdentity): number {
  const shared = sharedDistinctiveEvidence(a, b);
  const objects = overlap(a.objects, b.objects).filter((value) => !isGenericEntity(value));
  const institutions = overlap(a.institutions, b.institutions).filter((value) => !isGenericEntity(value));
  const documents = overlap(a.documents, b.documents).filter((value) => !isGenericEntity(value));
  const locations = overlap(a.locations, b.locations);
  const distinctiveActors = overlap(a.actors, b.actors).filter((actor) => !isGenericEntity(actor));
  const actions = overlap(a.actions, b.actions);
  const distinctiveLocations = locations.filter((location) => !isGenericEntity(location));

  let score = 0;
  if (documents.length) score += 8;
  if (institutions.length && actions.length) score += 7;
  if (institutions.length) score += 5;
  if (objects.length && (actions.length || distinctiveActors.length || distinctiveLocations.length)) score += 6;
  if (objects.length) score += 4;
  if (distinctiveLocations.length && objects.length) score += 6;
  if (distinctiveActors.length && actions.length) score += 5;
  score += shared.phrases.length * 4;
  score += shared.terms.length * 2;
  return score;
}

const MERGE_SCORE = 4;
const ATTACH_SCORE = 4;

export function shouldMergeThreadIdentities(
  a: ThreadIdentity | { terms: string[]; phrases: string[]; generic: string[] },
  b: ThreadIdentity | { terms: string[]; phrases: string[]; generic: string[] },
): boolean {
  const left: ThreadIdentity = {
    actors: [],
    actions: [],
    objects: [],
    institutions: [],
    locations: [],
    documents: [],
    ...a,
  };
  const right: ThreadIdentity = {
    actors: [],
    actions: [],
    objects: [],
    institutions: [],
    locations: [],
    documents: [],
    ...b,
  };

  const shared = sharedDistinctiveEvidence(left, right);
  const genericOnly =
    left.generic.length > 0 &&
    right.generic.length > 0 &&
    shared.terms.length === 0 &&
    shared.phrases.length === 0;
  if (genericOnly) return false;

  const objects = overlap(left.objects, right.objects).filter((value) => !isGenericEntity(value));
  const institutions = overlap(left.institutions, right.institutions).filter((value) => !isGenericEntity(value));
  const documents = overlap(left.documents, right.documents).filter((value) => !isGenericEntity(value));
  const distinctiveActors = overlap(left.actors, right.actors).filter((actor) => !isGenericEntity(actor));
  const actions = overlap(left.actions, right.actions);
  const distinctiveLocations = overlap(left.locations, right.locations).filter((location) => !isGenericEntity(location));

  if (documents.length >= 1) return true;
  if (institutions.length >= 1 && actions.length >= 1) return true;
  if (distinctiveLocations.length >= 1 && objects.length >= 1) return true;
  if (distinctiveActors.length >= 1 && actions.length >= 1 && objects.length >= 1) return true;
  if (objects.length >= 1 && (actions.length >= 1 || distinctiveActors.length >= 1)) return true;
  if (shared.phrases.length >= 1) return true;
  if (shared.terms.length >= 2) return true;
  return eventOverlapScore(left, right) >= MERGE_SCORE;
}

export function hasStrongEventIdentity(identity: ThreadIdentity): boolean {
  if (identity.documents.length >= 1) return true;
  if (identity.institutions.length >= 1) return true;
  if (identity.objects.some((value) => !isGenericEntity(value) && (value.split(' ').length >= 2 || isDistinctiveIdentityToken(value)))) {
    return true;
  }
  if (identity.phrases.some((phrase) => isDistinctiveEventPhrase(phrase))) return true;
  const distinctiveLocations = identity.locations.filter((location) => !isGenericEntity(location));
  if (distinctiveLocations.length >= 1 && identity.objects.length >= 1) return true;
  if (identity.terms.length >= 2) return true;
  return false;
}

function canSeedThread(entry: ResolvedThreadEntry, identity: ThreadIdentity): boolean {
  if ((ANALYSIS_ENTRY_KINDS as readonly string[]).includes(entry.entryKind)) return false;
  if (entry.entryKind === 'evidence_reference' && (identity.documents.length || identity.phrases.length || identity.terms.length >= 2)) {
    return true;
  }
  return hasStrongEventIdentity(identity);
}

const WEAK_TITLE_TOKENS = new Set([
  'new',
  'announced',
  'says',
  'said',
  'cites',
  'notes',
  'after',
  'week',
  'last',
  'this',
  'that',
  'least',
  'five',
  'separate',
  'events',
  'occurred',
]);

function phraseTitleScore(phrase: string): number {
  const parts = phrase.split(' ').filter(Boolean);
  const strongCount = parts.filter((part) => isDistinctiveIdentityToken(part)).length;
  const genericCount = parts.filter((part) => isGenericEntity(part)).length;
  const verbAdjCount = parts.filter((part) => VERB_SET.has(part) || ADJ_SET.has(part) || WEAK_TITLE_TOKENS.has(part)).length;
  return strongCount * 25 + parts.length * 6 + parts.join('').length - genericCount * 20 - verbAdjCount * 30;
}

export function threadTitleFromIdentity(identity: ThreadIdentity, fallback: string): string {
  const rankedPhrases = collapseDuplicateNgrams(identity.phrases.filter((value) => isDistinctiveEventPhrase(value))).sort(
    (a, b) => phraseTitleScore(b) - phraseTitleScore(a),
  );
  const objectFallback = identity.objects.filter((value) => !isGenericEntity(value) && value.split(' ').length >= 2)[0];
  const institutionFallback = identity.institutions[0];
  const raw =
    rankedPhrases[0] ||
    objectFallback ||
    institutionFallback ||
    identity.terms.slice(0, 6).join(' ') ||
    fallback;
  const titled = raw
    .split(' ')
    .filter(Boolean)
    .filter((part) => !isGenericNumberToken(part) && !STOP_SET.has(part) && !VERB_SET.has(part) && !ADJ_SET.has(part) && !WEAK_TITLE_TOKENS.has(part))
    .map((part) => (part.length <= 2 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(' ');
  if (!titled || isGenericEntity(titled) || GENERIC_SET.has(normalizeMatchText(titled))) {
    const extra = identity.terms.slice(0, 4).join(' ');
    const combined = extra ? `${titled} ${extra}`.trim() : `${titled} developments`.trim();
    return combined.slice(0, EVENT_THREADS_TITLE_MAX_CHARS).trim();
  }
  return titled.slice(0, EVENT_THREADS_TITLE_MAX_CHARS).trim();
}

export function identityKeyFor(identity: ThreadIdentity): string {
  const eventPhrases = identity.phrases.filter((phrase) => {
    if (!isDistinctiveEventPhrase(phrase)) return false;
    const parts = phrase.split(' ');
    return !parts.some((part) => VERB_SET.has(part) || ADJ_SET.has(part) || WEAK_TITLE_TOKENS.has(part));
  });
  const maximal = collapseDuplicateNgrams(eventPhrases);
  const objectKeys = identity.objects.filter((value) => !isGenericEntity(value));
  const institutionKeys = identity.institutions.filter((value) => !isGenericEntity(value));
  const documentKeys = identity.documents.filter((value) => !isGenericEntity(value));
  const termKeys = identity.terms.filter((term) => !maximal.some((phrase) => phrase.includes(term)));
  const parts = uniqueNormalized([...maximal.slice(0, 3), ...objectKeys.slice(0, 2), ...institutionKeys.slice(0, 2), ...documentKeys.slice(0, 2), ...termKeys.slice(0, 4)]);
  return parts.join('|').slice(0, 240) || 'unspecified-event';
}

export function slugForThread(title: string, identityKey: string): string {
  const base = normalizeMatchText(title).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const hash = createHash('sha256').update(identityKey).digest('hex').slice(0, 8);
  const trimmed = (base || 'event-thread').slice(0, 72).replace(/-+$/g, '');
  return `${trimmed}-${hash}`;
}

function seedIdentity(identity: ThreadIdentity): ThreadIdentity {
  return {
    terms: [...identity.terms],
    phrases: [...identity.phrases],
    generic: [...identity.generic],
    actors: [...identity.actors],
    actions: [...identity.actions],
    objects: [...identity.objects],
    institutions: [...identity.institutions],
    locations: [...identity.locations],
    documents: [...identity.documents],
  };
}

function enrichSeedIdentity(seed: ThreadIdentity, incoming: ThreadIdentity): ThreadIdentity {
  return {
    ...seed,
    terms: uniqueNormalized([...seed.terms, ...incoming.terms]),
    phrases: collapseDuplicateNgrams([...seed.phrases, ...incoming.phrases]),
    generic: uniqueNormalized([...seed.generic, ...incoming.generic]),
    objects: uniqueNormalized([...seed.objects, ...incoming.objects.filter((value) => !isGenericEntity(value))]),
    institutions: uniqueNormalized([...seed.institutions, ...incoming.institutions.filter((value) => !isGenericEntity(value))]),
    documents: uniqueNormalized([...seed.documents, ...incoming.documents.filter((value) => !isGenericEntity(value))]),
    actors: uniqueNormalized([...seed.actors, ...incoming.actors]),
    actions: uniqueNormalized([...seed.actions, ...incoming.actions]),
    locations: uniqueNormalized([...seed.locations, ...incoming.locations]),
  };
}

export function clusterEntriesIntoThreads(
  entries: ResolvedThreadEntry[],
  idFactory: () => string = () => crypto.randomUUID(),
): ProposedEventThread[] {
  const clusters: Array<{
    identity: ThreadIdentity;
    memberIdentities: ThreadIdentity[];
    entries: ResolvedThreadEntry[];
  }> = [];

  const findBest = (identity: ThreadIdentity, minScore: number) => {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i += 1) {
      const cluster = clusters[i];
      if (!cluster) continue;
      let score = 0;
      let pairwise = false;
      for (const member of cluster.memberIdentities) {
        score = Math.max(score, eventOverlapScore(member, identity));
        if (shouldMergeThreadIdentities(member, identity)) pairwise = true;
      }
      if (pairwise && score >= minScore && score > bestScore) {
        bestIndex = i;
        bestScore = score;
      }
    }
    return bestIndex;
  };

  for (const entry of entries) {
    const identity = identityFromEntry(entry);
    if (!canSeedThread(entry, identity)) continue;
    const existing = findBest(identity, MERGE_SCORE);
    if (existing < 0) {
      clusters.push({ identity: seedIdentity(identity), memberIdentities: [identity], entries: [entry] });
      continue;
    }
    const cluster = clusters[existing];
    if (!cluster) continue;
    cluster.entries.push(entry);
    cluster.memberIdentities.push(identity);
    cluster.identity = enrichSeedIdentity(cluster.identity, identity);
  }

  for (const entry of entries) {
    if (clusters.some((cluster) => cluster.entries.includes(entry))) continue;
    const identity = identityFromEntry(entry);
    const existing = findBest(identity, ATTACH_SCORE);
    if (existing < 0) continue;
    const cluster = clusters[existing];
    if (!cluster) continue;
    if (!cluster.memberIdentities.some((member) => shouldMergeThreadIdentities(member, identity))) continue;
    cluster.entries.push(entry);
    cluster.memberIdentities.push(identity);
  }

  return clusters.map((cluster) => {
    const title = threadTitleFromIdentity(cluster.identity, cluster.entries[0]?.resolvedText || 'Event thread');
    const identityKey = identityKeyFor(cluster.identity);
    return {
      id: idFactory(),
      slug: slugForThread(title, identityKey),
      title,
      summary: null,
      status: 'proposed',
      startedAt: null,
      lastActivityAt: null,
      identityKey,
      identityFeatures: {
        distinctiveTerms: cluster.identity.terms,
        distinctivePhrases: cluster.identity.phrases,
        genericEntities: cluster.identity.generic,
      },
      creatorConvergenceCount: 0,
      sourceCorroborationCount: 0,
      creatorIds: [],
      entries: cluster.entries,
      intelLinks: [],
    };
  });
}

export { EMPTY_ANCHORS };
