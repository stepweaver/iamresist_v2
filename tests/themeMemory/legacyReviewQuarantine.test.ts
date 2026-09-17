import { describe, expect, it } from 'vitest';
import { compareThemeRanking } from '@/lib/intel/themeAttentionCompare';
import { summarizeThemeMemoryShadowDiagnostics } from '@/lib/intel/themeRankingDiagnostics';
import { deriveThemeAttentionSignal, resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import {
  classifyLegacyCoreMemberships,
  evaluateThemeLegacyReviewQuarantine,
  THEME_LEGACY_REVIEW_QUARANTINE,
} from '@/lib/themeMemory/legacyReview';
import { loadThemeAttentionForRanking } from '@/lib/themeMemory/readModel';
import { THEME_RECLASSIFY_REQUIRED_RANKING_MODE } from '@/lib/themeMemory/reclassify';
import { createMemoryThemeStore, themeItemKey, type ThemeStore } from '@/lib/themeMemory/store';
import type {
  ThemeDailySignalRecord,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';

const NOW = '2026-09-16T16:00:00.000Z';

function themeRecord(over: Partial<ThemeRecord> & Pick<ThemeRecord, 'id' | 'canonical_label'>): ThemeRecord {
  return {
    slug: over.slug || over.id,
    display_headline: over.canonical_label,
    summary: over.summary ?? over.canonical_label,
    first_seen_at: NOW,
    last_seen_at: NOW,
    lifecycle_status: over.lifecycle_status || 'persistent',
    metadata: {
      seededItemKey: over.metadata?.seededItemKey,
      creatorSeedStrength: 'converged',
      ...over.metadata,
    },
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function membershipRecord(
  over: Partial<ThemeMembershipRecord> & Pick<ThemeMembershipRecord, 'id' | 'theme_id' | 'title' | 'member_role'>,
): ThemeMembershipRecord {
  return {
    source_system: over.source_system || 'voice',
    source_slug: over.source_slug || over.id,
    source_name: over.source_name || over.source_slug || over.id,
    identity_key: over.identity_key || `url:${over.id}`,
    canonical_url: over.canonical_url || `https://example.test/${over.id}`,
    summary: over.summary ?? null,
    published_at: over.published_at || NOW,
    item_observed_at: over.item_observed_at || NOW,
    membership_confidence: 1,
    membership_method: 'deterministic',
    membership_reasons: over.membership_reasons || ['attached'],
    content_hash: over.content_hash || over.id,
    classification_version: 'tm-classify-v3',
    membership_prompt_version: null,
    provenance_class: over.provenance_class ?? 'SPECIALIST',
    desk_lane: 'osint',
    source_family: 'general',
    first_assigned_at: over.first_assigned_at || NOW,
    last_confirmed_at: over.last_confirmed_at || NOW,
    metadata: over.metadata || { identityClass: 'core', identityReason: 'core_identity' },
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function signalRecord(themeId: string, over: Partial<ThemeDailySignalRecord> = {}): ThemeDailySignalRecord {
  return {
    theme_id: themeId,
    signal_date: '2026-09-16',
    creator_count: 3,
    creator_item_count: 4,
    newswire_source_count: 1,
    newswire_item_count: 1,
    intel_source_count: 1,
    intel_item_count: 1,
    primary_source_count: 0,
    specialist_source_count: 1,
    creator_breadth: 3,
    active_days_7: 4,
    active_days_14: 6,
    active_days_30: 6,
    creator_momentum: 1.2,
    evidence_depth: 2,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

function cleanTheme() {
  return themeRecord({
    id: 'theme-clean',
    canonical_label: 'Massie Moves to Impeach Hegseth',
    metadata: { seededItemKey: 'voice:meidastouch:url:massie-seed', creatorSeedStrength: 'converged' },
  });
}

function cleanSeed() {
  return membershipRecord({
    id: 'massie-seed',
    theme_id: 'theme-clean',
    source_slug: 'meidastouch',
    source_name: 'MeidasTouch',
    title: 'BREAKING: Rep. Massie moves to IMPEACH Hegseth',
    member_role: 'creator',
    membership_reasons: ['seeded_creator_led_theme'],
    metadata: { identityClass: 'core', identityReason: 'seed' },
  });
}

function cleanCoreItem() {
  return membershipRecord({
    id: 'lawfare-clean',
    theme_id: 'theme-clean',
    source_system: 'intel',
    source_slug: 'lawfare',
    source_name: 'Lawfare',
    identity_key: 'url:https://lawfare.test/massie-hegseth',
    canonical_url: 'https://lawfare.test/massie-hegseth',
    title: 'Court reviews Massie effort to impeach Hegseth',
    member_role: 'specialist',
    metadata: { identityClass: 'core', identityReason: 'core_identity' },
  });
}

function reviewTheme(id = 'theme-review') {
  return themeRecord({
    id,
    canonical_label: '9/11 Widow Blasts U.S. Cover-Up of Saudi Role in Attacks',
    metadata: { seededItemKey: `voice:voice-a:url:${id}-seed`, creatorSeedStrength: 'converged' },
  });
}

function reviewSeed(themeId = 'theme-review') {
  return membershipRecord({
    id: `${themeId}-seed`,
    theme_id: themeId,
    source_slug: 'voice-a',
    title: 'ICYMI Been one year since a podcaster died and y’all compared that man to Jesus-',
    member_role: 'creator',
    membership_reasons: ['seeded_creator_led_theme'],
    metadata: { identityClass: 'core', identityReason: 'seed' },
  });
}

function reviewCoreItem(themeId = 'theme-review') {
  return membershipRecord({
    id: `${themeId}-intel`,
    theme_id: themeId,
    source_system: 'intel',
    source_slug: 'lawfare',
    source_name: 'Lawfare',
    identity_key: `url:https://lawfare.test/${themeId}`,
    canonical_url: `https://lawfare.test/${themeId}`,
    title: '"One Betrayal After Another": 9/11 Widow Blasts U.S. Cover-Up of Saudi Role in Attacks',
    member_role: 'specialist',
    metadata: { identityClass: 'core', identityReason: 'core_identity' },
  });
}

function itemRef(row: ThemeMembershipRecord) {
  return {
    sourceSystem: row.source_system,
    sourceSlug: row.source_slug,
    identityKey: row.identity_key,
  };
}

function writeCountingStore(inner: ThemeStore) {
  const writes = { themes: 0, memberships: 0, signals: 0, analyses: 0 };
  const store: ThemeStore = {
    ...inner,
    async upsertTheme(row) {
      writes.themes += 1;
      return inner.upsertTheme(row);
    },
    async upsertMembership(row) {
      writes.memberships += 1;
      return inner.upsertMembership(row);
    },
    async upsertSignal(row) {
      writes.signals += 1;
      return inner.upsertSignal(row);
    },
    async upsertAnalysis(row) {
      writes.analyses += 1;
      return inner.upsertAnalysis(row);
    },
  };
  return { store, writes };
}

describe('legacy REVIEW quarantine for Theme Memory ranking', () => {
  it('1: theme with DOWNGRADE_CONTEXTUAL=0 and REVIEW=0 remains rankable', async () => {
    const theme = cleanTheme();
    const seed = cleanSeed();
    const core = cleanCoreItem();
    const { decisions } = classifyLegacyCoreMemberships(theme, [seed, core]);
    expect(decisions.every((row) => row.proposedClass === 'KEEP_CORE')).toBe(true);
    expect(decisions.some((row) => row.proposedClass === 'REVIEW')).toBe(false);
    expect(decisions.some((row) => row.proposedClass === 'DOWNGRADE_CONTEXTUAL')).toBe(false);

    const quarantine = evaluateThemeLegacyReviewQuarantine(theme, [seed, core]);
    expect(quarantine.quarantined).toBe(false);
    expect(quarantine.reviewMembershipCount).toBe(0);

    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({ themes: [theme], memberships: [seed, core], signals: [signalRecord(theme.id)] }),
      [itemRef(core)],
      { now: NOW },
    );
    const hit = loaded.byItem.get(themeItemKey(core));
    expect(hit?.matchedThemeId).toBe(theme.id);
    expect(loaded.themes[0]?.quarantined).toBe(false);
  });

  it('2: theme with one unresolved REVIEW membership is quarantined', () => {
    const theme = reviewTheme();
    const seed = reviewSeed();
    const { decisions } = classifyLegacyCoreMemberships(theme, [seed]);
    expect(decisions.filter((row) => row.proposedClass === 'REVIEW')).toHaveLength(1);

    const quarantine = evaluateThemeLegacyReviewQuarantine(theme, [seed]);
    expect(quarantine.quarantined).toBe(true);
    expect(quarantine.reviewMembershipCount).toBe(1);
    expect(quarantine.quarantineReason).toBeTruthy();
  });

  it('3: quarantined theme returns no theme attention', async () => {
    const theme = reviewTheme();
    const seed = reviewSeed();
    const core = reviewCoreItem();
    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({ themes: [theme], memberships: [seed, core], signals: [signalRecord(theme.id)] }),
      [itemRef(core)],
      { now: NOW },
    );
    expect(loaded.byItem.get(themeItemKey(core))).toBeNull();
    const signal = deriveThemeAttentionSignal(loaded.byItem.get(themeItemKey(core)), {}, 'shadow');
    expect(signal.contribution).toBe(0);
    expect(signal.appliedContribution).toBe(0);
    expect(signal.eligible).toBe(false);
  });

  it('4: contextual membership alone does not quarantine theme', async () => {
    const theme = cleanTheme();
    const seed = cleanSeed();
    const contextual = membershipRecord({
      id: 'context-only',
      theme_id: theme.id,
      source_system: 'intel',
      source_slug: 'lawfare',
      identity_key: 'url:https://lawfare.test/context-only',
      canonical_url: 'https://lawfare.test/context-only',
      title: 'Unrelated camera mention',
      member_role: 'specialist',
      metadata: { identityClass: 'contextual', identityReason: 'contextual' },
    });
    const quarantine = evaluateThemeLegacyReviewQuarantine(theme, [seed, contextual]);
    expect(quarantine.quarantined).toBe(false);
    expect(quarantine.reviewMembershipCount).toBe(0);

    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({
        themes: [theme],
        memberships: [seed, contextual],
        signals: [signalRecord(theme.id)],
      }),
      [itemRef(contextual)],
      { now: NOW },
    );
    expect(loaded.byItem.get(themeItemKey(contextual))).toBeNull();
    expect(loaded.themes[0]?.quarantined).toBe(false);
  });

  it('5: clean core member still receives attention', async () => {
    const theme = cleanTheme();
    const seed = cleanSeed();
    const core = cleanCoreItem();
    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({ themes: [theme], memberships: [seed, core], signals: [signalRecord(theme.id)] }),
      [itemRef(core)],
      { now: NOW },
    );
    const hit = loaded.byItem.get(themeItemKey(core));
    expect(hit?.matchedThemeId).toBe(theme.id);
    expect(hit?.creatorCount7d).toBe(3);
    expect(hit?.membershipIsNotCorroboration).toBe(true);
    const ranking = deriveThemeAttentionSignal(hit, { relevanceScore: 62, publishedAt: NOW }, 'shadow');
    expect(ranking.eligible).toBe(true);
    expect(ranking.contribution).toBeGreaterThan(0);
    expect(ranking.appliedContribution).toBe(0);
  });

  it('6: REVIEW theme remains visible in diagnostics', async () => {
    const theme = reviewTheme();
    const seed = reviewSeed();
    const core = reviewCoreItem();
    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({ themes: [theme], memberships: [seed, core], signals: [signalRecord(theme.id)] }),
      [itemRef(core)],
      { now: NOW },
    );
    expect(loaded.byItem.get(themeItemKey(core))).toBeNull();
    expect(loaded.themes).toHaveLength(1);
    expect(loaded.themes[0]).toMatchObject({
      themeId: theme.id,
      canonicalLabel: theme.canonical_label,
      quarantined: true,
      reviewMembershipCount: 2,
      coreMembershipCount: 2,
      attentionWouldOtherwiseApply: true,
    });
    expect(loaded.themes[0]?.quarantineReason).toBeTruthy();

    const comparison = compareThemeRanking(
      [
        {
          id: 'desk-item',
          title: core.title,
          summary: core.title,
          provenanceClass: 'SPECIALIST',
          sourceSlug: 'lawfare',
          stateChangeType: 'specialist_item',
          missionTags: ['courts'],
          branchOfGovernment: 'judicial',
          institutionalArea: 'courts',
          relevanceScore: 62,
          clusterKeys: {},
          publishedAt: NOW,
          deskLane: 'osint',
        },
      ],
      new Map([['desk-item', loaded.byItem.get(themeItemKey(core)) ?? null]]),
    );
    const shadow = summarizeThemeMemoryShadowDiagnostics({
      themes: loaded.themes,
      comparison,
      attentionByItemId: new Map([['desk-item', loaded.byItem.get(themeItemKey(core)) ?? null]]),
    });
    expect(shadow.themesQuarantined).toBe(1);
    expect(shadow.themes[0]?.quarantined).toBe(true);
    expect(shadow.rankableItemsWithThemeAttention).toBe(0);
  });

  it('7: no mutation occurs', async () => {
    const theme = reviewTheme();
    const seed = reviewSeed();
    const core = reviewCoreItem();
    const inner = createMemoryThemeStore({
      themes: [theme],
      memberships: [seed, core],
      signals: [signalRecord(theme.id)],
    });
    const { store, writes } = writeCountingStore(inner);
    await loadThemeAttentionForRanking(store, [itemRef(core)], { now: NOW });
    expect(writes).toEqual({ themes: 0, memberships: 0, signals: 0, analyses: 0 });
    const still = await inner.listMemberships();
    expect(still).toHaveLength(2);
    expect(still.every((row) => row.metadata.identityClass === 'core')).toBe(true);
    const stillThemes = await inner.listThemes();
    expect(stillThemes[0]?.canonical_label).toBe(theme.canonical_label);
  });

  it('8: ranking mode remains shadow', () => {
    expect(THEME_RECLASSIFY_REQUIRED_RANKING_MODE).toBe('shadow');
    expect(resolveThemeRankingMode({ THEME_RANKING_MODE: 'shadow' })).toBe('shadow');
    expect(resolveThemeRankingMode({ THEME_RANKING_MODE: 'shadow', THEME_RANKING_ENABLED: 'true' })).toBe('shadow');
  });

  it('9: multiple review rows on one theme count as one quarantined theme', async () => {
    const theme = reviewTheme();
    const seed = reviewSeed();
    const core = reviewCoreItem();
    const extra = membershipRecord({
      id: 'review-extra',
      theme_id: theme.id,
      source_system: 'intel',
      source_slug: 'just-security',
      identity_key: 'url:https://justsecurity.test/review-extra',
      canonical_url: 'https://justsecurity.test/review-extra',
      title: 'Another 9/11 Saudi cover-up filing',
      member_role: 'specialist',
      metadata: { identityClass: 'core', identityReason: 'core_identity' },
    });
    const { decisions } = classifyLegacyCoreMemberships(theme, [seed, core, extra]);
    expect(decisions.filter((row) => row.proposedClass === 'REVIEW').length).toBeGreaterThan(1);

    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({
        themes: [theme],
        memberships: [seed, core, extra],
        signals: [signalRecord(theme.id)],
      }),
      [itemRef(core), itemRef(extra)],
      { now: NOW },
    );
    expect(loaded.themes.filter((row) => row.quarantined)).toHaveLength(1);
    expect(loaded.themes[0]?.reviewMembershipCount).toBeGreaterThan(1);
    expect(loaded.byItem.get(themeItemKey(core))).toBeNull();
    expect(loaded.byItem.get(themeItemKey(extra))).toBeNull();

    const shadow = summarizeThemeMemoryShadowDiagnostics({
      themes: loaded.themes,
      comparison: { rows: [] },
      attentionByItemId: loaded.byItem,
    });
    expect(shadow.themesConsidered).toBe(1);
    expect(shadow.themesQuarantined).toBe(1);
    expect(shadow.rankableThemes).toBe(0);
  });

  it('10: removing the review condition restores eligibility', async () => {
    const mismatched = reviewTheme();
    const mismatchedSeed = reviewSeed();
    const core = reviewCoreItem();
    expect(evaluateThemeLegacyReviewQuarantine(mismatched, [mismatchedSeed, core]).quarantined).toBe(true);

    const restored = themeRecord({
      id: mismatched.id,
      canonical_label: mismatchedSeed.title,
      metadata: mismatched.metadata,
    });
    const restoredQuarantine = evaluateThemeLegacyReviewQuarantine(restored, [mismatchedSeed, core]);
    expect(restoredQuarantine.quarantined).toBe(false);
    expect(restoredQuarantine.reviewMembershipCount).toBe(0);

    const loaded = await loadThemeAttentionForRanking(
      createMemoryThemeStore({
        themes: [restored],
        memberships: [mismatchedSeed, core],
        signals: [signalRecord(restored.id)],
      }),
      [itemRef(core)],
      { now: NOW },
    );
    expect(loaded.byItem.get(themeItemKey(core))?.matchedThemeId).toBe(restored.id);
    expect(loaded.themes[0]?.quarantined).toBe(false);
  });

  it('fail closed: evaluation errors quarantine the theme', () => {
    const theme = cleanTheme();
    const poison = new Proxy(cleanSeed(), {
      get() {
        throw new Error('identity evaluation failed');
      },
    });
    const quarantine = evaluateThemeLegacyReviewQuarantine(theme, [poison as ThemeMembershipRecord]);
    expect(quarantine.quarantined).toBe(true);
    expect(quarantine.quarantineReason).toBe('legacy_review_evaluation_failed');
  });

  it('shadow diagnostics expose baseline vs theme boost aggregates', () => {
    const comparison = compareThemeRanking(
      [
        {
          id: 'boosted',
          title: 'Court reviews Massie effort to impeach Hegseth',
          summary: 'Court reviews Massie effort to impeach Hegseth',
          provenanceClass: 'SPECIALIST',
          sourceSlug: 'lawfare',
          stateChangeType: 'specialist_item',
          missionTags: ['courts'],
          branchOfGovernment: 'judicial',
          institutionalArea: 'courts',
          relevanceScore: 62,
          clusterKeys: {},
          publishedAt: NOW,
          deskLane: 'osint',
        },
        {
          id: 'plain',
          title: 'Routine wire item',
          summary: 'Routine wire item',
          provenanceClass: 'WIRE',
          sourceSlug: 'ap',
          stateChangeType: 'wire_item',
          missionTags: ['courts'],
          branchOfGovernment: 'judicial',
          institutionalArea: 'courts',
          relevanceScore: 55,
          clusterKeys: {},
          publishedAt: NOW,
          deskLane: 'osint',
        },
      ],
      {
        boosted: {
          matchedThemeId: 'theme-clean',
          creatorCount7d: 3,
          creatorItemCount7d: 4,
          activeDays7d: 4,
          lifecycle: 'persistent',
          momentum: 'rising',
          primarySourceCount: 0,
          specialistSourceCount: 1,
          reportingSourceCount: 1,
          creatorSeedStrength: 'converged',
          themeEvidenceDepth: 2,
          reasons: ['theme:matched_membership'],
          membershipIsNotCorroboration: true,
        },
        plain: null,
      },
    );
    const boosted = comparison.rows.find((row) => row.itemId === 'boosted');
    const plain = comparison.rows.find((row) => row.itemId === 'plain');
    expect(boosted?.baselineScore).toBeLessThan(boosted?.themeScore || 0);
    expect(plain?.baselineScore).toBe(plain?.themeScore);
    const shadow = summarizeThemeMemoryShadowDiagnostics({
      themes: [
        {
          themeId: 'theme-clean',
          canonicalLabel: 'Massie Moves to Impeach Hegseth',
          quarantined: false,
          quarantineReason: null,
          reviewMembershipCount: 0,
          coreMembershipCount: 2,
          attentionWouldOtherwiseApply: true,
        },
        {
          themeId: 'theme-review',
          canonicalLabel: 'Unresolved identity',
          quarantined: true,
          quarantineReason: THEME_LEGACY_REVIEW_QUARANTINE,
          reviewMembershipCount: 2,
          coreMembershipCount: 2,
          attentionWouldOtherwiseApply: true,
        },
      ],
      comparison,
      attentionByItemId: {
        boosted: { matchedThemeId: 'theme-clean' } as never,
        plain: null,
      },
    });
    expect(shadow.themesConsidered).toBe(2);
    expect(shadow.themesQuarantined).toBe(1);
    expect(shadow.rankableThemes).toBe(1);
    expect(shadow.rankableItemsWithThemeAttention).toBe(1);
    expect(shadow.maxThemeBoost).toBe(boosted?.contribution);
    expect(shadow.averageThemeBoost).toBeGreaterThan(0);
  });
});
