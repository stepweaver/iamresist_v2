import { describe, expect, it } from 'vitest';

import { buildStoryPresentationModel } from '@/components/intel/storyPresentation';

function makeRow(id: string, partial: Record<string, any> = {}) {
  return {
    id,
    title: partial.title ?? id,
    sourceSlug: partial.sourceSlug ?? `${id}-source`,
    sourceName: partial.sourceName ?? `${id} source`,
    provenanceClass: partial.provenanceClass ?? 'SPECIALIST',
    canonicalUrl: partial.canonicalUrl ?? `https://example.com/${id}`,
    publishedAt: partial.publishedAt ?? '2026-04-19T12:00:00.000Z',
    summary: partial.summary ?? `${id} summary`,
    displayBucket: partial.displayBucket ?? 'lead',
    missionTags: partial.missionTags ?? ['democracy'],
    displayExplanations: partial.displayExplanations ?? [],
    relevanceExplanations: partial.relevanceExplanations ?? [],
    ...partial,
  };
}

function makeStoryCluster(partial: Record<string, any> = {}) {
  return {
    storyId: partial.storyId ?? 'story:1',
    representativeId: partial.representativeId ?? 'rep',
    itemIds: partial.itemIds ?? ['rep'],
    reportingItems: partial.reportingItems ?? [],
    analysisItems: partial.analysisItems ?? [],
    opinionItems: partial.opinionItems ?? [],
    creatorSignalItems: partial.creatorSignalItems ?? [],
    duplicateItems: partial.duplicateItems ?? [],
    creatorSignalNote: partial.creatorSignalNote ?? null,
    ...partial,
  };
}

describe('buildStoryPresentationModel', () => {
  it('collapses visible companions under one representative story entry', () => {
    const representative = makeRow('rep');
    const analysis = makeRow('analysis', { title: 'Analysis row' });
    const reporting = makeRow('reporting', { title: 'Reporting row' });

    const model = buildStoryPresentationModel({
      items: [representative, analysis, reporting],
      storyClusters: {
        items: [
          makeStoryCluster({
            representativeId: 'rep',
            itemIds: ['rep', 'analysis', 'reporting'],
            analysisItems: [{ id: 'analysis' }],
            reportingItems: [{ id: 'reporting' }],
          }),
        ],
      },
    });
    const entry: any = model.items[0];

    expect(model.items).toHaveLength(1);
    expect(entry).toMatchObject({
      kind: 'story',
      row: { id: 'rep' },
      relatedVisibleCounts: {
        total: 2,
        analysis: 1,
        reporting: 1,
        opinion: 0,
        creatorSignal: 0,
      },
    });
    expect(entry.relatedSections.analysis.map((row: any) => row.id)).toEqual(['analysis']);
    expect(entry.relatedSections.reporting.map((row: any) => row.id)).toEqual(['reporting']);
  });

  it('falls back to a standalone row when the representative is not visible after filtering', () => {
    const companion = makeRow('analysis');

    const model = buildStoryPresentationModel({
      items: [companion],
      storyClusters: {
        items: [
          makeStoryCluster({
            representativeId: 'rep',
            itemIds: ['rep', 'analysis'],
            analysisItems: [{ id: 'analysis' }],
          }),
        ],
      },
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind: 'item',
      row: { id: 'analysis' },
      story: null,
    });
  });

  it('leaves singleton rows unchanged', () => {
    const row = makeRow('solo');

    const model = buildStoryPresentationModel({
      items: [row],
      storyClusters: { items: [] },
    });

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      kind: 'item',
      row: { id: 'solo' },
      story: null,
    });
  });

  it('exposes grouped duplicate counts on representative story entries', () => {
    const representative = makeRow('rep');

    const model = buildStoryPresentationModel({
      items: [representative],
      duplicateItems: [makeRow('dup-1'), makeRow('dup-2')],
      storyClusters: {
        items: [
          makeStoryCluster({
            representativeId: 'rep',
            itemIds: ['rep', 'dup-1', 'dup-2'],
            duplicateItems: [{ id: 'dup-1' }, { id: 'dup-2' }],
          }),
        ],
      },
    });
    const entry: any = model.items[0];

    expect(entry).toMatchObject({
      kind: 'story',
      groupedDuplicateCount: 2,
    });
  });

  it('exposes why-this-surfaced metadata only on top-level entries', () => {
    const representative = makeRow('rep', {
      displayBucket: 'lead',
      displayExplanations: [{ ruleId: 'desk:impact', message: 'High mission fit' }],
    });
    const analysis = makeRow('analysis', {
      displayExplanations: [{ ruleId: 'desk:analysis', message: 'Analysis support' }],
    });

    const model = buildStoryPresentationModel({
      items: [representative, analysis],
      storyClusters: {
        items: [
          makeStoryCluster({
            representativeId: 'rep',
            itemIds: ['rep', 'analysis'],
            analysisItems: [{ id: 'analysis' }],
          }),
        ],
      },
    });
    const entry: any = model.items[0];

    expect(entry.hasWhyThisSurfaced).toBe(true);
    expect(entry.whyThisSurfaced).toMatchObject({
      topReason: 'High mission fit',
      displayBucket: 'lead',
    });
    expect(entry.relatedSections.analysis[0]).not.toHaveProperty('whyThisSurfaced');
    expect(entry.relatedSections.analysis[0]).not.toHaveProperty('hasWhyThisSurfaced');
  });
});
