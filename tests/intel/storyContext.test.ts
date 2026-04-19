import { describe, expect, it } from 'vitest';

import { assembleStoryClusters } from '@/lib/intel/storyContext';

function makeItem(partial: Record<string, any> = {}) {
  return {
    id: partial.id ?? 'item-1',
    title: partial.title ?? 'Test item',
    summary: partial.summary ?? null,
    canonicalUrl: partial.canonicalUrl ?? `https://example.com/${partial.id ?? 'item-1'}`,
    sourceSlug: partial.sourceSlug ?? `${partial.id ?? 'item-1'}-source`,
    sourceName: partial.sourceName ?? 'Source',
    provenanceClass: partial.provenanceClass ?? 'SPECIALIST',
    deskLane: partial.deskLane ?? 'osint',
    publishedAt: partial.publishedAt ?? '2026-04-19T12:00:00.000Z',
    surfaceState: partial.surfaceState ?? 'surfaced',
    isDuplicateLoser: partial.isDuplicateLoser ?? false,
    displayPriority: partial.displayPriority ?? 60,
    displayBucket: partial.displayBucket ?? 'secondary',
    clusterKeys: partial.clusterKeys ?? {},
    whyItMatters: partial.whyItMatters ?? 'Why it matters',
    stateChangeType: partial.stateChangeType ?? 'specialist_item',
    missionTags: partial.missionTags ?? ['executive_power'],
    trustWarningMode: partial.trustWarningMode ?? 'none',
    institutionalArea: partial.institutionalArea ?? 'specialist',
    creatorCorroboration: partial.creatorCorroboration ?? null,
  };
}

describe('assembleStoryClusters', () => {
  it('builds one deterministic keyed story, keeps desk-order representative, and isolates duplicate losers', () => {
    const first = makeItem({
      id: 'bill-main',
      title: 'House files oversight bill',
      clusterKeys: { bill: '118-hr-100' },
      displayPriority: 55,
    });
    const second = makeItem({
      id: 'bill-corroborating',
      title: 'Senate watchers track same oversight bill',
      clusterKeys: { bill: '118-hr-100' },
      displayPriority: 90,
      sourceSlug: 'wire-source',
      provenanceClass: 'WIRE',
    });
    const duplicate = makeItem({
      id: 'bill-duplicate',
      title: 'Duplicate headline on same bill',
      clusterKeys: { bill: '118-hr-100' },
      isDuplicateLoser: true,
      sourceSlug: 'dup-source',
    });

    const storyClusters = assembleStoryClusters({
      orderedItems: [first, second],
      visibleItems: [first],
      duplicateItems: [duplicate],
    });

    expect(storyClusters.counts).toEqual({ total: 1, multiItem: 1, singleton: 0 });
    expect(storyClusters.items[0]).toMatchObject({
      groupingKind: 'cluster_key',
      representativeId: 'bill-main',
      itemIds: ['bill-main', 'bill-corroborating', 'bill-duplicate'],
      visibleItemIds: ['bill-main'],
      duplicateItemIds: ['bill-duplicate'],
      counts: {
        total: 3,
        corroborating: 1,
        commentary: 0,
        duplicates: 1,
      },
      primaryItem: { id: 'bill-main' },
      corroboratingItems: [{ id: 'bill-corroborating' }],
      duplicateItems: [{ id: 'bill-duplicate' }],
    });
  });

  it('creates a singleton story when no supported cluster key exists', () => {
    const singleton = makeItem({
      id: 'topic-only',
      clusterKeys: { topic: 'not-supported-for-segment-1' },
    });

    const storyClusters = assembleStoryClusters({
      orderedItems: [singleton],
      visibleItems: [singleton],
      duplicateItems: [],
    });

    expect(storyClusters.counts).toEqual({ total: 1, multiItem: 0, singleton: 1 });
    expect(storyClusters.items[0]).toMatchObject({
      groupingKind: 'singleton',
      clusterKey: null,
      representativeId: 'topic-only',
      counts: {
        total: 1,
        corroborating: 0,
        commentary: 0,
        duplicates: 0,
      },
    });
  });

  it('separates commentary from corroborating reporting inside the same keyed story', () => {
    const reporting = makeItem({
      id: 'eo-reporting',
      title: 'Executive order faces implementation scrutiny',
      clusterKeys: { executive_order: '14100' },
    });
    const commentary = makeItem({
      id: 'eo-commentary',
      title: 'Commentary on the same executive order',
      clusterKeys: { executive_order: '14100' },
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      sourceSlug: 'voice-source',
    });

    const storyClusters = assembleStoryClusters({
      orderedItems: [reporting, commentary],
      visibleItems: [reporting, commentary],
      duplicateItems: [],
    });

    expect(storyClusters.items[0]).toMatchObject({
      counts: {
        total: 2,
        corroborating: 0,
        commentary: 1,
        duplicates: 0,
      },
      primaryItem: { id: 'eo-reporting' },
      commentaryItems: [{ id: 'eo-commentary' }],
      corroboratingItems: [],
    });
  });

  it('attaches creator corroboration as metadata only without merging unrelated items', () => {
    const withCreatorSignal = makeItem({
      id: 'fr-story',
      title: 'Federal Register filing on surveillance rule',
      clusterKeys: { fr_document_number: '2026-9999' },
      creatorCorroboration: {
        applied: true,
        boost: 3,
        clusterId: 'creator_bridge_1_fr-story',
        representativeId: 'fr-story',
        reasons: ['trusted_creator_convergence'],
      },
    });
    const unrelatedCreatorNote = makeItem({
      id: 'other-topic',
      title: 'Unrelated creator-supported topic item',
      clusterKeys: { topic: 'unsupported-creator-topic' },
      creatorCorroboration: {
        applied: true,
        boost: 2,
        clusterId: 'creator_bridge_2_other-topic',
        representativeId: 'other-topic',
        reasons: ['creator_support_noted'],
      },
    });

    const storyClusters = assembleStoryClusters({
      orderedItems: [withCreatorSignal, unrelatedCreatorNote],
      visibleItems: [withCreatorSignal, unrelatedCreatorNote],
      duplicateItems: [],
    });

    expect(storyClusters.counts).toEqual({ total: 2, multiItem: 0, singleton: 2 });
    expect(storyClusters.items[0].creatorSignalNote).toMatchObject({
      itemCount: 1,
      appliedCount: 1,
      maxBoost: 3,
      reasons: ['trusted_creator_convergence'],
    });
    expect(storyClusters.items[1]).toMatchObject({
      groupingKind: 'singleton',
      representativeId: 'other-topic',
      counts: { total: 1, corroborating: 0, commentary: 0, duplicates: 0 },
    });
  });
});
