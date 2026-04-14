import { describe, expect, it } from 'vitest';
import { buildSourceOptionsFromDesk, filterDeskBySourceSlug } from '@/components/intel/useFilteredDeskItems';

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
});
