import { describe, expect, it, vi } from 'vitest';

const { getLiveIntelDeskUncached } = vi.hoisted(() => ({
  getLiveIntelDeskUncached: vi.fn(async () => ({
    configured: true,
    liveReadOk: true,
    items: [],
    leadItems: [],
    secondaryLeadItems: [],
    suppressedItems: [],
    duplicateItems: [],
    metadataOnlyItems: [],
    storyClusters: { counts: { total: 0, multiItem: 0, singleton: 0 }, items: [] },
    accountabilityHighlights: [],
    freshness: null,
    freshnessMeta: null,
    deskLane: 'osint',
  })),
}));

vi.mock('@/lib/feeds/liveIntel.service', () => ({
  getLiveIntelDeskUncached,
}));

describe('Intel OSINT page', () => {
  it('renders from the uncached desk getter to avoid oversized unstable_cache payloads', async () => {
    const { OsintContent } = await import('@/app/intel/osint/page');

    await OsintContent();

    expect(getLiveIntelDeskUncached).toHaveBeenCalledTimes(1);
    expect(getLiveIntelDeskUncached).toHaveBeenCalledWith();
  });
});
