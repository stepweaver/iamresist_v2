import { describe, expect, it } from 'vitest';
import { getThemeAttentionForItem, getThemeAttentionForItems } from '@/lib/themeMemory/readModel';
import { createMemoryThemeStore, themeItemKey, type ThemeStore } from '@/lib/themeMemory/store';
import type {
  ThemeDailySignalRecord,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';

function theme(over: Partial<ThemeRecord> = {}): ThemeRecord {
  return {
    id: 'theme-1',
    slug: 'federal-deployment-theme-1',
    canonical_label: 'federal deployment authority',
    display_headline: 'Federal deployment authority dispute',
    summary: 'Creators tracking troop-deployment authority.',
    first_seen_at: '2026-09-08T00:00:00.000Z',
    last_seen_at: '2026-09-15T00:00:00.000Z',
    lifecycle_status: 'persistent',
    metadata: { creatorSeedStrength: 'converged' },
    created_at: '2026-09-08T00:00:00.000Z',
    updated_at: '2026-09-15T00:00:00.000Z',
    ...over,
  };
}

function membership(over: Partial<ThemeMembershipRecord> = {}): ThemeMembershipRecord {
  return {
    id: 'mem-1',
    theme_id: 'theme-1',
    source_system: 'intel',
    source_slug: 'lawfare',
    source_name: 'Lawfare',
    identity_key: 'url:https://lawfare.test/deployment',
    canonical_url: 'https://lawfare.test/deployment',
    title: 'Court reviews federal deployment authority',
    summary: 'Filing',
    published_at: '2026-09-14T00:00:00.000Z',
    item_observed_at: '2026-09-14T00:00:00.000Z',
    member_role: 'specialist',
    membership_confidence: 0.9,
    membership_method: 'deterministic',
    membership_reasons: ['deterministic_accept'],
    content_hash: 'hash-1',
    classification_version: 'tm-classify-v1',
    membership_prompt_version: null,
    provenance_class: 'SPECIALIST',
    desk_lane: 'osint',
    source_family: 'general',
    first_assigned_at: '2026-09-14T00:00:00.000Z',
    last_confirmed_at: '2026-09-14T00:00:00.000Z',
    metadata: {},
    created_at: '2026-09-14T00:00:00.000Z',
    updated_at: '2026-09-14T00:00:00.000Z',
    ...over,
  };
}

function signal(over: Partial<ThemeDailySignalRecord> = {}): ThemeDailySignalRecord {
  return {
    theme_id: 'theme-1',
    signal_date: '2026-09-15',
    creator_count: 2,
    creator_item_count: 2,
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
    created_at: '2026-09-15T00:00:00.000Z',
    updated_at: '2026-09-15T00:00:00.000Z',
    ...over,
  };
}

function countingStore(inner: ThemeStore) {
  const counts = {
    getMembershipByItem: 0,
    getMembershipsByItems: 0,
    listThemesByIds: 0,
    listSignalsByThemeIds: 0,
    listMemberships: 0,
  };
  const wrapped: ThemeStore = {
    ...inner,
    async getMembershipByItem(input) {
      counts.getMembershipByItem += 1;
      return inner.getMembershipByItem(input);
    },
    async getMembershipsByItems(items) {
      counts.getMembershipsByItems += 1;
      return inner.getMembershipsByItems(items);
    },
    async listThemesByIds(ids) {
      counts.listThemesByIds += 1;
      return inner.listThemesByIds(ids);
    },
    async listSignalsByThemeIds(ids) {
      counts.listSignalsByThemeIds += 1;
      return inner.listSignalsByThemeIds(ids);
    },
    async listMemberships(themeIds) {
      counts.listMemberships += 1;
      return inner.listMemberships(themeIds);
    },
  };
  return { store: wrapped, counts };
}

describe('getThemeAttentionForItems', () => {
  it('batch-loads persisted membership without per-item getMembershipByItem', async () => {
    const inner = createMemoryThemeStore({
      themes: [theme()],
      memberships: [
        membership(),
        membership({
          id: 'mem-2',
          identity_key: 'url:https://lawfare.test/other',
          canonical_url: 'https://lawfare.test/other',
        }),
      ],
      signals: [signal()],
    });
    const { store, counts } = countingStore(inner);
    const items = [
      { sourceSystem: 'intel', sourceSlug: 'lawfare', identityKey: 'url:https://lawfare.test/deployment' },
      { sourceSystem: 'intel', sourceSlug: 'lawfare', identityKey: 'url:https://lawfare.test/other' },
      { sourceSystem: 'intel', sourceSlug: 'lawfare', identityKey: 'url:https://lawfare.test/missing' },
    ];
    const map = await getThemeAttentionForItems(store, items, { now: '2026-09-15T12:00:00.000Z' });
    expect(counts.getMembershipsByItems).toBe(1);
    expect(counts.getMembershipByItem).toBe(0);
    expect(counts.listThemesByIds).toBe(1);
    expect(counts.listSignalsByThemeIds).toBe(1);
    const hit = map.get(themeItemKey({ source_system: 'intel', source_slug: 'lawfare', identity_key: items[0]!.identityKey }));
    expect(hit?.matchedThemeId).toBe('theme-1');
    expect(hit?.lifecycle).toBe('persistent');
    expect(hit?.momentum).toBe('rising');
    expect(hit?.membershipIsNotCorroboration).toBe(true);
    expect(hit).not.toHaveProperty('rankingDelta');
    const miss = map.get(themeItemKey({ source_system: 'intel', source_slug: 'lawfare', identity_key: items[2]!.identityKey }));
    expect(miss).toBeNull();
  });

  it('getThemeAttentionForItem reuses the batch helper', async () => {
    const store = createMemoryThemeStore({
      themes: [theme()],
      memberships: [membership()],
      signals: [signal()],
    });
    const row = await getThemeAttentionForItem(store, {
      sourceSystem: 'intel',
      sourceSlug: 'lawfare',
      identityKey: 'url:https://lawfare.test/deployment',
    });
    expect(row?.creatorCount7d).toBe(3);
    expect(row?.activeDays7d).toBe(4);
    expect(row?.reasons).toContain('theme:membership_is_not_corroboration');
  });
});
