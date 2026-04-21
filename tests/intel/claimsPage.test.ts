import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const { getPublicLiveIntelDesk } = vi.hoisted(() => ({
  getPublicLiveIntelDesk: vi.fn(async () => ({
    configured: true,
    liveReadOk: true,
    items: [{ id: 'visible-1', title: 'Visible item' }],
    leadItems: [{ id: 'lead-1', title: 'Lead item' }],
    secondaryLeadItems: [],
    suppressedItems: [],
    duplicateItems: [],
    metadataOnlyItems: [],
    storyClusters: { counts: { total: 0, multiItem: 0, singleton: 0 }, items: [] },
    accountabilityHighlights: [],
    freshness: null,
    freshnessMeta: null,
    deskLane: 'statements',
  })),
}));

vi.mock('@/lib/feeds/liveIntel.service', () => ({
  getPublicLiveIntelDesk,
}));

vi.mock('@/components/intel/LiveDeskSection', () => ({
  default: ({ desk, laneWarningSlot }: any) =>
    React.createElement(
      'section',
      { 'data-testid': 'live-desk-section', desk, laneWarningSlot },
      `desk:${desk?.deskLane ?? 'unknown'} items:${Array.isArray(desk?.items) ? desk.items.length : 0}`,
    ),
}));

async function renderClaimsContentFromPageTree() {
  const { default: IntelClaimsPage } = await import('@/app/intel/claims/page');
  const page = IntelClaimsPage() as any;
  const mainChildren = React.Children.toArray(page.props.children);
  const contentWrapper = mainChildren[0] as any;
  const wrapperChildren = React.Children.toArray(contentWrapper.props.children);
  const suspenseElement = wrapperChildren[1] as any;
  const claimsContentElement = suspenseElement.props.children as any;
  return claimsContentElement.type();
}

describe('Intel Claims page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders from the cached statements desk getter on the public claims route', async () => {
    const element = await renderClaimsContentFromPageTree();

    expect(getPublicLiveIntelDesk).toHaveBeenCalledTimes(1);
    expect(getPublicLiveIntelDesk).toHaveBeenCalledWith('statements');
    expect(element.props.desk).toMatchObject({
      deskLane: 'statements',
      items: [{ id: 'visible-1', title: 'Visible item' }],
    });
  });

  it('preserves the live desk payload shape expected by the page component tree', async () => {
    const element = await renderClaimsContentFromPageTree();

    expect(element.props).toEqual(
      expect.objectContaining({
        desk: expect.objectContaining({
          configured: true,
          liveReadOk: true,
          deskLane: 'statements',
          items: expect.any(Array),
          leadItems: expect.any(Array),
          secondaryLeadItems: expect.any(Array),
          suppressedItems: expect.any(Array),
          duplicateItems: expect.any(Array),
          metadataOnlyItems: expect.any(Array),
          freshness: null,
          freshnessMeta: null,
          storyClusters: expect.objectContaining({
            counts: expect.any(Object),
            items: expect.any(Array),
          }),
          accountabilityHighlights: expect.any(Array),
        }),
        laneWarningSlot: expect.any(Object),
      }),
    );
  });
});

