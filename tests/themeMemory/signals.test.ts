import { describe, expect, it } from 'vitest';

import { computeThemeDailySignal, distinctReportingSources, toThemeDailySignalRecord } from '@/lib/themeMemory/signals';
import { THEME_MEMBERSHIP_IS_NOT_CORROBORATION } from '@/lib/themeMemory/constants';
import type { ThemeMembershipRecord } from '@/lib/themeMemory/themeTypes';

function member(over: Partial<ThemeMembershipRecord> & Pick<ThemeMembershipRecord, 'id' | 'member_role' | 'source_system' | 'source_slug' | 'title' | 'item_observed_at'>): ThemeMembershipRecord {
  return {
    theme_id: 'theme-1',
    source_name: over.source_slug,
    identity_key: `url:${over.id}`,
    canonical_url: `https://example.test/${over.id}`,
    summary: null,
    published_at: over.item_observed_at,
    membership_confidence: 1,
    membership_method: 'deterministic',
    membership_reasons: ['test'],
    content_hash: over.id,
    classification_version: 'tm-classify-v1',
    membership_prompt_version: null,
    provenance_class: null,
    desk_lane: null,
    source_family: 'general',
    first_assigned_at: over.item_observed_at,
    last_confirmed_at: over.item_observed_at,
    metadata: { identityClass: 'core', identityReason: 'core_identity' },
    created_at: over.item_observed_at,
    updated_at: over.item_observed_at,
    ...over,
  };
}

describe('Theme Memory daily signals', () => {
  it('counts creator attention separately from evidence depth', () => {
    const members = [
      member({
        id: 'c1',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Deployment authority',
        item_observed_at: '2026-09-10T12:00:00.000Z',
      }),
      member({
        id: 'n1',
        source_system: 'newswire',
        source_slug: 'ap',
        member_role: 'reporting',
        title: 'Court reviews federal deployment',
        item_observed_at: '2026-09-10T13:00:00.000Z',
      }),
      member({
        id: 'p1',
        source_system: 'intel',
        source_slug: 'federal-register',
        member_role: 'primary',
        title: 'Primary filing on deployment authority',
        item_observed_at: '2026-09-10T14:00:00.000Z',
      }),
    ];

    const signal = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });

    expect(signal.creator_count).toBe(1);
    expect(signal.creator_item_count).toBe(1);
    expect(signal.primary_source_count).toBe(1);
    expect(signal.evidence_depth).toBeGreaterThan(0);
    expect(signal.metadata.membershipIsNotCorroboration).toBe(THEME_MEMBERSHIP_IS_NOT_CORROBORATION);
  });

  it('does not inflate reporting source breadth with syndicated duplicates', () => {
    const rows = [
      member({
        id: 'a',
        source_system: 'newswire',
        source_slug: 'ap',
        member_role: 'reporting',
        title: 'Appeals court hears tariff authority case',
        item_observed_at: '2026-09-10T12:00:00.000Z',
        canonical_url: 'https://ap.test/tariff-1',
      }),
      member({
        id: 'b',
        source_system: 'newswire',
        source_slug: 'local-outlet',
        member_role: 'reporting',
        title: 'Appeals court hears tariff authority case',
        item_observed_at: '2026-09-10T12:05:00.000Z',
        canonical_url: 'https://local.test/tariff-syndicate',
      }),
    ];
    expect(distinctReportingSources(rows)).toBe(1);
  });

  it('does not persist lastCreatorActivityAt as a theme_daily_signals column', () => {
    const members = [
      member({
        id: 'c1',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Deployment authority',
        item_observed_at: '2026-09-10T12:00:00.000Z',
      }),
    ];
    const computed = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });
    expect(computed.lastCreatorActivityAt).toBe('2026-09-10T12:00:00.000Z');

    const persistable = toThemeDailySignalRecord(computed, {
      created_at: '2026-09-10T16:00:00.000Z',
      updated_at: '2026-09-10T16:00:00.000Z',
    });
    expect(persistable).not.toHaveProperty('lastCreatorActivityAt');
    expect(persistable.metadata.lastCreatorActivityAt).toBe('2026-09-10T12:00:00.000Z');
    expect(persistable.theme_id).toBe('theme-1');
    expect(persistable.signal_date).toBe('2026-09-10');
  });

  it('13: contextual creator does not increase creator_count, breadth, or momentum', () => {
    const members = [
      member({
        id: 'c-core',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Flock camera breach continues',
        item_observed_at: '2026-09-10T12:00:00.000Z',
        membership_reasons: ['seeded_creator_led_theme'],
        metadata: { identityClass: 'core', identityReason: 'seed' },
      }),
      member({
        id: 'c-context',
        source_system: 'voice',
        source_slug: 'other-creator',
        member_role: 'creator',
        title: 'iPhone camera review',
        item_observed_at: '2026-09-10T13:00:00.000Z',
        metadata: { identityClass: 'contextual', identityReason: 'contextual' },
      }),
    ];
    const signal = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });
    expect(signal.creator_count).toBe(1);
    expect(signal.creator_item_count).toBe(1);
    expect(signal.creator_breadth).toBe(1);
    expect(signal.creator_momentum).toBe(1);
    expect(signal.lastCreatorActivityAt).toBe('2026-09-10T12:00:00.000Z');
    expect(signal.metadata.contextualMembershipCount).toBe(1);
    expect(signal.metadata.coreMembershipCount).toBe(1);
    expect(signal.metadata.totalMembershipCount).toBe(2);
  });

  it('14: contextual newswire does not increase newswire counts or evidence_depth', () => {
    const members = [
      member({
        id: 'c-core',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Flock camera breach continues',
        item_observed_at: '2026-09-10T12:00:00.000Z',
        metadata: { identityClass: 'core', identityReason: 'seed' },
      }),
      member({
        id: 'n-context',
        source_system: 'newswire',
        source_slug: 'ap',
        member_role: 'reporting',
        title: 'Unrelated camera product review',
        item_observed_at: '2026-09-10T13:00:00.000Z',
        metadata: { identityClass: 'contextual', identityReason: 'contextual' },
      }),
    ];
    const signal = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });
    expect(signal.newswire_source_count).toBe(0);
    expect(signal.newswire_item_count).toBe(0);
    expect(signal.evidence_depth).toBe(0);
  });

  it('15: contextual primary/specialist does not increase evidence depth', () => {
    const members = [
      member({
        id: 'c-core',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Flock camera breach continues',
        item_observed_at: '2026-09-10T12:00:00.000Z',
        metadata: { identityClass: 'core', identityReason: 'seed' },
      }),
      member({
        id: 'p-context',
        source_system: 'intel',
        source_slug: 'federal-register',
        member_role: 'primary',
        title: 'Unrelated filing',
        item_observed_at: '2026-09-10T14:00:00.000Z',
        metadata: { identityClass: 'contextual', identityReason: 'contextual' },
      }),
      member({
        id: 's-context',
        source_system: 'intel',
        source_slug: 'lawfare',
        member_role: 'specialist',
        title: 'Unrelated specialist note',
        item_observed_at: '2026-09-10T15:00:00.000Z',
        metadata: { identityClass: 'contextual', identityReason: 'contextual' },
      }),
    ];
    const signal = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });
    expect(signal.primary_source_count).toBe(0);
    expect(signal.specialist_source_count).toBe(0);
    expect(signal.intel_source_count).toBe(0);
    expect(signal.evidence_depth).toBe(0);
  });

  it('16: legacy null identityClass does not inflate ranking signals', () => {
    const members = [
      member({
        id: 'c-core',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Flock camera breach continues',
        item_observed_at: '2026-09-10T12:00:00.000Z',
        membership_reasons: ['seeded_creator_led_theme'],
        metadata: { identityClass: 'core', identityReason: 'seed' },
      }),
      member({
        id: 'legacy',
        source_system: 'voice',
        source_slug: 'legacy-creator',
        member_role: 'creator',
        title: 'Legacy unclassified member',
        item_observed_at: '2026-09-10T13:00:00.000Z',
        membership_reasons: ['ai_overlap'],
        metadata: {},
      }),
      member({
        id: 'legacy-news',
        source_system: 'newswire',
        source_slug: 'ap',
        member_role: 'reporting',
        title: 'Legacy unclassified reporting',
        item_observed_at: '2026-09-10T14:00:00.000Z',
        membership_reasons: ['deterministic_accept'],
        metadata: { identityClass: null },
      }),
    ];
    const signal = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });
    expect(signal.creator_count).toBe(1);
    expect(signal.creator_breadth).toBe(1);
    expect(signal.newswire_source_count).toBe(0);
    expect(signal.evidence_depth).toBe(0);
    expect(signal.metadata.legacyUnclassifiedCount).toBe(2);
    expect(signal.metadata.rankingSignalMembershipCount).toBe(1);
  });

  it('legacy seed metadata still counts when identityClass is missing', () => {
    const members = [
      member({
        id: 'seed',
        source_system: 'voice',
        source_slug: 'pakman',
        member_role: 'creator',
        title: 'Seed episode',
        item_observed_at: '2026-09-10T12:00:00.000Z',
        membership_reasons: ['seeded_creator_led_theme'],
        metadata: {},
      }),
    ];
    const signal = computeThemeDailySignal({
      themeId: 'theme-1',
      signalDate: '2026-09-10',
      memberships: members,
      nowIso: '2026-09-10T16:00:00.000Z',
    });
    expect(signal.creator_count).toBe(1);
    expect(signal.creator_item_count).toBe(1);
  });
});
