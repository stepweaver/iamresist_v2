const HIDDEN_REASON_RULE_IDS = new Set([
  'source:baseline',
  'score:default_priority',
  'fr:fr_type',
  'desk:duplicate_cluster',
]);

const EMPTY_RELATED_COUNTS = Object.freeze({
  total: 0,
  reporting: 0,
  analysis: 0,
  opinion: 0,
  creatorSignal: 0,
});

function firstHumanReason(row) {
  if (!row || typeof row !== 'object') return null;

  const display = Array.isArray(row?.displayExplanations) ? row.displayExplanations : [];
  const relevance = Array.isArray(row?.relevanceExplanations) ? row.relevanceExplanations : [];

  const messages = [...display, ...relevance]
    .filter((entry) => entry?.message && !HIDDEN_REASON_RULE_IDS.has(entry.ruleId))
    .map((entry) => entry.message.trim())
    .filter(Boolean);

  return [...new Set(messages)][0] || null;
}

function buildWhyThisSurfaced(row) {
  const topReason = firstHumanReason(row);
  const displayBucket =
    typeof row?.displayBucket === 'string' && row.displayBucket && row.displayBucket !== 'routine'
      ? row.displayBucket
      : null;
  const missionTags = Array.isArray(row?.missionTags)
    ? row.missionTags.filter((tag) => typeof tag === 'string' && tag).slice(0, 3)
    : [];

  return {
    topReason,
    displayBucket,
    missionTags,
    hasAny: Boolean(topReason || displayBucket || missionTags.length > 0),
  };
}

function emptySections() {
  return {
    reporting: [],
    analysis: [],
    opinion: [],
    creatorSignal: [],
  };
}

function toRelatedRows(items, rowById, visibleIds, orderIndexById) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((item) => rowById.get(item.id))
    .filter((row) => row && visibleIds.has(row.id))
    .sort(
      (a, b) =>
        (orderIndexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndexById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

/**
 * Build a story-aware display model from the currently visible desk slices.
 * Companion items only collapse when their representative is visible in this same view.
 *
 * @param {{
 *   leadItems?: any[],
 *   secondaryLeadItems?: any[],
 *   items?: any[],
 *   duplicateItems?: any[],
 *   storyClusters?: { items?: any[] } | null,
 * }} input
 */
export function buildStoryPresentationModel(input = {}) {
  const leadItems = Array.isArray(input.leadItems) ? input.leadItems : [];
  const secondaryLeadItems = Array.isArray(input.secondaryLeadItems) ? input.secondaryLeadItems : [];
  const items = Array.isArray(input.items) ? input.items : [];
  const duplicateItems = Array.isArray(input.duplicateItems) ? input.duplicateItems : [];
  const storyClusters = Array.isArray(input.storyClusters?.items) ? input.storyClusters.items : [];

  const orderedVisibleRows = [
    ...leadItems.map((row) => ({ slice: 'leadItems', row })),
    ...secondaryLeadItems.map((row) => ({ slice: 'secondaryLeadItems', row })),
    ...items.map((row) => ({ slice: 'items', row })),
  ].filter(({ row }) => row?.id);

  const visibleIds = new Set(orderedVisibleRows.map(({ row }) => row?.id).filter(Boolean));
  const duplicateIds = new Set(duplicateItems.map((row) => row?.id).filter(Boolean));
  const rowById = new Map(orderedVisibleRows.map(({ row }) => [row.id, row]));
  const orderIndexById = new Map(orderedVisibleRows.map(({ row }, index) => [row.id, index]));

  const clusterByItemId = new Map();

  for (const cluster of storyClusters) {
    if (!cluster?.storyId) continue;
    const itemIds = Array.isArray(cluster.itemIds) ? cluster.itemIds : [];
    for (const itemId of itemIds) {
      if (typeof itemId === 'string' && itemId && !clusterByItemId.has(itemId)) {
        clusterByItemId.set(itemId, cluster);
      }
    }
  }

  const topLevelBySlice = {
    leadItems: [],
    secondaryLeadItems: [],
    items: [],
  };

  for (const { slice, row } of orderedVisibleRows) {
    const cluster = clusterByItemId.get(row.id);
    const representativeVisible =
      Boolean(cluster?.representativeId) && visibleIds.has(cluster.representativeId);

    // If source filtering removes the representative, keep the remaining visible companion
    // as a normal standalone row instead of collapsing it away.
    if (cluster && row.id !== cluster.representativeId && representativeVisible) {
      continue;
    }

    const whyThisSurfaced = buildWhyThisSurfaced(row);

    if (!cluster || row.id !== cluster.representativeId) {
      topLevelBySlice[slice].push({
        kind: 'item',
        row,
        story: null,
        relatedSections: emptySections(),
        relatedVisibleCounts: EMPTY_RELATED_COUNTS,
        groupedDuplicateCount: 0,
        hasWhyThisSurfaced: whyThisSurfaced.hasAny,
        whyThisSurfaced,
      });
      continue;
    }

    const relatedSections = {
      reporting: toRelatedRows(cluster.reportingItems, rowById, visibleIds, orderIndexById),
      analysis: toRelatedRows(cluster.analysisItems, rowById, visibleIds, orderIndexById),
      opinion: toRelatedRows(cluster.opinionItems, rowById, visibleIds, orderIndexById),
      creatorSignal: toRelatedRows(
        cluster.creatorSignalItems,
        rowById,
        visibleIds,
        orderIndexById,
      ),
    };

    const relatedVisibleCounts = {
      reporting: relatedSections.reporting.length,
      analysis: relatedSections.analysis.length,
      opinion: relatedSections.opinion.length,
      creatorSignal: relatedSections.creatorSignal.length,
    };
    relatedVisibleCounts.total =
      relatedVisibleCounts.reporting +
      relatedVisibleCounts.analysis +
      relatedVisibleCounts.opinion +
      relatedVisibleCounts.creatorSignal;

    const groupedDuplicateCount = Array.isArray(cluster.duplicateItems)
      ? cluster.duplicateItems.filter((item) => duplicateIds.has(item.id)).length
      : 0;

    const hasStoryContext =
      relatedVisibleCounts.total > 0 || groupedDuplicateCount > 0 || Boolean(cluster.creatorSignalNote);

    topLevelBySlice[slice].push({
      kind: hasStoryContext ? 'story' : 'item',
      row,
      story: hasStoryContext ? cluster : null,
      relatedSections: hasStoryContext ? relatedSections : emptySections(),
      relatedVisibleCounts: hasStoryContext ? relatedVisibleCounts : EMPTY_RELATED_COUNTS,
      groupedDuplicateCount: hasStoryContext ? groupedDuplicateCount : 0,
      hasWhyThisSurfaced: whyThisSurfaced.hasAny,
      whyThisSurfaced,
    });
  }

  return topLevelBySlice;
}
