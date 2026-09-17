import { describe, expect, it } from 'vitest';

import {
  auditThemeRankingCoverage,
  formatThemeRankingCoverageReport,
  loadThemeRankingCoverageAudit,
  type ThemeCoverageDeskItem,
} from '@/lib/themeMemory/rankingCoverageAudit';
import { createMemoryThemeStore, type ThemeStore } from '@/lib/themeMemory/store';
import type {
  ThemeItemAnalysisRecord,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';
import { themeIdentityFromCanonical } from '@/lib/themeMemory/normalize';

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

function cleanTheme() {
  return themeRecord({
    id: 'theme-clean',
    canonical_label: 'Massie Moves to Impeach Hegseth',
    metadata: { seededItemKey: 'voice:meidastouch:url:https://meidastouch.test/massie-seed', creatorSeedStrength: 'converged' },
  });
}

function cleanSeed() {
  return membershipRecord({
    id: 'massie-seed',
    theme_id: 'theme-clean',
    source_slug: 'meidastouch',
    source_name: 'MeidasTouch',
    identity_key: 'url:https://meidastouch.test/massie-seed',
    canonical_url: 'https://meidastouch.test/massie-seed',
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
    metadata: { seededItemKey: `voice:voice-a:url:https://voice-a.test/${id}-seed`, creatorSeedStrength: 'converged' },
  });
}

function reviewSeed(themeId = 'theme-review') {
  return membershipRecord({
    id: `${themeId}-seed`,
    theme_id: themeId,
    source_slug: 'voice-a',
    identity_key: `url:https://voice-a.test/${themeId}-seed`,
    canonical_url: `https://voice-a.test/${themeId}-seed`,
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

function deskItem(over: Partial<ThemeCoverageDeskItem> & Pick<ThemeCoverageDeskItem, 'id' | 'title' | 'canonicalUrl'>): ThemeCoverageDeskItem {
  return {
    sourceSlug: 'lawfare',
    sourceName: 'Lawfare',
    summary: over.summary || over.title,
    publishedAt: NOW,
    provenanceClass: 'SPECIALIST',
    deskLane: 'osint',
    clusterKeys: {},
    ...over,
  };
}

function derivedKey(item: ThemeCoverageDeskItem): string {
  return themeIdentityFromCanonical({
    sourceSystem: 'intel',
    sourceSlug: String(item.sourceSlug || 'lawfare'),
    canonicalUrl: String(item.canonicalUrl),
    externalId: item.externalId ?? null,
  }).identityKey;
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

describe('Theme Memory live desk ranking coverage audit', () => {
  it('classifies exact clean core as CORE_ELIGIBLE', () => {
    const core = cleanCoreItem();
    const item = deskItem({
      id: 'desk-clean-core',
      title: core.title,
      canonicalUrl: core.canonical_url,
      sourceSlug: core.source_slug,
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed(), core],
      deskLane: 'osint',
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('CORE_ELIGIBLE');
    expect(report.rows[0]?.exactLookupMatched).toBe(true);
    expect(report.rows[0]?.derivedIdentityKey).toBe(core.identity_key);
    expect(report.rows[0]?.persistedMembershipIdentityKey).toBe(core.identity_key);
    expect(report.totals.CORE_ELIGIBLE).toBe(1);
    expect(report.totals.CORE_QUARANTINED).toBe(0);
  });

  it('classifies core in a quarantined theme as CORE_QUARANTINED and never CORE_ELIGIBLE', () => {
    const core = reviewCoreItem();
    const item = deskItem({
      id: 'desk-review-core',
      title: core.title,
      canonicalUrl: core.canonical_url,
      sourceSlug: core.source_slug,
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [reviewTheme(), cleanTheme()],
      memberships: [reviewSeed(), core, cleanSeed()],
      deskLane: 'osint',
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('CORE_QUARANTINED');
    expect(report.rows[0]?.themeQuarantined).toBe(true);
    expect(report.totals.CORE_ELIGIBLE).toBe(0);
    expect(report.totals.CORE_QUARANTINED).toBe(1);
    expect(report.rows[0]?.previewOutcome).toBeNull();
  });

  it('classifies contextual membership as CONTEXTUAL', () => {
    const contextual = membershipRecord({
      id: 'lawfare-context',
      theme_id: 'theme-clean',
      source_system: 'intel',
      source_slug: 'lawfare',
      identity_key: 'url:https://lawfare.test/context-only',
      canonical_url: 'https://lawfare.test/context-only',
      title: 'Related hearing on congressional procedure',
      member_role: 'specialist',
      metadata: { identityClass: 'contextual', identityReason: 'contextual' },
    });
    const item = deskItem({
      id: 'desk-context',
      title: contextual.title,
      canonicalUrl: contextual.canonical_url,
      sourceSlug: 'lawfare',
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed(), contextual],
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('CONTEXTUAL');
    expect(report.rows[0]?.identityClass).toBe('contextual');
  });

  it('classifies membership without usable core identity as UNCLASSIFIED', () => {
    const unclassified = membershipRecord({
      id: 'lawfare-unclassified',
      theme_id: 'theme-clean',
      source_system: 'intel',
      source_slug: 'lawfare',
      identity_key: 'url:https://lawfare.test/unclassified',
      canonical_url: 'https://lawfare.test/unclassified',
      title: 'Legacy member without identity class',
      member_role: 'specialist',
      metadata: {},
    });
    const item = deskItem({
      id: 'desk-unclassified',
      title: unclassified.title,
      canonicalUrl: unclassified.canonical_url,
      sourceSlug: 'lawfare',
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed(), unclassified],
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('UNCLASSIFIED');
    expect(report.rows[0]?.identityClass).toBeNull();
  });

  it('classifies missing membership as NO_MEMBERSHIP', () => {
    const item = deskItem({
      id: 'desk-unrelated',
      title: 'Routine weather advisory for the mid-Atlantic',
      canonicalUrl: 'https://weather.test/advisory',
      sourceSlug: 'weather-desk',
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed()],
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('NO_MEMBERSHIP');
    expect(report.rows[0]?.exactLookupMatched).toBe(false);
    expect(report.rows[0]?.previewOutcome).toBe('NO_PLAUSIBLE_THEME');
    expect(report.totals.NO_MEMBERSHIP).toBe(1);
    expect(report.totals.NO_PLAUSIBLE_THEME).toBe(1);
  });

  it('surfaces identity lookup mismatch when a membership exists under a different identity key', () => {
    const core = cleanCoreItem();
    const item = deskItem({
      id: 'desk-mismatch',
      title: core.title,
      canonicalUrl: core.canonical_url,
      sourceSlug: 'lawfare-blog',
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed(), core],
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('NO_MEMBERSHIP');
    expect(report.rows[0]?.previewOutcome).toBe('IDENTITY_LOOKUP_MISMATCH');
    expect(report.rows[0]?.exactLookupMatched).toBe(false);
    expect(report.rows[0]?.derivedIdentityKey).toBe(derivedKey(item));
    expect(report.rows[0]?.persistedMembershipIdentityKey).toBe(core.identity_key);
    expect(report.rows[0]?.sourceSlug).toBe('lawfare-blog');
    expect(report.totals.IDENTITY_LOOKUP_MISMATCH).toBe(1);
    expect(report.totals.CORE_ELIGIBLE).toBe(0);
  });

  it('previews WOULD_BE_CORE without writing, and reports a prior no_match analysis', async () => {
    const item = deskItem({
      id: 'desk-would-be-core',
      title: 'Court reviews Massie effort to impeach Hegseth',
      canonicalUrl: 'https://lawfare.test/massie-hegseth-unattached',
      sourceSlug: 'lawfare',
    });
    const identity = themeIdentityFromCanonical({
      sourceSystem: 'intel',
      sourceSlug: 'lawfare',
      canonicalUrl: item.canonicalUrl as string,
    });
    const analysis: ThemeItemAnalysisRecord = {
      source_system: 'intel',
      source_slug: 'lawfare',
      identity_key: identity.identityKey,
      content_hash: 'hash-would-be-core',
      classification_version: 'tm-classify-v3:none:tm-membership-v3',
      theme_id: null,
      decision: 'no_match',
      membership_method: 'deterministic',
      reasons: ['no_plausible_candidate'],
      created_at: NOW,
      updated_at: NOW,
    };
    const inner = createMemoryThemeStore({
      themes: [cleanTheme()],
      memberships: [cleanSeed()],
      analyses: [analysis],
    });
    const { store, writes } = writeCountingStore(inner);
    const report = await loadThemeRankingCoverageAudit(store, [item], { deskLane: 'osint', now: NOW });
    expect(report.rows[0]?.coverageState).toBe('NO_MEMBERSHIP');
    expect(report.rows[0]?.previewOutcome).toBe('WOULD_BE_CORE');
    expect(report.rows[0]?.themeLabel).toBe('Massie Moves to Impeach Hegseth');
    expect(report.rows[0]?.hardEventEvidence.length).toBeGreaterThan(0);
    expect(report.rows[0]?.priorNoMatchAnalysis).toBe(true);
    expect(report.wouldBeCore).toHaveLength(1);
    expect(report.wouldBeCore[0]?.priorNoMatchAnalysis).toBe(true);
    expect(writes).toEqual({ themes: 0, memberships: 0, signals: 0, analyses: 0 });
    const members = await store.listMemberships();
    expect(members).toHaveLength(1);
  });

  it('does not preview quarantined theme cores as eligible or WOULD_BE_CORE', () => {
    const item = deskItem({
      id: 'desk-review-unattached',
      title: '"One Betrayal After Another": 9/11 Widow Blasts U.S. Cover-Up of Saudi Role in Attacks',
      canonicalUrl: 'https://lawfare.test/911-widow-unattached',
      sourceSlug: 'lawfare',
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [reviewTheme()],
      memberships: [reviewSeed(), reviewCoreItem()],
      now: NOW,
    });
    expect(report.rows[0]?.coverageState).toBe('NO_MEMBERSHIP');
    expect(report.rows[0]?.previewOutcome).not.toBe('WOULD_BE_CORE');
    expect(report.totals.CORE_ELIGIBLE).toBe(0);
    expect(report.totals.WOULD_BE_CORE).toBe(0);
  });

  it('lists clean Intel cores that are not in the current ranking pool', () => {
    const core = cleanCoreItem();
    const poolItem = deskItem({
      id: 'desk-unrelated',
      title: 'Routine weather advisory for the mid-Atlantic',
      canonicalUrl: 'https://weather.test/advisory',
      sourceSlug: 'weather-desk',
    });
    const report = auditThemeRankingCoverage({
      deskItems: [poolItem],
      themes: [cleanTheme(), reviewTheme()],
      memberships: [cleanSeed(), core, reviewSeed(), reviewCoreItem()],
      now: NOW,
    });
    expect(report.cleanIntelCoresNotInPool.map((row) => row.identityKey)).toEqual([core.identity_key]);
    expect(report.cleanIntelCoresNotInPool[0]?.title).toBe(core.title);
  });

  it('prints aggregate coverage counts for the current snapshot', () => {
    const core = cleanCoreItem();
    const item = deskItem({
      id: 'desk-clean-core',
      title: core.title,
      canonicalUrl: core.canonical_url,
      sourceSlug: core.source_slug,
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed(), core],
      deskLane: 'osint',
      now: NOW,
    });
    const text = formatThemeRankingCoverageReport(report);
    expect(text).toContain('total desk candidates: 1');
    expect(text).toContain('CORE_ELIGIBLE: 1');
    expect(text).toContain('exact lookup matched: yes');
  });

  it('does not preview unrelated executive-order items as WOULD_BE_CORE', () => {
    const theme = themeRecord({
      id: 'theme-scotus-eo',
      canonical_label: "Supreme Court Blocks Trump’s Executive Order",
      metadata: {
        seededItemKey: 'voice:meidastouch:url:https://meidastouch.test/scotus-eo-seed',
        creatorSeedStrength: 'converged',
      },
    });
    const seed = membershipRecord({
      id: 'scotus-eo-seed',
      theme_id: 'theme-scotus-eo',
      source_slug: 'meidastouch',
      identity_key: 'url:https://meidastouch.test/scotus-eo-seed',
      canonical_url: 'https://meidastouch.test/scotus-eo-seed',
      title: "Supreme Court Blocks Trump’s Executive Order",
      member_role: 'creator',
      membership_reasons: ['seeded_creator_led_theme'],
      metadata: { identityClass: 'core', identityReason: 'seed' },
    });
    const titles = [
      'White House issues executive order on electrical grid reliability',
      'New executive order targets voting procedures in several states',
      'President signs executive order on federal contracting rules',
      'Executive order directs agencies to rewrite environmental reviews',
      'Administration executive order on student loan servicing',
    ];
    const deskItems = titles.map((title, index) =>
      deskItem({
        id: `desk-eo-${index}`,
        title,
        canonicalUrl: `https://lawfare.test/eo-${index}`,
        sourceSlug: 'lawfare',
      }),
    );
    const report = auditThemeRankingCoverage({
      deskItems,
      themes: [theme],
      memberships: [seed],
      deskLane: 'osint',
      now: NOW,
    });
    expect(report.totals.WOULD_BE_CORE).toBe(0);
    expect(report.wouldBeCore).toHaveLength(0);
    for (const row of report.rows) {
      expect(row.coverageState).toBe('NO_MEMBERSHIP');
      expect(['PLAUSIBLE_CONTEXTUAL', 'NO_PLAUSIBLE_THEME']).toContain(row.previewOutcome);
      expect(row.hardEventEvidence.join(' ')).not.toMatch(/executive order/);
    }
  });

  it('reports Intel cap saturation on NO_MEMBERSHIP rows', () => {
    const item = deskItem({
      id: 'desk-cap',
      title: 'Routine weather advisory for the mid-Atlantic',
      canonicalUrl: 'https://weather.test/advisory',
      sourceSlug: 'weather-desk',
      publishedAt: '2026-09-01T12:00:00.000Z',
    });
    const identity = themeIdentityFromCanonical({
      sourceSystem: 'intel',
      sourceSlug: 'weather-desk',
      canonicalUrl: item.canonicalUrl as string,
    });
    const report = auditThemeRankingCoverage({
      deskItems: [item],
      themes: [cleanTheme()],
      memberships: [cleanSeed()],
      now: NOW,
      intelSaturation: {
        windowStart: '2026-09-02T16:00:00.000Z',
        windowEnd: NOW,
        availableInWindow: 1500,
        selectedForProcessing: 1000,
        fetchedRaw: 1000,
        candidateLimit: 1000,
        candidateLimitHit: true,
        newestSelectedAt: NOW,
        oldestSelectedAt: '2026-09-09T16:00:00.000Z',
        selectedIdentityKeys: ['intel:other:url:https://other.test/item'],
      },
    });
    expect(report.intelSaturation?.candidateLimitHit).toBe(true);
    expect(report.rows[0]?.insideProcessWindow).toBe(false);
    expect(report.rows[0]?.presentInSelectedIntelCandidateSet).toBe(false);
    expect(report.rows[0]?.excludedByCandidateCap).toBe(false);
    expect(report.rows[0]?.alreadyHasAnalysis).toBe(false);
    const olderInWindow = deskItem({
      id: 'desk-cap-old',
      title: 'Older Intel item truncated by cap',
      canonicalUrl: 'https://weather.test/older',
      sourceSlug: 'weather-desk',
      publishedAt: '2026-09-03T12:00:00.000Z',
    });
    const truncated = auditThemeRankingCoverage({
      deskItems: [olderInWindow],
      themes: [cleanTheme()],
      memberships: [cleanSeed()],
      now: NOW,
      intelSaturation: {
        windowStart: '2026-09-02T16:00:00.000Z',
        windowEnd: NOW,
        availableInWindow: 1500,
        selectedForProcessing: 1000,
        fetchedRaw: 1000,
        candidateLimit: 1000,
        candidateLimitHit: true,
        newestSelectedAt: NOW,
        oldestSelectedAt: '2026-09-09T16:00:00.000Z',
        selectedIdentityKeys: ['intel:other:url:https://other.test/item'],
      },
    });
    expect(truncated.rows[0]?.insideProcessWindow).toBe(true);
    expect(truncated.rows[0]?.presentInSelectedIntelCandidateSet).toBe(false);
    expect(truncated.rows[0]?.excludedByCandidateCap).toBe(true);
    expect(identity.identityKey).toBeTruthy();
    const text = formatThemeRankingCoverageReport(truncated);
    expect(text).toContain('candidate limit hit: yes');
    expect(text).toContain('excluded by candidate cap: yes');
  });
});
