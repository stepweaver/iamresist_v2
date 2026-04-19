import { classifyEvent } from '@/lib/intel/eventClassification';

const SUPPORTED_CLUSTER_KEY_PRIORITY = [
  'bill',
  'fr_document_number',
  'executive_order',
  'proclamation',
] as const;

type SupportedClusterKey = (typeof SUPPORTED_CLUSTER_KEY_PRIORITY)[number];

type CreatorCorroborationLike = {
  applied?: boolean;
  boost?: number;
  clusterId?: string | null;
  representativeId?: string | null;
  reasons?: string[];
};

export type StoryContextItem = {
  id: string;
  title: string;
  summary?: string | null;
  canonicalUrl?: string | null;
  sourceSlug?: string | null;
  sourceName?: string | null;
  provenanceClass?: string | null;
  deskLane?: string | null;
  publishedAt?: string | null;
  surfaceState?: string | null;
  isDuplicateLoser?: boolean;
  displayPriority?: number | null;
  displayBucket?: string | null;
  clusterKeys?: Record<string, string> | null;
  whyItMatters?: string | null;
  stateChangeType?: string | null;
  missionTags?: string[] | null;
  trustWarningMode?: string | null;
  institutionalArea?: string | null;
  creatorCorroboration?: CreatorCorroborationLike | null;
};

export type StoryEditorialRole = 'reporting' | 'analysis' | 'opinion' | 'creator_signal';

export type StoryClusterKeyMeta = {
  key: SupportedClusterKey;
  value: string;
  compositeKey: string;
};

export type StoryClusterDebugItem = {
  id: string;
  title: string;
  sourceSlug: string | null;
  sourceName: string | null;
  provenanceClass: string | null;
  deskLane: string | null;
  publishedAt: string | null;
  surfaceState: string | null;
  isDuplicateLoser: boolean;
  displayPriority: number | null;
  displayBucket: string | null;
  canonicalUrl: string | null;
  editorialRole: StoryEditorialRole;
  editorialLabel: string;
};

export type StoryCreatorSignalNote = {
  itemCount: number;
  appliedCount: number;
  maxBoost: number;
  reasons: string[];
  clusterIds: string[];
  representativeIds: string[];
  itemIds: string[];
  label?: 'creator signal';
};

export type StoryClusterDebug = {
  storyId: string;
  groupingKind: 'cluster_key' | 'singleton';
  clusterKey: StoryClusterKeyMeta | null;
  representativeId: string;
  itemIds: string[];
  visibleItemIds: string[];
  duplicateItemIds: string[];
  counts: {
    total: number;
    corroborating: number;
    commentary: number;
    duplicates: number;
  };
  roleCounts: {
    reporting: number;
    analysis: number;
    opinion: number;
    creator_signal: number;
  };
  eventType: string | null;
  whyItMatters: string | null;
  creatorSignalNote: StoryCreatorSignalNote | null;
  primaryItem: StoryClusterDebugItem;
  corroboratingItems: StoryClusterDebugItem[];
  commentaryItems: StoryClusterDebugItem[];
  reportingItems: StoryClusterDebugItem[];
  analysisItems: StoryClusterDebugItem[];
  opinionItems: StoryClusterDebugItem[];
  creatorSignalItems: StoryClusterDebugItem[];
  duplicateItems: StoryClusterDebugItem[];
};

export type StoryClustersDebugPayload = {
  counts: {
    total: number;
    multiItem: number;
    singleton: number;
  };
  items: StoryClusterDebug[];
};

type AssembleStoryClustersOptions = {
  orderedItems?: StoryContextItem[];
  visibleItems?: StoryContextItem[];
  duplicateItems?: StoryContextItem[];
};

const ANALYSIS_CUE_PATTERNS = [
  /\banalysis\b/i,
  /\bwhat it means\b/i,
  /\bwhy it matters\b/i,
  /\bexplainer\b/i,
  /\bbreakdown\b/i,
  /\bq(?:&|and)?a\b/i,
] as const;

function editorialLabelForRole(role: StoryEditorialRole): string {
  if (role === 'creator_signal') return 'creator signal';
  return role;
}

function itemTextForEditorialRole(item: StoryContextItem): string {
  return `${item.title ?? ''} ${item.summary ?? ''}`.trim();
}

export function isCreatorSignalLikeItem(item: StoryContextItem): boolean {
  const hasCreatorCorroboration =
    item.creatorCorroboration != null && typeof item.creatorCorroboration === 'object';
  if (!hasCreatorCorroboration) return false;
  return item.deskLane === 'voices' || item.provenanceClass === 'COMMENTARY';
}

export function isOpinionLikeItem(item: StoryContextItem): boolean {
  if (isCreatorSignalLikeItem(item)) return false;
  return item.provenanceClass === 'COMMENTARY' || item.deskLane === 'voices';
}

export function isExplicitAnalysisItem(item: StoryContextItem): boolean {
  const text = itemTextForEditorialRole(item);
  if (!text) return false;
  return ANALYSIS_CUE_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyStoryEditorialRole(item: StoryContextItem): StoryEditorialRole {
  if (isCreatorSignalLikeItem(item)) return 'creator_signal';
  if (isOpinionLikeItem(item)) return 'opinion';
  if (isExplicitAnalysisItem(item)) return 'analysis';
  return 'reporting';
}

function toCompactStoryItem(item: StoryContextItem): StoryClusterDebugItem {
  const editorialRole = classifyStoryEditorialRole(item);
  return {
    id: item.id,
    title: item.title,
    sourceSlug: item.sourceSlug ?? null,
    sourceName: item.sourceName ?? null,
    provenanceClass: item.provenanceClass ?? null,
    deskLane: item.deskLane ?? null,
    publishedAt: item.publishedAt ?? null,
    surfaceState: item.surfaceState ?? null,
    isDuplicateLoser: Boolean(item.isDuplicateLoser),
    displayPriority:
      typeof item.displayPriority === 'number' && Number.isFinite(item.displayPriority)
        ? item.displayPriority
        : null,
    displayBucket: item.displayBucket ?? null,
    canonicalUrl: item.canonicalUrl ?? null,
    editorialRole,
    editorialLabel: editorialLabelForRole(editorialRole),
  };
}

function supportedClusterKeyForItem(item: StoryContextItem): StoryClusterKeyMeta | null {
  const clusterKeys =
    item.clusterKeys && typeof item.clusterKeys === 'object' && !Array.isArray(item.clusterKeys)
      ? item.clusterKeys
      : null;
  if (!clusterKeys) return null;

  for (const key of SUPPORTED_CLUSTER_KEY_PRIORITY) {
    const rawValue = clusterKeys[key];
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;
    return {
      key,
      value,
      compositeKey: `${key}:${value}`,
    };
  }

  return null;
}

function classifyStoryEventType(item: StoryContextItem): string | null {
  try {
    return classifyEvent({
      title: item.title ?? '',
      summary: item.summary ?? null,
      deskLane: item.deskLane ?? undefined,
      stateChangeType: item.stateChangeType ?? undefined,
      clusterKeys:
        item.clusterKeys && typeof item.clusterKeys === 'object' && !Array.isArray(item.clusterKeys)
          ? item.clusterKeys
          : {},
      missionTags: Array.isArray(item.missionTags) ? item.missionTags : [],
      provenanceClass: (item.provenanceClass ?? 'SPECIALIST') as any,
      trustWarningMode: item.trustWarningMode ?? undefined,
      institutionalArea: item.institutionalArea ?? undefined,
    }).eventType;
  } catch {
    return null;
  }
}

function buildCreatorSignalNote(items: StoryContextItem[]): StoryCreatorSignalNote | null {
  const withCreatorSignal = items.filter(
    (item) => item.creatorCorroboration && typeof item.creatorCorroboration === 'object',
  );
  if (withCreatorSignal.length === 0) return null;

  const reasons = new Set<string>();
  const clusterIds = new Set<string>();
  const representativeIds = new Set<string>();
  let appliedCount = 0;
  let maxBoost = 0;

  for (const item of withCreatorSignal) {
    const creatorSignal = item.creatorCorroboration!;
    if (creatorSignal.applied) appliedCount += 1;
    if (typeof creatorSignal.boost === 'number' && Number.isFinite(creatorSignal.boost)) {
      maxBoost = Math.max(maxBoost, creatorSignal.boost);
    }
    if (creatorSignal.clusterId) clusterIds.add(creatorSignal.clusterId);
    if (creatorSignal.representativeId) representativeIds.add(creatorSignal.representativeId);
    if (Array.isArray(creatorSignal.reasons)) {
      for (const reason of creatorSignal.reasons) {
        if (typeof reason === 'string' && reason) reasons.add(reason);
      }
    }
  }

  const note: StoryCreatorSignalNote = {
    itemCount: withCreatorSignal.length,
    appliedCount,
    maxBoost,
    reasons: Array.from(reasons).sort((a, b) => a.localeCompare(b)).slice(0, 6),
    clusterIds: Array.from(clusterIds).sort((a, b) => a.localeCompare(b)).slice(0, 4),
    representativeIds: Array.from(representativeIds)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 4),
    itemIds: withCreatorSignal.map((item) => item.id).sort((a, b) => a.localeCompare(b)).slice(0, 8),
  };
  if (note.itemCount > 0) note.label = 'creator signal';
  return note;
}

function emptyStoryClusters(): StoryClustersDebugPayload {
  return {
    counts: {
      total: 0,
      multiItem: 0,
      singleton: 0,
    },
    items: [],
  };
}

export function assembleStoryClusters(
  options: AssembleStoryClustersOptions = {},
): StoryClustersDebugPayload {
  const orderedItems = Array.isArray(options.orderedItems) ? options.orderedItems : [];
  const duplicateItems = Array.isArray(options.duplicateItems) ? options.duplicateItems : [];
  const visibleItems = Array.isArray(options.visibleItems) ? options.visibleItems : [];

  if (orderedItems.length === 0 && duplicateItems.length === 0) return emptyStoryClusters();

  const dedupedOrderedItems = [...orderedItems];
  const dedupedDuplicateItems = duplicateItems.filter(
    (item) => !dedupedOrderedItems.some((ordered) => ordered.id === item.id),
  );
  const allItems = [...dedupedOrderedItems, ...dedupedDuplicateItems];
  const visibleIds = new Set(visibleItems.map((item) => item.id));
  const orderIndexById = new Map(allItems.map((item, index) => [item.id, index]));
  const keyMetaByItemId = new Map<string, StoryClusterKeyMeta>();
  const itemIdsByCompositeKey = new Map<string, string[]>();

  for (const item of allItems) {
    const clusterKey = supportedClusterKeyForItem(item);
    if (!clusterKey) continue;
    keyMetaByItemId.set(item.id, clusterKey);
    const ids = itemIdsByCompositeKey.get(clusterKey.compositeKey) ?? [];
    ids.push(item.id);
    itemIdsByCompositeKey.set(clusterKey.compositeKey, ids);
  }

  const storyClusters: StoryClusterDebug[] = [];
  const seenStoryIds = new Set<string>();

  for (const item of allItems) {
    const clusterKey = keyMetaByItemId.get(item.id) ?? null;
    const keyedGroupIds =
      clusterKey && (itemIdsByCompositeKey.get(clusterKey.compositeKey) ?? []).length > 1
        ? itemIdsByCompositeKey.get(clusterKey.compositeKey) ?? []
        : null;
    const groupingKind = keyedGroupIds ? 'cluster_key' : 'singleton';
    const storyId = keyedGroupIds ? `story:${clusterKey!.compositeKey}` : `story:item:${item.id}`;

    if (seenStoryIds.has(storyId)) continue;
    seenStoryIds.add(storyId);

    const storyItems = (keyedGroupIds
      ? allItems.filter((candidate) => keyedGroupIds.includes(candidate.id))
      : [item]
    )
      .slice()
      .sort(
        (a, b) =>
          (orderIndexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndexById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );

    const representative = storyItems.find((candidate) => !candidate.isDuplicateLoser) ?? storyItems[0];
    if (!representative) continue;

    const corroboratingItems: StoryClusterDebugItem[] = [];
    const commentaryItems: StoryClusterDebugItem[] = [];
    const reportingItems: StoryClusterDebugItem[] = [];
    const analysisItems: StoryClusterDebugItem[] = [];
    const opinionItems: StoryClusterDebugItem[] = [];
    const creatorSignalItems: StoryClusterDebugItem[] = [];
    const duplicateBucket: StoryClusterDebugItem[] = [];

    for (const candidate of storyItems) {
      if (candidate.id === representative.id) continue;
      const compact = toCompactStoryItem(candidate);
      if (candidate.isDuplicateLoser) {
        duplicateBucket.push(compact);
        continue;
      }
      if (compact.editorialRole === 'creator_signal') {
        creatorSignalItems.push(compact);
        commentaryItems.push(compact);
        continue;
      }
      if (compact.editorialRole === 'opinion' || compact.editorialRole === 'analysis') {
        if (compact.editorialRole === 'analysis') analysisItems.push(compact);
        if (compact.editorialRole === 'opinion') opinionItems.push(compact);
        commentaryItems.push(compact);
        continue;
      }
      reportingItems.push(compact);
      corroboratingItems.push(compact);
    }

    const primaryItem = toCompactStoryItem(representative);

    storyClusters.push({
      storyId,
      groupingKind,
      clusterKey: groupingKind === 'cluster_key' ? clusterKey : null,
      representativeId: representative.id,
      itemIds: storyItems.map((candidate) => candidate.id),
      visibleItemIds: storyItems
        .filter((candidate) => visibleIds.has(candidate.id))
        .map((candidate) => candidate.id),
      duplicateItemIds: storyItems
        .filter((candidate) => candidate.isDuplicateLoser)
        .map((candidate) => candidate.id),
      counts: {
        total: storyItems.length,
        corroborating: corroboratingItems.length,
        commentary: commentaryItems.length,
        duplicates: duplicateBucket.length,
      },
      roleCounts: {
        reporting: reportingItems.length,
        analysis: analysisItems.length,
        opinion: opinionItems.length,
        creator_signal: creatorSignalItems.length,
      },
      eventType: classifyStoryEventType(representative),
      whyItMatters: representative.whyItMatters ?? null,
      creatorSignalNote: buildCreatorSignalNote(storyItems),
      primaryItem,
      corroboratingItems,
      commentaryItems,
      reportingItems,
      analysisItems,
      opinionItems,
      creatorSignalItems,
      duplicateItems: duplicateBucket,
    });
  }

  return {
    counts: {
      total: storyClusters.length,
      multiItem: storyClusters.filter((story) => story.counts.total > 1).length,
      singleton: storyClusters.filter((story) => story.counts.total === 1).length,
    },
    items: storyClusters,
  };
}
