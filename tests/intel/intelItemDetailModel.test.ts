import { describe, expect, it } from 'vitest';
import { buildIntelItemDetailModel } from '@/lib/intel/itemDetail';

describe('intel item detail model', () => {
  it('maps a source_item row into a minimal detail model', () => {
    const model = buildIntelItemDetailModel({
      id: 'item-1',
      title: 'Test item title',
      summary: 'Preview text',
      canonical_url: 'https://example.com/a',
      published_at: '2026-04-20T00:00:00.000Z',
      fetched_at: '2026-04-20T01:00:00.000Z',
      desk_lane: 'osint',
      content_use_mode: 'feed_summary',
      cluster_keys: { topic: 'x' },
      state_change_type: 'specialist_item',
      mission_tags: ['courts'],
      branch_of_government: 'judicial',
      institutional_area: 'courts',
      relevance_score: 70,
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
    } as any);

    expect(model).toMatchObject({
      id: 'item-1',
      title: 'Test item title',
      canonicalUrl: 'https://example.com/a',
      sourceName: 'Source A',
      sourceSlug: 'source-a',
      provenanceClass: 'SPECIALIST',
    });
    expect(typeof model?.whyItMatters).toBe('string');
    expect(Array.isArray(model?.trustBadges)).toBe(true);
  });
});

