import type { ProvenanceClass } from '@/lib/intel/types';

const ORDER: Record<ProvenanceClass, number> = {
  PRIMARY: 0,
  WIRE: 1,
  SPECIALIST: 2,
  INDIE: 3,
  COMMENTARY: 4,
  SCHEDULE: 5,
};

export function provenanceRank(c: ProvenanceClass): number {
  return ORDER[c] ?? 99;
}

export type LiveRow = {
  id: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
  fetchedAt: string;
  provenanceClass: ProvenanceClass;
  sourceName: string;
  sourceSlug: string;
  stateChangeType: string;
  clusterKeys: Record<string, string>;
};

export function compareLiveRows(a: LiveRow, b: LiveRow): number {
  const pa = provenanceRank(a.provenanceClass);
  const pb = provenanceRank(b.provenanceClass);
  if (pa !== pb) return pa - pb;

  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  if (ta !== tb) return tb - ta;

  return a.sourceSlug.localeCompare(b.sourceSlug);
}

export function sortLiveRows(rows: LiveRow[]): LiveRow[] {
  return [...rows].sort(compareLiveRows);
}
