import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const { getLiveIntelDesk } = vi.hoisted(() => ({
  getLiveIntelDesk: vi.fn(async () => ({
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
    deskLane: 'osint',
  })),
}));

vi.mock('@/lib/feeds/liveIntel.service', () => ({
  getLiveIntelDesk,
}));

vi.mock('@/components/intel/LiveDeskSection', () => ({
  default: ({ desk, laneWarningSlot }: any) =>
    React.createElement(
      'section',
      { 'data-testid': 'live-desk-section', desk, laneWarningSlot },
      `desk:${desk?.deskLane ?? 'unknown'} items:${Array.isArray(desk?.items) ? desk.items.length : 0}`,
    ),
}));

async function renderOsintContentFromPageTree() {
  const { default: IntelOsintPage } = await import('@/app/intel/osint/page');
  const page = IntelOsintPage() as any;
  const mainChildren = React.Children.toArray(page.props.children);
  const contentWrapper = mainChildren[0] as any;
  const wrapperChildren = React.Children.toArray(contentWrapper.props.children);
  const suspenseElement = wrapperChildren[1] as any;
  const osintContentElement = suspenseElement.props.children as any;
  return osintContentElement.type();
}

describe('Intel OSINT page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders from the cached osint desk getter on the public route', async () => {
    const element = await renderOsintContentFromPageTree();

    expect(getLiveIntelDesk).toHaveBeenCalledTimes(1);
    expect(getLiveIntelDesk).toHaveBeenCalledWith('osint');
    expect(element.props.desk).toMatchObject({
      deskLane: 'osint',
      items: [{ id: 'visible-1', title: 'Visible item' }],
    });
  });

  it('preserves the live desk payload shape expected by the page component tree', async () => {
    const element = await renderOsintContentFromPageTree();

    expect(element.props).toEqual(
      expect.objectContaining({
        desk: expect.objectContaining({
          configured: true,
          liveReadOk: true,
          deskLane: 'osint',
          items: expect.any(Array),
          leadItems: expect.any(Array),
          secondaryLeadItems: expect.any(Array),
          suppressedItems: expect.any(Array),
          duplicateItems: expect.any(Array),
          metadataOnlyItems: expect.any(Array),
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
