import type { DeskLane, ProvenanceClass, SurfaceState } from '@/lib/intel/types';

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

export type RelevanceExplanationDTO = {
  ruleId: string;
  message: string;
  meta?: Record<string, unknown>;
};

/** Live desk row after relevance + optional duplicate overlay (Milestone 1.75). */
export type LiveDeskItem = LiveRow & {
  relevanceScore: number;
  surfaceState: SurfaceState;
  suppressionReason: string | null;
  missionTags: string[];
  branchOfGovernment: string;
  institutionalArea: string;
  relevanceExplanations: RelevanceExplanationDTO[];
  isDuplicateLoser: boolean;
  /** From ingest RSS/media or OG backfill in live desk helpers. */
  imageUrl?: string | null;
  /** Desk lane context (injected at runtime by live desk services). */
  deskLane?: DeskLane;
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

/** Default desk ordering: duplicate losers last, surfaced before downranked, then provenance-first tie-breaks. */
export function compareDeskItems(a: LiveDeskItem, b: LiveDeskItem): number {
  if (a.isDuplicateLoser !== b.isDuplicateLoser) {
    return a.isDuplicateLoser ? 1 : -1;
  }

  const sa = a.surfaceState === 'surfaced' ? 0 : 1;
  const sb = b.surfaceState === 'surfaced' ? 0 : 1;
  if (sa !== sb) return sa - sb;

  const pa = provenanceRank(a.provenanceClass);
  const pb = provenanceRank(b.provenanceClass);
  if (pa !== pb) return pa - pb;

  if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;

  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  if (ta !== tb) return tb - ta;

  return a.sourceSlug.localeCompare(b.sourceSlug);
}

/**
 * Deterministic duplicate handling using Milestone-1 cluster_keys only (same key + value → one winner).
 */
export function applyDuplicateClusterOverlay(items: LiveDeskItem[]): LiveDeskItem[] {
  const byKey = new Map<string, LiveDeskItem[]>();
  for (const it of items) {
    const ck = it.clusterKeys;
    if (!ck || typeof ck !== 'object') continue;
    for (const [k, v] of Object.entries(ck)) {
      if (!v || typeof v !== 'string') continue;
      const comp = `${k}:${v}`;
      const arr = byKey.get(comp) ?? [];
      if (!arr.some((x) => x.id === it.id)) arr.push(it);
      byKey.set(comp, arr);
    }
  }

  const loserIds = new Set<string>();
  const extraExplain = new Map<string, RelevanceExplanationDTO>();

  for (const [comp, group] of byKey) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const pda = provenanceRank(a.provenanceClass);
      const pdb = provenanceRank(b.provenanceClass);
      if (pda !== pdb) return pda - pdb;
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });
    const winner = ranked[0]!;
    for (const loser of ranked.slice(1)) {
      loserIds.add(loser.id);
      if (!extraExplain.has(loser.id)) {
        const t = winner.title.length > 72 ? `${winner.title.slice(0, 72)}…` : winner.title;
        extraExplain.set(loser.id, {
          ruleId: 'desk:duplicate_cluster',
          message: `Display order deprioritized: duplicate cluster “${comp}”; stronger line is “${t}” (${winner.sourceSlug}).`,
        });
      }
    }
  }

  return items.map((it) => {
    if (!loserIds.has(it.id)) return { ...it, isDuplicateLoser: false };
    const add = extraExplain.get(it.id);
    const relevanceExplanations = add ? [...it.relevanceExplanations, add] : it.relevanceExplanations;
    return { ...it, isDuplicateLoser: true, relevanceExplanations };
  });
}

export function sortLiveRows(rows: LiveRow[]): LiveRow[] {
  return [...rows].sort(compareLiveRows);
}
