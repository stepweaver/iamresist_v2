import { describe, expect, it } from 'vitest';
import { buildSourceOptionsFromDesk, filterDeskBySourceSlug } from '@/components/intel/useFilteredDeskItems';
import { buildStoryPresentationModel } from '@/components/intel/storyPresentation';

describe('filterDeskBySourceSlug', () => {
  const desk = {
    leadItems: [{ id: '1', sourceSlug: 'a', sourceName: 'A' }],
    secondaryLeadItems: [{ id: '2', sourceSlug: 'b', sourceName: 'B' }],
    items: [{ id: '3', sourceSlug: 'a', sourceName: 'A' }],
    duplicateItems: [{ id: '4', sourceSlug: 'c', sourceName: 'C' }],
    suppressedItems: [{ id: '5', sourceSlug: 'b', sourceName: 'B' }],
    metadataOnlyItems: [],
  };

  it('filters all arrays by slug', () => {
    const f = filterDeskBySourceSlug(desk, 'a');
    expect(f.leadItems.map((x: { id: string }) => x.id)).toEqual(['1']);
    expect(f.items.map((x: { id: string }) => x.id)).toEqual(['3']);
    expect(f.duplicateItems).toHaveLength(0);
    expect(f.suppressedItems).toHaveLength(0);
  });

  it('builds sorted source options', () => {
    const opts = buildSourceOptionsFromDesk(desk);
    expect(opts[0]).toEqual({ value: '', label: 'All sources' });
    expect(opts.map((o) => o.value)).toContain('a');
    expect(opts.map((o) => o.value)).toContain('b');
    expect(opts.map((o) => o.value)).toContain('c');
  });

  it('keeps a visible story companion as a standalone row when filtering hides the representative', () => {
    const rep = {
      id: 'rep',
      title: 'Representative',
      sourceSlug: 'rep-source',
      sourceName: 'Rep Source',
      provenanceClass: 'PRIMARY',
      canonicalUrl: 'https://example.com/rep',
      publishedAt: '2026-04-19T12:00:00.000Z',
      summary: 'Representative summary',
      displayBucket: 'lead',
      missionTags: ['democracy'],
      displayExplanations: [],
      relevanceExplanations: [],
    };
    const companion = {
      ...rep,
      id: 'companion',
      title: 'Companion',
      sourceSlug: 'companion-source',
      sourceName: 'Companion Source',
      canonicalUrl: 'https://example.com/companion',
    };

    const filteredDesk: any = filterDeskBySourceSlug(
      {
        leadItems: [rep],
        secondaryLeadItems: [],
        items: [companion],
        duplicateItems: [],
        suppressedItems: [],
        metadataOnlyItems: [],
        storyClusters: {
          items: [
            {
              storyId: 'story:1',
              representativeId: 'rep',
              itemIds: ['rep', 'companion'],
              analysisItems: [{ id: 'companion' }],
              reportingItems: [],
              opinionItems: [],
              creatorSignalItems: [],
              duplicateItems: [],
              creatorSignalNote: null,
            },
          ],
        },
      },
      'companion-source',
    );

    const model = buildStoryPresentationModel({
      leadItems: filteredDesk.leadItems,
      secondaryLeadItems: filteredDesk.secondaryLeadItems,
      items: filteredDesk.items,
      duplicateItems: filteredDesk.duplicateItems,
      storyClusters: filteredDesk.storyClusters,
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind: 'item',
      row: { id: 'companion', title: 'Companion' },
      story: null,
    });
  });
});
