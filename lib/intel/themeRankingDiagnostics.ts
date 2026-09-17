import { getLiveIntelDesk } from '@/lib/feeds/liveIntel.service';
import { compareThemeRanking, type ThemeRankableCompareItem, type ThemeRankingComparison } from '@/lib/intel/themeAttentionCompare';
import { prefetchThemeAttentionByItemId } from '@/lib/intel/themeAttentionPrefetch';
import { resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import type { ProvenanceClass } from '@/lib/intel/types';
import type { ThemeAttentionForItem, ThemeAttentionThemeDiagnostic } from '@/lib/themeMemory/readModel';

function toCompareItem(item: Record<string, unknown>): ThemeRankableCompareItem | null {
  if (!item || typeof item.id !== 'string' || typeof item.title !== 'string') return null;
  const creator = item.creatorCorroboration;
  const creatorApplied =
    creator && typeof creator === 'object' && !Array.isArray(creator)
      ? Boolean((creator as { applied?: boolean }).applied)
      : false;
  return {
    id: item.id,
    title: item.title,
    summary: typeof item.summary === 'string' ? item.summary : null,
    provenanceClass: (item.provenanceClass as ProvenanceClass) || 'WIRE',
    sourceSlug: String(item.sourceSlug || 'unknown'),
    stateChangeType: String(item.stateChangeType || 'wire_item'),
    missionTags: Array.isArray(item.missionTags) ? (item.missionTags as string[]) : [],
    branchOfGovernment: String(item.branchOfGovernment || 'unknown'),
    institutionalArea: String(item.institutionalArea || 'unknown'),
    relevanceScore: typeof item.relevanceScore === 'number' ? item.relevanceScore : 50,
    clusterKeys:
      item.clusterKeys && typeof item.clusterKeys === 'object' && !Array.isArray(item.clusterKeys)
        ? (item.clusterKeys as Record<string, string>)
        : {},
    publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
    deskLane: typeof item.deskLane === 'string' ? item.deskLane : 'osint',
    contentUseMode: typeof item.contentUseMode === 'string' ? item.contentUseMode : null,
    sourceFamily: typeof item.sourceFamily === 'string' ? item.sourceFamily : null,
    surfaceState: typeof item.surfaceState === 'string' ? item.surfaceState : 'surfaced',
    isDuplicateLoser: Boolean(item.isDuplicateLoser),
    hasShortWindowCreatorConvergence:
      creatorApplied ||
      (typeof item.creatorCorroborationBoost === 'number' && item.creatorCorroborationBoost > 0),
  };
}

export type ThemeMemoryShadowDiagnostics = {
  themesConsidered: number;
  themesQuarantined: number;
  rankableThemes: number;
  rankableItemsWithThemeAttention: number;
  maxThemeBoost: number;
  averageThemeBoost: number;
  themes: ThemeAttentionThemeDiagnostic[];
};

function countNonNullAttention(
  attentionByItemId: Map<string, ThemeAttentionForItem | null> | Record<string, ThemeAttentionForItem | null | undefined>,
): number {
  const values =
    attentionByItemId instanceof Map ? [...attentionByItemId.values()] : Object.values(attentionByItemId);
  return values.filter((row) => Boolean(row?.matchedThemeId)).length;
}

/**
 * Inspectable Theme Memory shadow-ranking aggregates. Does not change ranking mode.
 */
export function summarizeThemeMemoryShadowDiagnostics(input: {
  themes: ThemeAttentionThemeDiagnostic[];
  comparison: Pick<ThemeRankingComparison, 'rows'>;
  attentionByItemId: Map<string, ThemeAttentionForItem | null> | Record<string, ThemeAttentionForItem | null | undefined>;
}): ThemeMemoryShadowDiagnostics {
  const themes = [...input.themes].sort((a, b) => a.themeId.localeCompare(b.themeId));
  const themesQuarantined = themes.filter((row) => row.quarantined).length;
  const contributions = input.comparison.rows.map((row) => row.contribution);
  const maxThemeBoost = contributions.reduce((max, value) => Math.max(max, value), 0);
  const averageThemeBoost =
    contributions.length === 0
      ? 0
      : Math.round((contributions.reduce((sum, value) => sum + value, 0) / contributions.length) * 100) / 100;
  return {
    themesConsidered: themes.length,
    themesQuarantined,
    rankableThemes: themes.length - themesQuarantined,
    rankableItemsWithThemeAttention: countNonNullAttention(input.attentionByItemId),
    maxThemeBoost,
    averageThemeBoost,
    themes,
  };
}

/**
 * Protected calibration snapshot: baseline vs theme-aware display priority.
 * Always computes the comparison even when THEME_RANKING_MODE=off.
 * Does not activate ranking.
 */
export async function buildThemeRankingDiagnostics(opts: { lane?: string; limit?: number } = {}) {
  const lane = opts.lane || 'osint';
  const limit = Math.max(1, Math.min(80, Number(opts.limit) || 40));
  const mode = resolveThemeRankingMode();
  const desk = await getLiveIntelDesk(lane);
  const pool = Array.isArray(desk.preCapCandidates) && desk.preCapCandidates.length
    ? desk.preCapCandidates
    : Array.isArray(desk.items)
      ? desk.items
      : [];
  const items = pool.slice(0, limit);
  const compareItems = items.map((item) => toCompareItem(item)).filter(Boolean) as ThemeRankableCompareItem[];

  const prefetch = await prefetchThemeAttentionByItemId(
    compareItems.map((item, index) => ({
      id: item.id,
      sourceSystem: 'intel',
      sourceSlug: item.sourceSlug,
      canonicalUrl: items[index]?.canonicalUrl || '',
    })),
    { mode: 'active' },
  );

  const comparison = compareThemeRanking(compareItems, prefetch.byId);
  const themeMemory = summarizeThemeMemoryShadowDiagnostics({
    themes: prefetch.themes,
    comparison,
    attentionByItemId: prefetch.byId,
  });

  return {
    generatedAt: new Date().toISOString(),
    currentMode: mode,
    deskLane: lane,
    configured: desk.configured ?? null,
    attentionIsNotCorroboration: true as const,
    note: 'Theme Memory does not replace ranking. This snapshot compares baseline vs bounded theme-aware display priority. Unresolved legacy REVIEW themes are quarantined from ranking attention.',
    summary: {
      ...comparison.summary,
      themesConsidered: themeMemory.themesConsidered,
      themesQuarantined: themeMemory.themesQuarantined,
      rankableThemes: themeMemory.rankableThemes,
      rankableItemsWithThemeAttention: themeMemory.rankableItemsWithThemeAttention,
      maxThemeBoost: themeMemory.maxThemeBoost,
      averageThemeBoost: themeMemory.averageThemeBoost,
    },
    themeMemory,
    rows: comparison.rows,
  };
}
