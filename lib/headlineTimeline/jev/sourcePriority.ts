import type { HeadlineCandidate, HeadlineSourceKind } from '@/lib/headlineTimeline/types';

type SourceIdentity = Pick<HeadlineCandidate, 'sourceId' | 'sourceName' | 'sourceKind'>;

/**
 * Eval-queue priority. Lower sorts first.
 * 0 creator ↔ a different creator
 * 1 creator ↔ news
 * 2 news ↔ a different news source
 * 3 same source
 *
 * Same source is the same sourceId, or the same source name when an outlet
 * arrives through more than one channel. This ordering is evaluation-only.
 */
export type JevSourcePairBucket = 0 | 1 | 2 | 3;

function normalizedSourceName(name: string): string {
  return name.trim().toLowerCase();
}

export function jevPairSourceBucket(a: SourceIdentity, b: SourceIdentity): JevSourcePairBucket {
  if (a.sourceId === b.sourceId) return 3;
  const leftName = normalizedSourceName(a.sourceName);
  const rightName = normalizedSourceName(b.sourceName);
  if (leftName && leftName === rightName) return 3;

  const leftKind: HeadlineSourceKind = a.sourceKind;
  const rightKind: HeadlineSourceKind = b.sourceKind;
  if (leftKind === 'creator' && rightKind === 'creator') return 0;
  if (leftKind !== rightKind) return 1;
  return 2;
}

export function isSameSourcePair(a: SourceIdentity, b: SourceIdentity): boolean {
  return jevPairSourceBucket(a, b) === 3;
}
