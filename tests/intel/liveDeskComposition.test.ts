import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => fn,
}));

vi.mock('@/lib/feeds/ogImage.js', () => ({
  fetchOgImageUncached: async () => null,
}));

vi.mock('@/lib/intel/db', () => ({
  intelDbConfigured: () => true,
  fetchIntelFreshnessForDeskLane: async () => ({ latestFetchedAt: null, latestSuccessfulIngestAt: null }),
  saveLiveDeskSnapshot: async () => {},
  loadLiveDeskSnapshot: async () => null,
  fetchDownrankedSourceItemsForLive: async () => [],
  fetchSuppressedSourceItemsForLive: async () => [],
  fetchSurfacedSourceItemsForLive: async () => [
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
  ],
}));

describe('live desk composition (Milestone 2)', () => {
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

