import { computeDisplayPriority, type DisplayPriorityInput } from '@/lib/intel/displayPriority';
import {
  deriveThemeAttentionSignal,
  type ThemeRankingMode,
} from '@/lib/intel/themeAttentionRanking';
import type { ThemeAttentionForItem } from '@/lib/themeMemory/readModel';
import type { ThemeLifecycle } from '@/lib/themeMemory/themeTypes';

export type ThemeRankableCompareItem = DisplayPriorityInput & {
  id: string;
  hasShortWindowCreatorConvergence?: boolean;
};

export type ThemeRankingComparisonRow = {
  itemId: string;
  title: string;
  baselinePosition: number;
  themePosition: number;
  delta: number;
  baselineScore: number;
  themeScore: number;
  matchedThemeId: string | null;
  themeReasons: string[];
  eligible: boolean;
  contribution: number;
  lifecycle: ThemeLifecycle | null;
  shortWindowCreatorOverlap: boolean;
};

export type ThemeRankingComparison = {
  rows: ThemeRankingComparisonRow[];
  summary: {
    itemCount: number;
    matchedCount: number;
    eligibleCount: number;
    movedCount: number;
    unaffectedCount: number;
    largestAbsDelta: number;
    shortWindowOverlapCount: number;
    lifecycleDistribution: Record<string, number>;
  };
};

function attentionFor(
  item: ThemeRankableCompareItem,
  map: Map<string, ThemeAttentionForItem | null> | Record<string, ThemeAttentionForItem | null | undefined>,
): ThemeAttentionForItem | null {
  if (map instanceof Map) {
    return map.get(item.id) ?? null;
  }
  return map[item.id] ?? null;
}

function sortByScore(
  items: Array<{ id: string; score: number }>,
): string[] {
  return [...items]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    })
    .map((row) => row.id);
}

/**
 * Compare baseline vs theme-aware display priority without mutating production ranking.
 * Uses computeDisplayPriority in off vs active modes against the same preloaded context.
 */
export function compareThemeRanking(
  items: ThemeRankableCompareItem[],
  attentionByItemId: Map<string, ThemeAttentionForItem | null> | Record<string, ThemeAttentionForItem | null | undefined>,
  options: { nowMs?: number } = {},
): ThemeRankingComparison {
  const rows: ThemeRankingComparisonRow[] = [];
  const baselineScores: Array<{ id: string; score: number }> = [];
  const themeScores: Array<{ id: string; score: number }> = [];
  const lifecycleDistribution: Record<string, number> = {};
  let matchedCount = 0;
  let eligibleCount = 0;
  let shortWindowOverlapCount = 0;

  for (const item of items) {
    const context = attentionFor(item, attentionByItemId);
    if (context?.matchedThemeId) matchedCount += 1;
    if (context?.lifecycle) {
      lifecycleDistribution[context.lifecycle] = (lifecycleDistribution[context.lifecycle] ?? 0) + 1;
    }

    const baseline = computeDisplayPriority({
      ...item,
      themeAttention: null,
      themeRankingMode: 'off' satisfies ThemeRankingMode,
      nowMs: options.nowMs,
    });
    const themeAware = computeDisplayPriority({
      ...item,
      themeAttention: context,
      themeRankingMode: 'active',
      nowMs: options.nowMs,
    });
    const signal = deriveThemeAttentionSignal(
      context,
      {
        surfaceState: item.surfaceState,
        isDuplicateLoser: item.isDuplicateLoser,
        relevanceScore: item.relevanceScore,
        provenanceClass: item.provenanceClass,
        publishedAt: item.publishedAt,
        contentUseMode: item.contentUseMode,
        missionScopeState: item.missionScopeState,
        baseDisplayPriority: baseline.displayPriority,
        nowMs: options.nowMs,
      },
      'active',
    );
    if (signal.eligible) eligibleCount += 1;
    if (item.hasShortWindowCreatorConvergence && signal.eligible) shortWindowOverlapCount += 1;

    baselineScores.push({ id: item.id, score: baseline.displayPriority });
    themeScores.push({ id: item.id, score: themeAware.displayPriority });
    rows.push({
      itemId: item.id,
      title: item.title,
      baselinePosition: 0,
      themePosition: 0,
      delta: 0,
      baselineScore: baseline.displayPriority,
      themeScore: themeAware.displayPriority,
      matchedThemeId: signal.matchedThemeId,
      themeReasons: signal.reasons,
      eligible: signal.eligible,
      contribution: signal.contribution,
      lifecycle: context?.lifecycle ?? null,
      shortWindowCreatorOverlap: Boolean(item.hasShortWindowCreatorConvergence && signal.eligible),
    });
  }

  const baselineOrder = sortByScore(baselineScores);
  const themeOrder = sortByScore(themeScores);
  const baselinePos = new Map(baselineOrder.map((id, idx) => [id, idx + 1]));
  const themePos = new Map(themeOrder.map((id, idx) => [id, idx + 1]));

  for (const row of rows) {
    row.baselinePosition = baselinePos.get(row.itemId) ?? 0;
    row.themePosition = themePos.get(row.itemId) ?? 0;
    row.delta = row.baselinePosition - row.themePosition;
  }

  const moved = rows.filter((row) => row.delta !== 0);
  const largestAbsDelta = rows.reduce((max, row) => Math.max(max, Math.abs(row.delta)), 0);

  return {
    rows: rows.sort((a, b) => a.baselinePosition - b.baselinePosition || a.itemId.localeCompare(b.itemId)),
    summary: {
      itemCount: items.length,
      matchedCount,
      eligibleCount,
      movedCount: moved.length,
      unaffectedCount: items.length - moved.length,
      largestAbsDelta,
      shortWindowOverlapCount,
      lifecycleDistribution,
    },
  };
}
