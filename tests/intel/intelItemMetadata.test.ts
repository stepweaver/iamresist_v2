import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('intel item permalink metadata', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('emits canonical metadata for the internal permalink route', async () => {
    vi.doMock('@/lib/intel/db', () => ({
      fetchSourceItemById: vi.fn(async () => ({
        id: 'item-xyz',
        title: 'Intel item title',
        summary: 'Summary text',
        canonical_url: 'https://source.example/a',
        published_at: '2026-04-20T00:00:00.000Z',
        fetched_at: '2026-04-20T01:00:00.000Z',
        desk_lane: 'osint',
        content_use_mode: 'feed_summary',
        cluster_keys: {},
        state_change_type: 'specialist_item',
        mission_tags: [],
        branch_of_government: 'unknown',
        institutional_area: 'unknown',
        relevance_score: 60,
        surface_state: 'surfaced',
        suppression_reason: null,
        relevance_explanations: [],
        indicator_class: null,
        sources: {
          slug: 'source-a',
          name: 'Source A',
          provenance_class: 'SPECIALIST',
          desk_lane: 'osint',
          source_family: 'general',
          trust_warning_mode: 'none',
          trust_warning_level: 'info',
          requires_independent_verification: false,
          hero_eligibility_mode: 'normal',
          trust_warning_text: null,
        },
      })),
    }));

    const { generateMetadata } = await import('@/app/intel/item/[id]/page');
    const meta: any = await generateMetadata({ params: Promise.resolve({ id: 'item-xyz' }) } as any);

    expect(meta?.alternates?.canonical).toBe('/intel/item/item-xyz');
    expect(meta?.openGraph?.url).toContain('/intel/item/item-xyz');
    expect(meta?.title).toContain('Intel');
    expect(typeof meta?.description).toBe('string');
  });
});

