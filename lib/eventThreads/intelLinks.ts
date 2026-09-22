import { randomUUID } from 'node:crypto';

import type { DeskLane } from '@/lib/intel/types';
import {
  EVENT_THREADS_INTEL_CANDIDATE_LIMIT,
  EVENT_THREADS_INTEL_LINK_LIMIT,
  EVENT_THREADS_TIME_PROXIMITY_DAYS,
  GENERIC_INTEL_TOKENS,
} from '@/lib/eventThreads/constants';
import {
  hasStrongEventIdentity,
  identityFromEntry,
  isDistinctiveEventPhrase,
  isDistinctiveIdentityToken,
  isGenericEntity,
  isWeakIdentityToken,
  type ThreadIdentity,
} from '@/lib/eventThreads/identity';
import { normalizeMatchText } from '@/lib/eventThreads/grounding';
import type {
  IntelOsintCandidate,
  ProposedEventThread,
  ProposedEventThreadSourceLink,
  SearchIntelOsintFn,
} from '@/lib/eventThreads/types';

const INTEL_OSINT_LANES = new Set(['osint', 'watchdogs', 'defense_ops', 'indicators', 'statements']);
const GENERIC_INTEL_SET = new Set(GENERIC_INTEL_TOKENS.map((value) => normalizeMatchText(value)));

function shiftDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString();
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(Math.round((left - right) / (24 * 60 * 60 * 1000)));
}

function threadIdentity(thread: ProposedEventThread): ThreadIdentity {
  const fromFeatures: ThreadIdentity = {
    terms: thread.identityFeatures.distinctiveTerms,
    phrases: thread.identityFeatures.distinctivePhrases,
    generic: thread.identityFeatures.genericEntities,
    actors: [],
    actions: [],
    objects: [],
    institutions: [],
    locations: [],
    documents: [],
  };
  if (thread.entries[0]) {
    const fromSeed = identityFromEntry(thread.entries[0]);
    return {
      ...fromFeatures,
      actors: fromSeed.actors,
      actions: fromSeed.actions,
      objects: fromSeed.objects,
      institutions: fromSeed.institutions,
      locations: fromSeed.locations,
      documents: fromSeed.documents,
      terms: [...new Set([...fromFeatures.terms, ...fromSeed.terms])],
      phrases: [...new Set([...fromFeatures.phrases, ...fromSeed.phrases])],
    };
  }
  return fromFeatures;
}

export function threadSearchTerms(thread: ProposedEventThread): { terms: string[]; phrases: string[] } {
  const identity = threadIdentity(thread);
  const terms = identity.terms.filter((term) => isDistinctiveIdentityToken(term) && !GENERIC_INTEL_SET.has(term));
  const phrases = identity.phrases.filter((phrase) => isDistinctiveEventPhrase(phrase));
  return { terms, phrases };
}

function namedEntitiesForThread(thread: ProposedEventThread): string[] {
  const identity = threadIdentity(thread);
  const raw = [
    ...identity.actors,
    ...identity.institutions,
    ...identity.locations,
    ...identity.documents,
    ...identity.objects,
    ...identity.terms,
    ...thread.identityFeatures.genericEntities,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const normalized = normalizeMatchText(value);
    if (!normalized || seen.has(normalized)) continue;
    if (GENERIC_INTEL_SET.has(normalized)) continue;
    if (isWeakIdentityToken(normalized) && normalized.split(' ').length < 2) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function matchingEntities(haystack: string, entities: string[]): string[] {
  return entities.filter((entity) => {
    const normalized = normalizeMatchText(entity);
    if (!normalized || GENERIC_INTEL_SET.has(normalized)) return false;
    return haystack.includes(normalized);
  });
}

function publicationProximityDays(thread: ProposedEventThread, candidate: IntelOsintCandidate): number | null {
  const threadTime = thread.lastActivityAt || thread.startedAt;
  return daysBetween(candidate.publishedAt, threadTime);
}

function formatEntitySignal(entity: string, identity: ThreadIdentity): string {
  const locationSet = new Set(identity.locations.map((value) => normalizeMatchText(value)));
  if (locationSet.has(normalizeMatchText(entity)) || /hormuz|fujairah|tehran|gulf/.test(entity)) {
    return `entity/location: ${entity}`;
  }
  return `entity: ${entity}`;
}

export function scoreIntelCandidate(
  thread: ProposedEventThread,
  candidate: IntelOsintCandidate,
): { score: number; signals: string[] } {
  const identity = threadIdentity(thread);
  if (!hasStrongEventIdentity(identity) && !identity.phrases.length && identity.terms.length < 2) {
    return { score: 0, signals: [] };
  }

  const haystack = normalizeMatchText(`${candidate.title}\n${candidate.summary || ''}`);
  const signals: string[] = [];
  let score = 0;

  const entities = namedEntitiesForThread(thread);
  const matchedEntities = matchingEntities(haystack, entities);
  const distinctiveEntities = matchedEntities.filter((entity) => isDistinctiveIdentityToken(entity) && !isGenericEntity(entity));
  const genericNamed = matchedEntities.filter((entity) => isGenericEntity(entity));

  const matchedPhrases = identity.phrases.filter(
    (phrase) => isDistinctiveEventPhrase(phrase) && haystack.includes(normalizeMatchText(phrase)),
  );

  const proximity = publicationProximityDays(thread, candidate);
  const proximate = proximity != null && proximity <= EVENT_THREADS_TIME_PROXIMITY_DAYS;

  const actorHits = identity.actors.filter((actor) => haystack.includes(normalizeMatchText(actor)));
  const actionHits = identity.actions.filter((action) => haystack.includes(normalizeMatchText(action)));
  const institutionHits = identity.institutions.filter((value) => haystack.includes(normalizeMatchText(value)));
  const locationHits = identity.locations.filter((value) => haystack.includes(normalizeMatchText(value)));
  const objectHits = identity.objects.filter((value) => haystack.includes(normalizeMatchText(value)));

  const eventAnchorMatch =
    (actorHits.length >= 1 && actionHits.length >= 1) ||
    (institutionHits.length >= 1 && actionHits.length >= 1) ||
    (locationHits.length >= 1 && objectHits.length >= 1) ||
    (actorHits.length >= 1 && locationHits.length >= 1);

  const twoNamedEntities = matchedEntities.length >= 2 && (distinctiveEntities.length >= 1 || genericNamed.length >= 2);
  const distinctivePlusTime = distinctiveEntities.length >= 1 && proximate;
  const distinctivePhrasePlusTime = matchedPhrases.length >= 1 && proximate;

  if (!twoNamedEntities && !distinctivePlusTime && !distinctivePhrasePlusTime && !eventAnchorMatch && matchedPhrases.length < 1) {
    return { score: 0, signals: [] };
  }

  for (const entity of distinctiveEntities) {
    score += 4;
    signals.push(formatEntitySignal(entity, identity));
  }
  for (const entity of genericNamed.slice(0, 2)) {
    if (twoNamedEntities || eventAnchorMatch) {
      score += 1;
      signals.push(formatEntitySignal(entity, identity));
    }
  }
  for (const phrase of matchedPhrases) {
    score += 5;
    signals.push(`event phrase: ${phrase}`);
  }
  if (eventAnchorMatch) {
    if (actorHits.length && actionHits.length) signals.push(`event anchors: actor + action`);
    if (institutionHits.length && actionHits.length) signals.push(`event anchors: institution + action`);
    if (locationHits.length && objectHits.length) signals.push(`event anchors: location + event object`);
    score += 4;
  }
  if ((distinctivePlusTime || distinctivePhrasePlusTime || twoNamedEntities) && proximity != null) {
    signals.push(`publication proximity: ${proximity} ${proximity === 1 ? 'day' : 'days'}`);
    score += proximate ? 2 : 0;
  }

  const uniqueSignals = [...new Set(signals)].filter((signal) => !GENERIC_INTEL_SET.has(normalizeMatchText(signal.split(':').pop() || '')));
  if (!uniqueSignals.length || score < 4) return { score: 0, signals: [] };
  return { score, signals: uniqueSignals };
}

function linkKindForLane(deskLane: string | null): ProposedEventThreadSourceLink['linkKind'] {
  const lane = String(deskLane || '').trim().toLowerCase();
  if (lane === 'osint' || INTEL_OSINT_LANES.has(lane)) return lane === 'osint' ? 'osint' : 'intel';
  return 'intel';
}

export function selectIntelOsintLinks(
  thread: ProposedEventThread,
  candidates: IntelOsintCandidate[],
  idFactory: () => string = () => randomUUID(),
): ProposedEventThreadSourceLink[] {
  const ranked = candidates
    .map((candidate) => ({ candidate, ...scoreIntelCandidate(thread, candidate) }))
    .filter((row) => row.score >= 4 && row.signals.length > 0)
    .sort((a, b) => b.score - a.score || String(a.candidate.id).localeCompare(String(b.candidate.id)))
    .slice(0, EVENT_THREADS_INTEL_LINK_LIMIT);

  return ranked.map((row) => ({
    id: idFactory(),
    sourceItemId: row.candidate.id,
    sourceUrl: row.candidate.canonicalUrl,
    sourceName: row.candidate.sourceName,
    deskLane: row.candidate.deskLane,
    linkKind: linkKindForLane(row.candidate.deskLane),
    matchSignals: row.signals,
    confidence: row.score >= 10 ? 'high' : row.score >= 6 ? 'medium' : 'low',
    title: row.candidate.title,
    publishedAt: row.candidate.publishedAt,
  }));
}

export async function attachIntelOsintLinks(
  threads: ProposedEventThread[],
  search: SearchIntelOsintFn | null,
  idFactory: () => string = () => randomUUID(),
): Promise<ProposedEventThread[]> {
  if (!search) {
    return threads.map((thread) => ({ ...thread, intelLinks: [], sourceCorroborationCount: 0 }));
  }

  const attached: ProposedEventThread[] = [];
  for (const thread of threads) {
    const { terms, phrases } = threadSearchTerms(thread);
    if (!terms.length && !phrases.length) {
      attached.push({ ...thread, intelLinks: [], sourceCorroborationCount: 0 });
      continue;
    }
    const publishedFrom = shiftDays(thread.startedAt, -EVENT_THREADS_TIME_PROXIMITY_DAYS);
    const publishedTo = shiftDays(thread.lastActivityAt, EVENT_THREADS_TIME_PROXIMITY_DAYS);
    const candidates = await search({
      terms,
      phrases,
      publishedFrom,
      publishedTo,
      limit: EVENT_THREADS_INTEL_CANDIDATE_LIMIT,
    });
    const intelLinks = selectIntelOsintLinks(thread, candidates, idFactory);
    attached.push({
      ...thread,
      intelLinks,
      sourceCorroborationCount: intelLinks.length,
    });
  }
  return attached;
}

export function isIntelOsintLane(deskLane: DeskLane | string | null | undefined): boolean {
  return INTEL_OSINT_LANES.has(String(deskLane || '').trim().toLowerCase());
}
