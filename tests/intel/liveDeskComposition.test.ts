import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => fn,
}));

vi.mock('@/lib/feeds/ogImage.js', () => ({
  fetchOgImageUncached: async () => null,
}));

const OSINT_SURFACED_FIXTURE = [
  // Two White House ceremonial items (should be demoted by display priority)
  {
    id: '1',
    title: 'A Proclamation on National Something Day',
    summary: null,
    canonical_url: 'https://example.com/p1',
    image_url: null,
    published_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    desk_lane: 'osint',
    content_use_mode: 'feed_summary',
    cluster_keys: { proclamation: '123' },
    state_change_type: 'presidential_action',
    mission_tags: ['executive_power'],
    branch_of_government: 'executive',
    institutional_area: 'white_house',
    relevance_score: 70,
    surface_state: 'surfaced',
    suppression_reason: null,
    relevance_explanations: [],
    sources: { slug: 'wh-presidential', name: 'WH', provenance_class: 'PRIMARY' },
  },
  {
    id: '2',
    title: 'A Proclamation on National Another Day',
    summary: null,
    canonical_url: 'https://example.com/p2',
    image_url: null,
    published_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    desk_lane: 'osint',
    content_use_mode: 'feed_summary',
    cluster_keys: { proclamation: '124' },
    state_change_type: 'presidential_action',
    mission_tags: ['executive_power'],
    branch_of_government: 'executive',
    institutional_area: 'white_house',
    relevance_score: 68,
    surface_state: 'surfaced',
    suppression_reason: null,
    relevance_explanations: [],
    sources: { slug: 'wh-presidential', name: 'WH', provenance_class: 'PRIMARY' },
  },
  // High-impact specialist item (should win a lead slot)
  {
    id: '3',
    title: 'Court grants preliminary injunction in voting rights case',
    summary: null,
    canonical_url: 'https://example.com/court',
    image_url: null,
    published_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    desk_lane: 'osint',
    content_use_mode: 'feed_summary',
    cluster_keys: {},
    state_change_type: 'specialist_item',
    mission_tags: ['courts', 'voting_rights'],
    branch_of_government: 'judicial',
    institutional_area: 'courts',
    relevance_score: 55,
    surface_state: 'surfaced',
    suppression_reason: null,
    relevance_explanations: [],
    sources: { slug: 'scotusblog', name: 'SCOTUSblog', provenance_class: 'SPECIALIST' },
  },
];

const { fetchSurfacedSourceItemsForLive, fetchIntelFreshnessForDeskLane } = vi.hoisted(() => ({
  fetchSurfacedSourceItemsForLive: vi.fn(
    async (limit: number, lane: string) =>
      lane === 'osint'
        ? OSINT_SURFACED_FIXTURE
        : [
            {
              id: `${lane}-1`,
              title: `${lane} item`,
              summary: null,
              canonical_url: `https://example.com/${lane}`,
              image_url: null,
              published_at: new Date().toISOString(),
              fetched_at: new Date().toISOString(),
              desk_lane: 'osint',
              content_use_mode: 'feed_summary',
              cluster_keys: {},
              state_change_type: 'specialist_item',
              mission_tags: [],
              branch_of_government: 'unknown',
              institutional_area: 'specialist',
              relevance_score: 50,
              surface_state: 'surfaced',
              suppression_reason: null,
              relevance_explanations: [],
              sources: {
                slug: `${lane}-source`,
                name: `${lane} source`,
                provenance_class: 'SPECIALIST',
                desk_lane: lane,
                source_family: 'general',
              },
            },
          ],
  ),
  fetchIntelFreshnessForDeskLane: vi.fn(async () => ({
    latestFetchedAt: null,
    latestSuccessfulIngestAt: null,
  })),
}));

vi.mock('@/lib/intel/db', () => ({
  intelDbConfigured: () => true,
  fetchIntelFreshnessForDeskLane,
  saveLiveDeskSnapshot: async () => {},
  loadLiveDeskSnapshot: async () => null,
  fetchDownrankedSourceItemsForLive: async () => [],
  fetchSuppressedSourceItemsForLive: async () => [],
  fetchSurfacedSourceItemsForLive,
}));

describe('live desk composition (Milestone 2)', () => {
  beforeEach(() => {
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
  });

  it('does not let ceremonial proclamations dominate the lead block', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    const desk = await getLiveIntelDesk('osint');

    expect(Array.isArray(desk.leadItems)).toBe(true);
    expect(Array.isArray(desk.secondaryLeadItems)).toBe(true);

    const top = [...(desk.leadItems ?? []), ...(desk.secondaryLeadItems ?? [])];
    expect(top.length).toBeGreaterThan(0);

    // The court item should appear in the lead block.
    expect(top.some((x) => x.id === '3')).toBe(true);

    // And the lead block should not be entirely ceremonial WH proclamations.
    const whCeremonialCount = top.filter((x) => x.sourceSlug === 'wh-presidential').length;
    expect(whCeremonialCount).toBeLessThan(top.length);
  });
});

describe('live desk lane routing', () => {
  beforeEach(() => {
    fetchSurfacedSourceItemsForLive.mockClear();
    fetchIntelFreshnessForDeskLane.mockClear();
  });

  it('preserves watchdogs lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('watchdogs');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'watchdogs');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('watchdogs');
  });

  it('preserves defense_ops lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('defense_ops');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'defense_ops');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('defense_ops');
  });

  it('preserves indicators lane', async () => {
    const { getLiveIntelDesk } = await import('@/lib/feeds/liveIntel.service');
    await getLiveIntelDesk('indicators');
    expect(fetchSurfacedSourceItemsForLive).toHaveBeenCalledWith(expect.any(Number), 'indicators');
    expect(fetchIntelFreshnessForDeskLane).toHaveBeenCalledWith('indicators');
  });
});
