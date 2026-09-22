import { createHash } from 'node:crypto';

import {
  EVENT_THREADS_TITLE_MAX_CHARS,
  GENERIC_THREAD_ENTITIES,
  GENERIC_THREAD_STOPWORDS,
} from '@/lib/eventThreads/constants';
import { normalizeMatchText } from '@/lib/eventThreads/grounding';
import type { ProposedEventThread, ResolvedThreadEntry } from '@/lib/eventThreads/types';

const GENERIC_SET = new Set(GENERIC_THREAD_ENTITIES.map((value) => normalizeMatchText(value)));
const STOP_SET = new Set(GENERIC_THREAD_STOPWORDS.map((value) => normalizeMatchText(value)));

export function tokenizeIdentity(text: string): string[] {
  return normalizeMatchText(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_SET.has(token));
}

export function ngrams(tokens: string[], size: number): string[] {
  if (tokens.length < size) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    out.push(tokens.slice(i, i + size).join(' '));
  }
  return out;
}

export function isGenericEntity(value: string): boolean {
  const normalized = normalizeMatchText(value);
  if (!normalized) return false;
  if (GENERIC_SET.has(normalized)) return true;
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => GENERIC_SET.has(token) || STOP_SET.has(token));
}

export function distinctiveTermsFromText(text: string): { terms: string[]; phrases: string[]; generic: string[] } {
  const tokens = tokenizeIdentity(text);
  const generic = [...new Set(tokens.filter((token) => isGenericEntity(token)))];
  const terms = [...new Set(tokens.filter((token) => !isGenericEntity(token) && token.length >= 4))];
  const phrases = [...new Set([...ngrams(tokens, 2), ...ngrams(tokens, 3)])].filter((phrase) => {
    const parts = phrase.split(' ');
    return parts.some((part) => !isGenericEntity(part) && !STOP_SET.has(part));
  });
  return { terms, phrases, generic };
}

export function identityFromEntry(entry: ResolvedThreadEntry): {
  terms: string[];
  phrases: string[];
  generic: string[];
} {
  const fromText = distinctiveTermsFromText(entry.resolvedText);
  return {
    terms: [...new Set([...fromText.terms, ...entry.identityTerms])],
    phrases: [...new Set([...fromText.phrases, ...entry.identityPhrases])],
    generic: fromText.generic,
  };
}

export function sharedDistinctiveEvidence(
  a: { terms: string[]; phrases: string[] },
  b: { terms: string[]; phrases: string[] },
): { terms: string[]; phrases: string[] } {
  const terms = a.terms.filter((term) => b.terms.includes(term) && !isGenericEntity(term));
  const phrases = a.phrases.filter((phrase) => b.phrases.includes(phrase));
  return { terms, phrases };
}

export function shouldMergeThreadIdentities(
  a: { terms: string[]; phrases: string[]; generic: string[] },
  b: { terms: string[]; phrases: string[]; generic: string[] },
): boolean {
  const shared = sharedDistinctiveEvidence(a, b);
  if (shared.phrases.length >= 1) return true;
  if (shared.terms.length >= 2) return true;
  const genericOnly = a.generic.length > 0 && b.generic.length > 0 && shared.terms.length === 0 && shared.phrases.length === 0;
  if (genericOnly) return false;
  return false;
}

const WEAK_TITLE_TOKENS = new Set(['new', 'announced', 'says', 'said', 'cites', 'notes', 'after', 'week', 'last', 'this', 'that']);

function phraseTitleScore(phrase: string): number {
  const parts = phrase.split(' ').filter(Boolean);
  const genericCount = parts.filter((part) => isGenericEntity(part)).length;
  const weakCount = parts.filter((part) => WEAK_TITLE_TOKENS.has(part)).length;
  return parts.length * 10 + parts.join('').length - genericCount * 20 - weakCount * 15;
}

export function threadTitleFromIdentity(identity: { phrases: string[]; terms: string[] }, fallback: string): string {
  const rankedPhrases = identity.phrases
    .filter((value) => value.split(' ').length >= 2 && !isGenericEntity(value))
    .sort((a, b) => phraseTitleScore(b) - phraseTitleScore(a));
  const phrase = rankedPhrases[0];
  const raw = phrase || identity.terms.filter((term) => !isGenericEntity(term)).slice(0, 6).join(' ') || fallback;
  const titled = raw
    .split(' ')
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(' ');
  if (isGenericEntity(titled) || GENERIC_SET.has(normalizeMatchText(titled))) {
    const extra = identity.terms.filter((term) => !isGenericEntity(term)).slice(0, 4).join(' ');
    const combined = extra ? `${titled} ${extra}` : `${titled} developments`;
    return combined.slice(0, EVENT_THREADS_TITLE_MAX_CHARS).trim();
  }
  return titled.slice(0, EVENT_THREADS_TITLE_MAX_CHARS).trim();
}

export function identityKeyFor(identity: { phrases: string[]; terms: string[] }): string {
  const parts = [...identity.phrases.slice(0, 4), ...identity.terms.slice(0, 8)];
  return parts.join('|').slice(0, 240) || 'unspecified-event';
}

export function slugForThread(title: string, identityKey: string): string {
  const base = normalizeMatchText(title).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const hash = createHash('sha256').update(identityKey).digest('hex').slice(0, 8);
  const trimmed = (base || 'event-thread').slice(0, 72).replace(/-+$/g, '');
  return `${trimmed}-${hash}`;
}

export function clusterEntriesIntoThreads(
  entries: ResolvedThreadEntry[],
  idFactory: () => string = () => crypto.randomUUID(),
): ProposedEventThread[] {
  const clusters: Array<{
    identity: { terms: string[]; phrases: string[]; generic: string[] };
    entries: ResolvedThreadEntry[];
  }> = [];

  for (const entry of entries) {
    const identity = identityFromEntry(entry);
    const existing = clusters.find((cluster) => shouldMergeThreadIdentities(cluster.identity, identity));
    if (!existing) {
      clusters.push({ identity, entries: [entry] });
      continue;
    }
    existing.entries.push(entry);
    existing.identity = {
      terms: [...new Set([...existing.identity.terms, ...identity.terms])],
      phrases: [...new Set([...existing.identity.phrases, ...identity.phrases])],
      generic: [...new Set([...existing.identity.generic, ...identity.generic])],
    };
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
