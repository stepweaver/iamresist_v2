import { randomUUID } from 'node:crypto';

import type { DeskLane } from '@/lib/intel/types';
import {
  EVENT_THREADS_INTEL_CANDIDATE_LIMIT,
  EVENT_THREADS_INTEL_LINK_LIMIT,
  EVENT_THREADS_TIME_PROXIMITY_DAYS,
} from '@/lib/eventThreads/constants';
import { isGenericEntity } from '@/lib/eventThreads/identity';
import { normalizeMatchText } from '@/lib/eventThreads/grounding';
import type {
  IntelOsintCandidate,
  ProposedEventThread,
  ProposedEventThreadSourceLink,
  SearchIntelOsintFn,
} from '@/lib/eventThreads/types';

const INTEL_OSINT_LANES = new Set(['osint', 'watchdogs', 'defense_ops', 'indicators', 'statements']);

function shiftDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString();
}

export function threadSearchTerms(thread: ProposedEventThread): { terms: string[]; phrases: string[] } {
  const terms = thread.identityFeatures.distinctiveTerms.filter((term) => !isGenericEntity(term));
  const phrases = thread.identityFeatures.distinctivePhrases.filter((phrase) => !isGenericEntity(phrase));
  return { terms, phrases };
}

export function scoreIntelCandidate(
  thread: ProposedEventThread,
  candidate: IntelOsintCandidate,
): { score: number; signals: string[] } {
  const haystack = normalizeMatchText(`${candidate.title}\n${candidate.summary || ''}`);
  const signals: string[] = [];
  let score = 0;

  for (const phrase of thread.identityFeatures.distinctivePhrases) {
    if (phrase.split(' ').length < 2) continue;
    if (haystack.includes(normalizeMatchText(phrase))) {
      score += 3;
      signals.push(`phrase:${phrase}`);
    }
  }
  for (const term of thread.identityFeatures.distinctiveTerms) {
    if (isGenericEntity(term)) continue;
    if (haystack.includes(normalizeMatchText(term))) {
      score += 1;
      signals.push(`term:${term}`);
    }
  }

  const genericHits = thread.identityFeatures.genericEntities.filter((entity) =>
    haystack.includes(normalizeMatchText(entity)),
  );
  if (genericHits.length && score === 0) {
    return { score: 0, signals: [] };
  }
  if (genericHits.length) {
    signals.push(...genericHits.map((entity) => `generic:${entity}`));
  }
  return { score, signals };
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
    .filter((row) => row.score >= 2)
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
    confidence: row.score >= 6 ? 'high' : row.score >= 3 ? 'medium' : 'low',
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
