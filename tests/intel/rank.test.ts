import { describe, expect, it } from 'vitest';
import { applyDuplicateClusterOverlay, compareDeskItems, type LiveDeskItem } from '@/lib/intel/rank';

function deskItem(overrides: Partial<LiveDeskItem> = {}): LiveDeskItem {
  return {
    id: 'item-a',
    title: 'Court filing update',
    summary: 'A new development in the case',
    canonicalUrl: 'https://example.test/item-a',
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    fetchedAt: new Date().toISOString(),
    provenanceClass: 'PRIMARY',
    sourceName: 'Example',
    sourceSlug: 'example-primary',
    stateChangeType: 'published_document',
    clusterKeys: {},
    relevanceScore: 62,
    surfaceState: 'surfaced',
    suppressionReason: null,
    missionTags: ['courts'],
    branchOfGovernment: 'judicial',
    institutionalArea: 'courts',
    relevanceExplanations: [],
    isDuplicateLoser: false,
    displayPriority: 62,
    ...overrides,
  };
}

describe('compareDeskItems', () => {
  it('keeps provenance-first ordering outside the recent window', () => {
    const primary = deskItem({
      id: 'primary',
      publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      provenanceClass: 'PRIMARY',
      displayPriority: 62,
      relevanceScore: 62,
    });
    const freshWire = deskItem({
      id: 'wire',
      sourceSlug: 'wire',
      publishedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      provenanceClass: 'WIRE',
      displayPriority: 62,
      relevanceScore: 62,
    });

    expect(compareDeskItems(primary, freshWire)).toBeLessThan(0);
  });

  it('lets a fresher item win a close recent-window desk comparison', () => {
    const olderPrimary = deskItem({
      id: 'primary',
      publishedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
      provenanceClass: 'PRIMARY',
      displayPriority: 64,
      relevanceScore: 64,
    });
    const fresherWire = deskItem({
      id: 'wire',
      sourceSlug: 'wire',
      publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      provenanceClass: 'WIRE',
      displayPriority: 62,
      relevanceScore: 62,
    });

    expect(compareDeskItems(olderPrimary, fresherWire)).toBeGreaterThan(0);
  });

  it('does not let commentary leapfrog stronger reporting in close recent-window calls', () => {
    const specialist = deskItem({
      id: 'specialist',
      provenanceClass: 'SPECIALIST',
      sourceSlug: 'specialist',
      publishedAt: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
      displayPriority: 63,
      relevanceScore: 63,
    });
    const commentary = deskItem({
      id: 'commentary',
      provenanceClass: 'COMMENTARY',
      sourceSlug: 'commentary',
      stateChangeType: 'commentary_item',
      publishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      displayPriority: 62,
      relevanceScore: 62,
    });

    expect(compareDeskItems(specialist, commentary)).toBeLessThan(0);
  });
});

describe('applyDuplicateClusterOverlay', () => {
  it('can keep the fresher item as duplicate-cluster winner in a close recent-window case', () => {
    const olderPrimary = deskItem({
      id: 'primary',
      title: 'Court filing posted',
      sourceSlug: 'court-primary',
      provenanceClass: 'PRIMARY',
      publishedAt: new Date(Date.now() - 105 * 60 * 1000).toISOString(),
      relevanceScore: 64,
      clusterKeys: { docket: '123' },
    });
    const fresherWire = deskItem({
      id: 'wire',
      title: 'Wire confirms the filing',
      sourceSlug: 'ap-wire',
      provenanceClass: 'WIRE',
      publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      relevanceScore: 62,
      clusterKeys: { docket: '123' },
    });

    const result = applyDuplicateClusterOverlay([olderPrimary, fresherWire]);
    const primary = result.find((item) => item.id === 'primary');
    const wire = result.find((item) => item.id === 'wire');

    expect(primary?.isDuplicateLoser).toBe(true);
    expect(wire?.isDuplicateLoser).toBe(false);
    expect(primary?.relevanceExplanations.at(-1)?.ruleId).toBe('desk:duplicate_cluster');
    expect(primary?.relevanceExplanations.at(-1)?.message).toMatch(/fresher recent-window line/i);
    expect(primary?.relevanceExplanations.at(-1)?.message).toMatch(/both <=6h old/i);
  });
});
