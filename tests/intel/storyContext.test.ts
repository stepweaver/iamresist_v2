import { describe, expect, it } from 'vitest';

import {
  assembleStoryClusters,
  classifyStoryEditorialRole,
  isCreatorSignalLikeItem,
  isExplicitAnalysisItem,
  isOpinionLikeItem,
} from '@/lib/intel/storyContext';

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
      roleCounts: {
        reporting: 0,
        analysis: 0,
        opinion: 1,
        creator_signal: 0,
      },
      primaryItem: { id: 'eo-reporting' },
      commentaryItems: [{ id: 'eo-commentary', editorialRole: 'opinion', editorialLabel: 'opinion' }],
      opinionItems: [{ id: 'eo-commentary' }],
      analysisItems: [],
      creatorSignalItems: [],
      reportingItems: [],
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
      label: 'creator signal',
      reasons: ['trusted_creator_convergence'],
    });
    expect(storyClusters.items[1]).toMatchObject({
      groupingKind: 'singleton',
      representativeId: 'other-topic',
      roleCounts: { reporting: 0, analysis: 0, opinion: 0, creator_signal: 0 },
      counts: { total: 1, corroborating: 0, commentary: 0, duplicates: 0 },
    });
  });

  it('classifies explicit analysis cues as analysis instead of reporting', () => {
    const item = makeItem({
      id: 'analysis-item',
      title: 'Surveillance order: What it means',
      summary: 'Analysis of the implementation implications.',
      provenanceClass: 'WIRE',
      deskLane: 'osint',
    });

    expect(isExplicitAnalysisItem(item)).toBe(true);
    expect(classifyStoryEditorialRole(item)).toBe('analysis');
  });

  it('classifies commentary without creator corroboration as opinion', () => {
    const item = makeItem({
      id: 'opinion-item',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      creatorCorroboration: null,
    });

    expect(isOpinionLikeItem(item)).toBe(true);
    expect(isCreatorSignalLikeItem(item)).toBe(false);
    expect(classifyStoryEditorialRole(item)).toBe('opinion');
  });

  it('classifies creator commentary with corroboration metadata as creator signal', () => {
    const item = makeItem({
      id: 'creator-signal-item',
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      creatorCorroboration: {
        applied: true,
        boost: 2,
        clusterId: 'creator-1',
        representativeId: 'creator-signal-item',
        reasons: ['trusted_creator_convergence'],
      },
    });

    expect(isCreatorSignalLikeItem(item)).toBe(true);
    expect(classifyStoryEditorialRole(item)).toBe('creator_signal');
  });

  it('keeps ordinary reporting as reporting without explicit analysis cues', () => {
    const item = makeItem({
      id: 'reporting-item',
      title: 'Court issues injunction in surveillance case',
      summary: 'The order was filed Monday.',
      provenanceClass: 'SPECIALIST',
      deskLane: 'watchdogs',
    });

    expect(isExplicitAnalysisItem(item)).toBe(false);
    expect(classifyStoryEditorialRole(item)).toBe('reporting');
  });

  it('keeps duplicate losers out of role buckets and role counts', () => {
    const main = makeItem({
      id: 'main-report',
      title: 'Oversight committee opens inquiry',
      clusterKeys: { bill: '118-hr-200' },
    });
    const analysis = makeItem({
      id: 'analysis-related',
      title: 'Oversight inquiry analysis',
      summary: 'Why it matters for federal agencies.',
      clusterKeys: { bill: '118-hr-200' },
      provenanceClass: 'SPECIALIST',
    });
    const duplicate = makeItem({
      id: 'duplicate-related',
      title: 'Duplicate line on the same oversight inquiry',
      clusterKeys: { bill: '118-hr-200' },
      isDuplicateLoser: true,
      provenanceClass: 'COMMENTARY',
      deskLane: 'voices',
      creatorCorroboration: {
        applied: true,
        boost: 1,
        clusterId: 'creator-dup',
        representativeId: 'main-report',
        reasons: ['creator_support_noted'],
      },
    });

    const storyClusters = assembleStoryClusters({
      orderedItems: [main, analysis],
      visibleItems: [main, analysis],
      duplicateItems: [duplicate],
    });

    expect(storyClusters.items[0]).toMatchObject({
      duplicateItems: [{ id: 'duplicate-related', editorialRole: 'creator_signal' }],
      reportingItems: [],
      analysisItems: [{ id: 'analysis-related', editorialRole: 'analysis' }],
      opinionItems: [],
      creatorSignalItems: [],
      roleCounts: {
        reporting: 0,
        analysis: 1,
        opinion: 0,
        creator_signal: 0,
      },
    });
  });
});
