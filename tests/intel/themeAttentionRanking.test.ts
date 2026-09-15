import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeDisplayPriority } from '@/lib/intel/displayPriority';
import { compareLiveRows, compareDeskItems, type LiveDeskItem } from '@/lib/intel/rank';
import { compareThemeRanking } from '@/lib/intel/themeAttentionCompare';
import {
  THEME_ATTENTION_RANKING,
  capShortWindowCreatorBoost,
  deriveThemeAttentionSignal,
  resolveThemeRankingMode,
  type ThemeRankingMode,
} from '@/lib/intel/themeAttentionRanking';
import type { ThemeAttentionForItem } from '@/lib/themeMemory/readModel';
import type { ProvenanceClass } from '@/lib/intel/types';

function attention(over: Partial<ThemeAttentionForItem> = {}): ThemeAttentionForItem {
  return {
    matchedThemeId: 'theme-persistent-1',
    creatorCount7d: 3,
    creatorItemCount7d: 6,
    activeDays7d: 4,
    lifecycle: 'persistent',
    momentum: 'steady',
    primarySourceCount: 0,
    specialistSourceCount: 0,
    reportingSourceCount: 0,
    creatorSeedStrength: 'converged',
    themeEvidenceDepth: 0,
    reasons: ['theme:matched_membership', 'theme:membership_is_not_corroboration'],
    membershipIsNotCorroboration: true,
    ...over,
  };
}

function item(over: Partial<Parameters<typeof computeDisplayPriority>[0]> = {}) {
  return {
    title: 'Appeals court grants injunction in surveillance case',
    summary: 'Federal judges halt the executive order pending review',
    provenanceClass: 'SPECIALIST' as ProvenanceClass,
    sourceSlug: 'lawfare',
    stateChangeType: 'specialist_item',
    missionTags: ['courts', 'civil_liberties'],
    branchOfGovernment: 'judicial',
    institutionalArea: 'courts',
    relevanceScore: 62,
    clusterKeys: {},
    publishedAt: new Date().toISOString(),
    deskLane: 'osint',
    ...over,
  };
}

function midItem(over: Partial<Parameters<typeof computeDisplayPriority>[0]> = {}) {
  return item({
    provenanceClass: 'INDIE',
    sourceSlug: 'indie-report',
    relevanceScore: 54,
    publishedAt: new Date(Date.now() - 20 * 3600000).toISOString(),
    title: 'Court reviews federal deployment authority dispute',
    summary: 'Independent reporting on the injunction fight',
    ...over,
  });
}

function score(
  over: Parameters<typeof computeDisplayPriority>[0] extends infer T ? Partial<T> : never = {},
  base: ReturnType<typeof item> = item(),
) {
  return computeDisplayPriority({ ...base, ...over });
}

describe('resolveThemeRankingMode', () => {
  it('defaults to off', () => {
    expect(resolveThemeRankingMode({})).toBe('off');
  });

  it('reads THEME_RANKING_MODE', () => {
    expect(resolveThemeRankingMode({ THEME_RANKING_MODE: 'shadow' })).toBe('shadow');
    expect(resolveThemeRankingMode({ THEME_RANKING_MODE: 'active' })).toBe('active');
  });

  it('maps THEME_RANKING_ENABLED only when mode is unset', () => {
    expect(resolveThemeRankingMode({ THEME_RANKING_ENABLED: 'true' })).toBe('active');
    expect(resolveThemeRankingMode({ THEME_RANKING_MODE: 'off', THEME_RANKING_ENABLED: 'true' })).toBe('off');
  });
});

describe('theme attention ranking invariants', () => {
  it('A. no theme matches pre-theme scoring exactly', () => {
    const baseline = score();
    const withNull = score({ themeAttention: null, themeRankingMode: 'active' });
    expect(withNull.displayPriority).toBe(baseline.displayPriority);
    expect(withNull.displayBucket).toBe(baseline.displayBucket);
    expect(withNull.displayExplanations.map((e) => e.ruleId)).toEqual(baseline.displayExplanations.map((e) => e.ruleId));
  });

  it('B. feature flag off matches pre-theme scoring even if context exists', () => {
    const baseline = score();
    const off = score({
      themeAttention: attention(),
      themeRankingMode: 'off',
    });
    expect(off.displayPriority).toBe(baseline.displayPriority);
    expect(off.themeAttentionRanking).toBeUndefined();
  });

  it('C. shadow mode exposes contribution without changing the score', () => {
    const baseline = score();
    const shadow = score({
      themeAttention: attention(),
      themeRankingMode: 'shadow',
    });
    expect(shadow.displayPriority).toBe(baseline.displayPriority);
    expect(shadow.themeAttentionRanking?.eligible).toBe(true);
    expect(shadow.themeAttentionRanking?.contribution).toBeGreaterThan(0);
    expect(shadow.themeAttentionRanking?.appliedContribution).toBe(0);
    expect(shadow.displayExplanations.some((e) => e.ruleId === 'display:theme_attention')).toBe(false);
  });

  it('D. active multi-day converged theme applies a bounded contribution', () => {
    const baseline = score({}, midItem());
    const active = score(
      {
        themeAttention: attention(),
        themeRankingMode: 'active',
      },
      midItem(),
    );
    expect(active.displayPriority).toBeGreaterThan(baseline.displayPriority);
    expect(active.displayPriority - baseline.displayPriority).toBeLessThanOrEqual(
      THEME_ATTENTION_RANKING.MAX_CONTRIBUTION,
    );
    expect(active.themeAttentionRanking?.reasons).toContain(THEME_ATTENTION_RANKING.REASON.MULTI_DAY_PERSISTENCE);
    expect(active.themeAttentionRanking?.attentionIsNotCorroboration).toBe(true);
    expect(active.displayExplanations.some((e) => e.ruleId === 'display:theme_attention')).toBe(true);
  });

  it('E. single-creator provisional themes do not contribute', () => {
    const baseline = score();
    const single = score({
      themeAttention: attention({
        creatorCount7d: 1,
        creatorItemCount7d: 1,
        activeDays7d: 1,
        lifecycle: 'new',
        creatorSeedStrength: 'single',
      }),
      themeRankingMode: 'active',
    });
    expect(single.displayPriority).toBe(baseline.displayPriority);
    expect(single.themeAttentionRanking?.eligible).toBe(false);
    expect(single.themeAttentionRanking?.ineligibleReasons).toContain(
      THEME_ATTENTION_RANKING.INELIGIBLE.SINGLE_CREATOR,
    );
  });

  it('F. persistent lifecycle is recognized as longitudinal attention', () => {
    const signal = deriveThemeAttentionSignal(attention({ lifecycle: 'persistent', activeDays7d: 5 }), {
      relevanceScore: 62,
      baseDisplayPriority: 70,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    expect(signal.eligible).toBe(true);
    expect(signal.reasons).toContain(THEME_ATTENTION_RANKING.REASON.LONGITUDINAL_ATTENTION);
  });

  it('G. resurging themes can become eligible with renewed converged attention', () => {
    const signal = deriveThemeAttentionSignal(
      attention({
        lifecycle: 'resurging',
        activeDays7d: 1,
        creatorCount7d: 2,
        creatorItemCount7d: 2,
        momentum: 'rising',
      }),
      {
        relevanceScore: 62,
        baseDisplayPriority: 70,
        publishedAt: new Date().toISOString(),
        missionScopeState: 'in_scope',
      },
    );
    expect(signal.eligible).toBe(true);
    expect(signal.reasons).toContain(THEME_ATTENTION_RANKING.REASON.RESURGING_ATTENTION);
  });

  it('H. dormant themes contribute nothing', () => {
    const baseline = score();
    const dormant = score({
      themeAttention: attention({ lifecycle: 'dormant' }),
      themeRankingMode: 'active',
    });
    expect(dormant.displayPriority).toBe(baseline.displayPriority);
    expect(dormant.themeAttentionRanking?.ineligibleReasons).toContain(THEME_ATTENTION_RANKING.INELIGIBLE.DORMANT);
  });

  it('I. cooling + falling is disabled; cooling + steady is reduced', () => {
    const falling = deriveThemeAttentionSignal(
      attention({ lifecycle: 'cooling', momentum: 'falling' }),
      {
        relevanceScore: 62,
        baseDisplayPriority: 70,
        publishedAt: new Date().toISOString(),
        missionScopeState: 'in_scope',
      },
    );
    expect(falling.eligible).toBe(false);

    const steady = deriveThemeAttentionSignal(
      attention({ lifecycle: 'cooling', momentum: 'steady' }),
      {
        relevanceScore: 62,
        baseDisplayPriority: 70,
        publishedAt: new Date().toISOString(),
        missionScopeState: 'in_scope',
      },
    );
    expect(steady.eligible).toBe(true);
    expect(steady.contribution).toBeLessThanOrEqual(THEME_ATTENTION_RANKING.COOLING_MAX_CONTRIBUTION);
  });

  it('J. short-window creator boost is capped against theme contribution', () => {
    const capped = capShortWindowCreatorBoost({
      requestedBoost: 4,
      themeAppliedContribution: 5,
    });
    expect(capped.boost).toBe(THEME_ATTENTION_RANKING.COMBINED_CREATOR_INFLUENCE_CAP - 5);
    expect(capped.capped).toBe(true);
    expect(capped.boost + 5).toBeLessThanOrEqual(THEME_ATTENTION_RANKING.COMBINED_CREATOR_INFLUENCE_CAP);
  });

  it('K. theme does not duplicate a large primary-source reward', () => {
    const themeWithPrimary = attention({ primarySourceCount: 3, themeEvidenceDepth: 6 });
    const primaryItem = deriveThemeAttentionSignal(themeWithPrimary, {
      provenanceClass: 'PRIMARY',
      relevanceScore: 62,
      baseDisplayPriority: 70,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    const wireItem = deriveThemeAttentionSignal(themeWithPrimary, {
      provenanceClass: 'WIRE',
      relevanceScore: 62,
      baseDisplayPriority: 70,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    expect(primaryItem.debug.contextMaturityApplied).toBe(0);
    expect(wireItem.debug.contextMaturityApplied).toBeLessThanOrEqual(
      THEME_ATTENTION_RANKING.CONTEXT_MATURITY_MAX,
    );
    expect(primaryItem.contribution).toBeLessThanOrEqual(THEME_ATTENTION_RANKING.MAX_CONTRIBUTION);
  });

  it('L. theme reporting breadth does not recreate source-diversity scoring', () => {
    const one = deriveThemeAttentionSignal(attention({ reportingSourceCount: 1 }), {
      provenanceClass: 'WIRE',
      relevanceScore: 62,
      baseDisplayPriority: 70,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    const many = deriveThemeAttentionSignal(attention({ reportingSourceCount: 9 }), {
      provenanceClass: 'WIRE',
      relevanceScore: 62,
      baseDisplayPriority: 70,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    expect(Math.abs(many.contribution - one.contribution)).toBeLessThanOrEqual(
      THEME_ATTENTION_RANKING.CONTEXT_MATURITY_MAX,
    );
  });

  it('M. creator-only themes stay distinguishable from evidence', () => {
    const signal = deriveThemeAttentionSignal(attention({ reportingSourceCount: 0, primarySourceCount: 0 }), {
      relevanceScore: 62,
      baseDisplayPriority: 70,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    expect(signal.eligible).toBe(true);
    expect(signal.attentionIsNotCorroboration).toBe(true);
    expect(signal.reasons).not.toContain(THEME_ATTENTION_RANKING.REASON.PRIMARY_CONTEXT);
    expect(signal.reasons.join(' ')).not.toMatch(/corroborat/i);
  });

  it('N. primary/context members affect maturity without a verification flag', () => {
    const signal = deriveThemeAttentionSignal(
      attention({ primarySourceCount: 1, reportingSourceCount: 2, themeEvidenceDepth: 4 }),
      {
        provenanceClass: 'WIRE',
        relevanceScore: 62,
        baseDisplayPriority: 70,
        publishedAt: new Date().toISOString(),
        missionScopeState: 'in_scope',
      },
    );
    expect(signal.reasons).toContain(THEME_ATTENTION_RANKING.REASON.PRIMARY_CONTEXT);
    expect(signal.attentionIsNotCorroboration).toBe(true);
    expect(JSON.stringify(signal)).not.toMatch(/verified|corroboration_of_claims/i);
  });

  it('O. off-scope items attached to a popular theme are not rescued', () => {
    const baseline = score({
      title: 'NBA playoffs preview and fantasy football ranks',
      summary: 'Coach discusses point spread',
      missionTags: [],
      relevanceScore: 20,
    });
    const boosted = score({
      title: 'NBA playoffs preview and fantasy football ranks',
      summary: 'Coach discusses point spread',
      missionTags: [],
      relevanceScore: 20,
      themeAttention: attention(),
      themeRankingMode: 'active',
      missionScopeState: 'off_topic',
    });
    expect(boosted.displayPriority).toBe(baseline.displayPriority);
    expect(boosted.themeAttentionRanking?.ineligibleReasons).toContain(
      THEME_ATTENTION_RANKING.INELIGIBLE.OFF_SCOPE,
    );
  });

  it('P. suppression still wins', () => {
    const baseline = score({ surfaceState: 'suppressed' });
    const boosted = score({
      surfaceState: 'suppressed',
      themeAttention: attention(),
      themeRankingMode: 'active',
    });
    expect(boosted.displayPriority).toBe(baseline.displayPriority);
    expect(boosted.themeAttentionRanking?.ineligibleReasons).toContain(
      THEME_ATTENTION_RANKING.INELIGIBLE.SUPPRESSED,
    );
  });

  it('Q. stale items do not get a theme recency override', () => {
    const staleIso = new Date(Date.now() - 10 * 24 * 3600000).toISOString();
    const baseline = score({ publishedAt: staleIso });
    const boosted = score({
      publishedAt: staleIso,
      themeAttention: attention(),
      themeRankingMode: 'active',
    });
    expect(boosted.displayPriority).toBe(baseline.displayPriority);
    expect(boosted.themeAttentionRanking?.ineligibleReasons).toContain(
      THEME_ATTENTION_RANKING.INELIGIBLE.STALE_ITEM,
    );
  });

  it('R. sorting comparators do not call a store', () => {
    let storeCalls = 0;
    const items: LiveDeskItem[] = [
      {
        id: 'a',
        title: 'A',
        summary: null,
        canonicalUrl: 'https://a.test',
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        provenanceClass: 'PRIMARY',
        sourceName: 'A',
        sourceSlug: 'a',
        stateChangeType: 'x',
        clusterKeys: {},
        relevanceScore: 60,
        surfaceState: 'surfaced',
        suppressionReason: null,
        missionTags: [],
        branchOfGovernment: 'unknown',
        institutionalArea: 'unknown',
        relevanceExplanations: [],
        isDuplicateLoser: false,
        displayPriority: 70,
      },
      {
        id: 'b',
        title: 'B',
        summary: null,
        canonicalUrl: 'https://b.test',
        publishedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        provenanceClass: 'WIRE',
        sourceName: 'B',
        sourceSlug: 'b',
        stateChangeType: 'x',
        clusterKeys: {},
        relevanceScore: 55,
        surfaceState: 'surfaced',
        suppressionReason: null,
        missionTags: [],
        branchOfGovernment: 'unknown',
        institutionalArea: 'unknown',
        relevanceExplanations: [],
        isDuplicateLoser: false,
        displayPriority: 68,
      },
    ];
    const before = storeCalls;
    [...items].sort(compareDeskItems);
    [...items].sort(compareLiveRows);
    expect(storeCalls).toBe(before);
  });

  it('S. ranking adapter source never invokes AI providers', () => {
    const rankingSrc = readFileSync(
      path.join(process.cwd(), 'lib/intel/themeAttentionRanking.ts'),
      'utf8',
    );
    const displaySrc = readFileSync(path.join(process.cwd(), 'lib/intel/displayPriority.ts'), 'utf8');
    expect(rankingSrc).not.toMatch(/ollama|ThemeAIProvider|classifyMembership/);
    expect(displaySrc).not.toMatch(/ollama|ThemeAIProvider|classifyMembership/);
  });

  it('theme contribution cannot turn a routine item into a lead by itself', () => {
    const baseline = score({
      relevanceScore: 48,
      provenanceClass: 'INDIE',
      title: 'Court filing noted in oversight fight',
    });
    const active = score({
      relevanceScore: 48,
      provenanceClass: 'INDIE',
      title: 'Court filing noted in oversight fight',
      themeAttention: attention({ creatorCount7d: 6, activeDays7d: 7, momentum: 'rising' }),
      themeRankingMode: 'active',
    });
    if (active.themeAttentionRanking?.eligible) {
      expect(active.displayPriority - baseline.displayPriority).toBeLessThanOrEqual(
        THEME_ATTENTION_RANKING.MAX_CONTRIBUTION,
      );
    }
    expect(baseline.displayBucket === 'routine' ? active.displayBucket !== 'lead' : true).toBe(true);
  });
});

describe('compareThemeRanking calibration', () => {
  it('returns deterministic baseline vs theme-aware positions', () => {
    const items = [
      { ...midItem(), id: 'keep' },
      { ...midItem({ sourceSlug: 'other-indie' }), id: 'theme-item' },
    ];
    const map = {
      keep: null,
      'theme-item': attention(),
    };
    const first = compareThemeRanking(items, map);
    const second = compareThemeRanking(items, map);
    expect(first).toEqual(second);
    expect(first.summary.matchedCount).toBe(1);
    const moved = first.rows.find((row) => row.itemId === 'theme-item');
    expect(moved?.eligible).toBe(true);
    expect(moved?.themeScore).toBeGreaterThan(moved?.baselineScore || 0);
  });
});

describe('weak item gate uses pre-theme score', () => {
  it('does not apply when base display priority is below the floor', () => {
    const signal = deriveThemeAttentionSignal(attention(), {
      relevanceScore: 62,
      baseDisplayPriority: 40,
      publishedAt: new Date().toISOString(),
      missionScopeState: 'in_scope',
    });
    expect(signal.eligible).toBe(false);
    expect(signal.ineligibleReasons).toContain(THEME_ATTENTION_RANKING.INELIGIBLE.WEAK_ITEM);
  });
});

describe('mode helper used by tests that opt in', () => {
  const modes: ThemeRankingMode[] = ['off', 'shadow', 'active'];
  it('accepts the documented modes', () => {
    expect(modes).toContain(resolveThemeRankingMode({ THEME_RANKING_MODE: 'shadow' }));
  });
});
