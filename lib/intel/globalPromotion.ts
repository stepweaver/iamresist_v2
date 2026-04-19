import type { ProvenanceClass } from '@/lib/intel/types';
import { classifyEvent } from '@/lib/intel/eventClassification';
import { EVENT_SEVERITY } from '@/lib/intel/eventTaxonomy';

export type PromotionReasonCode =
  | 'fresh_high_priority_event'
  | 'primary_source'
  | 'court_or_legal_action'
  | 'accountability_signal'
  | 'corroborated_multi_source'
  | 'corroborated_multi_lane'
  | 'corroborated_multi_family'
  | 'congress_urgency'
  | 'new_phase_in_active_story'
  | 'watched_theme_match'
  | 'contradiction_or_evasion'
  | 'resignation_or_ethics_signal'
  | 'major_government_action'
  | 'underreported_but_high_impact'
  | 'trusted_creator_convergence'
  | 'creator_led_story_with_corroboration'
  | 'creator_support_noted'
  | 'repeat_coverage_penalty'
  | 'claims_lane_penalty';

export type PromotionContribution = { code: string; delta: number; message: string };

export type PromotableItem = {
  id: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
  provenanceClass: ProvenanceClass;
  sourceSlug: string;
  sourceFamily?: string | null;
  deskLane?: string;
  missionTags: string[];
  clusterKeys: Record<string, string>;
  surfaceState?: string;
  isDuplicateLoser?: boolean;
  displayPriority?: number;
  trustWarningMode?: string | null;
  institutionalArea?: string;
};

export type GlobalPromotionDecision = {
  totalScore: number; // 0..100
  reasons: PromotionReasonCode[];
  contributions: PromotionContribution[];
  eventType: string;
  corroboration: {
    itemCount: number;
    sourceCount: number;
    laneCount: number;
    familyCount: number;
  };
  creatorConvergence: {
    active: boolean;
    itemCount: number;
    sourceCount: number;
    supportingItemCount: number;
    supportingLaneCount: number;
    sharedTokens: string[];
    latestHours: number | null;
    delta: number;
    creatorLedWithCorroboration: boolean;
  };
};

export type PromotedCluster = {
  clusterId: string;
  representativeId: string;
  representative: PromotableItem;
  items: PromotableItem[];
  decision: GlobalPromotionDecision;
};

export type CreatorCorroborationBridgeDecision = {
  targetItemId: string;
  clusterId: string;
  representativeId: string;
  boost: number;
  eventType: string;
  reasons: PromotionReasonCode[];
  contributions: PromotionContribution[];
  corroboration: GlobalPromotionDecision['corroboration'];
  creatorConvergence: GlobalPromotionDecision['creatorConvergence'];
};

type ClassifiedClusterItem = {
  item: PromotableItem;
  eventType: string;
  severity: number;
};

type CreatorConvergenceSignal = {
  active: boolean;
  itemCount: number;
  sourceCount: number;
  supportingItemCount: number;
  supportingLaneCount: number;
  sharedTokens: string[];
  latestHours: number | null;
  delta: number;
  creatorLedWithCorroboration: boolean;
  creatorSupportNoted: boolean;
};

const HARD_CLUSTER_KEY_PRIORITY = [
  'bill',
  'executive_order',
  'proclamation',
  'fr_document_number',
  'case_number',
  'docket',
] as const;

const CONGRESS_URGENCY_PATTERNS: RegExp[] = [
  /\bfisa\b/i,
  /\bsection\s*702\b/i,
  /\bsurveillance\b/i,
  /\breauthoriz(?:ation|e|ed|ing)?\b/i,
  /\bextension\b/i,
  /\bfloor\s+vote\b/i,
  /\bemergency\s+vote\b/i,
  /\blate[-\s]?night\s+vote\b/i,
  /\brules\s+vote\b/i,
  /\bcloture\b/i,
  /\bprocedural\s+showdown\b/i,
  /\bhouse\s*\/\s*senate\s+showdown\b/i,
  /\bhouse\s+and\s+senate\s+showdown\b/i,
];

const SURVEILLANCE_PATTERNS: RegExp[] = [
  /\bfisa\b/i,
  /\bsection\s*702\b/i,
  /\bsurveillance\b/i,
  /\bwiretap\b/i,
  /\bspy(?:ing)?\b/i,
];

const OVERSIGHT_PATTERNS: RegExp[] = [
  /\boversight\b/i,
  /\bsubpoena\b/i,
  /\binspector\s+general\b/i,
  /\bwhistleblower\b/i,
  /\bhearing\b/i,
];

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3600000;
}

function normStoryTokens(text: string): string[] {
  const t = String(text ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return [];
  const stop = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'to',
    'of',
    'in',
    'on',
    'for',
    'with',
    'as',
    'at',
    'by',
    'from',
    'about',
    'after',
    'before',
    'over',
    'under',
    'into',
    'new',
    'says',
    'say',
    'report',
    'reports',
    'live',
    'update',
    'updates',
    'what',
    'why',
    'how',
  ]);
  return t
    .split(' ')
    .map((x) => x.trim())
    .filter((x) => x.length >= 4 && !stop.has(x))
    .slice(0, 24);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function clusterHaystack(items: PromotableItem[]): string {
  return items.map((item) => `${item.title}\n${item.summary ?? ''}`).join('\n').toLowerCase();
}

function clusterMissionTags(items: PromotableItem[]): Set<string> {
  return new Set(items.flatMap((item) => (Array.isArray(item.missionTags) ? item.missionTags : [])));
}

function representativeProvenanceWeight(p: ProvenanceClass): number {
  if (p === 'PRIMARY') return 16;
  if (p === 'SPECIALIST') return 12;
  if (p === 'WIRE') return 8;
  if (p === 'INDIE') return 4;
  if (p === 'COMMENTARY') return -4;
  if (p === 'SCHEDULE') return -8;
  return 0;
}

function clusterProvenanceContribution(p: ProvenanceClass): number {
  if (p === 'PRIMARY') return 8;
  if (p === 'SPECIALIST') return 6;
  if (p === 'WIRE') return 3;
  if (p === 'INDIE') return 1;
  if (p === 'COMMENTARY') return -2;
  if (p === 'SCHEDULE') return -6;
  return 0;
}

function isTrustedCreatorItem(item: PromotableItem): boolean {
  return item.deskLane === 'voices' || item.provenanceClass === 'COMMENTARY';
}

function classifyClusterItems(items: PromotableItem[]): ClassifiedClusterItem[] {
  return items.map((item) => {
    const eventType = classifyEvent(item).eventType;
    const severity = EVENT_SEVERITY[eventType as keyof typeof EVENT_SEVERITY] ?? 0.3;
    return { item, eventType, severity };
  });
}

function representativeScore(entry: ClassifiedClusterItem): number {
  const displayPriority = typeof entry.item.displayPriority === 'number' ? entry.item.displayPriority : 50;
  let score = Math.round((displayPriority - 50) / 4);
  score += representativeProvenanceWeight(entry.item.provenanceClass);
  score += Math.round((entry.severity - 0.3) * 14);

  if (entry.eventType === 'generic_report') score -= 2;
  if (entry.eventType === 'statement_claim' || entry.eventType === 'official_statement') score -= 4;
  if (entry.item.provenanceClass === 'COMMENTARY') score -= 4;
  if (entry.item.deskLane === 'statements' || entry.item.trustWarningMode === 'source_controlled_official_claims') {
    score -= 4;
  }

  return score;
}

function pickBestItem(entries: ClassifiedClusterItem[]): PromotableItem {
  const sorted = [...entries].sort((a, b) => {
    const sa = representativeScore(a);
    const sb = representativeScore(b);
    if (sb !== sa) return sb - sa;

    const da = typeof a.item.displayPriority === 'number' ? a.item.displayPriority : 50;
    const db = typeof b.item.displayPriority === 'number' ? b.item.displayPriority : 50;
    if (db !== da) return db - da;

    const ta = a.item.publishedAt ? new Date(a.item.publishedAt).getTime() : 0;
    const tb = b.item.publishedAt ? new Date(b.item.publishedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;

    const slug = a.item.sourceSlug.localeCompare(b.item.sourceSlug);
    if (slug !== 0) return slug;

    return a.item.id.localeCompare(b.item.id);
  });
  return sorted[0]!.item;
}

function clusterKeysForItem(it: PromotableItem): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const clusterKeys = it.clusterKeys && typeof it.clusterKeys === 'object' ? it.clusterKeys : {};

  for (const key of HARD_CLUSTER_KEY_PRIORITY) {
    const value = clusterKeys[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const composed = `ck:${key}:${value.trim()}`;
    if (!seen.has(composed)) {
      seen.add(composed);
      keys.push(composed);
    }
  }

  for (const [key, value] of Object.entries(clusterKeys).sort(([a], [b]) => a.localeCompare(b))) {
    if (HARD_CLUSTER_KEY_PRIORITY.includes(key as (typeof HARD_CLUSTER_KEY_PRIORITY)[number])) continue;
    if (typeof value !== 'string' || !value.trim()) continue;
    const composed = `ck:${key}:${value.trim()}`;
    if (!seen.has(composed)) {
      seen.add(composed);
      keys.push(composed);
    }
  }

  if (it.canonicalUrl) {
    const composed = `url:${it.canonicalUrl}`;
    if (!seen.has(composed)) keys.push(composed);
  }

  return keys;
}

function closeInTime(a: PromotableItem, b: PromotableItem, hours = 36): boolean {
  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : NaN;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : NaN;
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= hours * 3600000;
}

function similarStory(a: PromotableItem, aClass: string, b: PromotableItem, bClass: string): boolean {
  if (aClass !== bClass) return false;
  if (!closeInTime(a, b, 30)) return false;

  const aTokens = normStoryTokens(`${a.title} ${a.summary ?? ''}`);
  const bTokens = normStoryTokens(`${b.title} ${b.summary ?? ''}`);
  const similarity = jaccard(aTokens, bTokens);
  const shared = aTokens.filter((token) => bTokens.includes(token)).length;

  if (similarity >= 0.72) return true;
  if (shared >= 3 && similarity >= 0.34) return true;
  if (shared >= 2 && similarity >= 0.42) return true;
  return false;
}

/**
 * Conservative, ephemeral clustering for promotion.
 * Order of operations:
 * - hard merge by deterministic clusterKeys or canonicalUrl overlap
 * - then optional title/topic similarity (tight threshold + time window + same event type)
 */
export function buildPromotionClusters(items: PromotableItem[]): PromotableItem[][] {
  const pool = (Array.isArray(items) ? items : []).filter(
    (it) => it && it.surfaceState !== 'suppressed' && !it.isDuplicateLoser,
  );

  const itemById = new Map(pool.map((item) => [item.id, item]));
  const itemKeys = new Map<string, string[]>();
  const keyToItemIds = new Map<string, string[]>();
  const leftovers: PromotableItem[] = [];

  for (const item of pool) {
    const keys = clusterKeysForItem(item);
    if (keys.length === 0) {
      leftovers.push(item);
      continue;
    }
    itemKeys.set(item.id, keys);
    for (const key of keys) {
      const arr = keyToItemIds.get(key) ?? [];
      arr.push(item.id);
      keyToItemIds.set(key, arr);
    }
  }

  const hardClusters: PromotableItem[][] = [];
  const visited = new Set<string>();

  for (const item of pool) {
    if (visited.has(item.id) || !itemKeys.has(item.id)) continue;

    const clusterIds = new Set<string>();
    const queue = [item.id];
    visited.add(item.id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      clusterIds.add(currentId);
      for (const key of itemKeys.get(currentId) ?? []) {
        for (const neighborId of keyToItemIds.get(key) ?? []) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    hardClusters.push(
      Array.from(clusterIds)
        .map((id) => itemById.get(id)!)
        .filter(Boolean),
    );
  }

  const singles = hardClusters.filter((cluster) => cluster.length === 1).map((cluster) => cluster[0]!);
  const multi = hardClusters.filter((cluster) => cluster.length > 1);

  const candidateSingles = [...singles, ...leftovers];
  const used = new Set<string>();
  const softClusters: PromotableItem[][] = [];

  for (let i = 0; i < candidateSingles.length; i++) {
    const a = candidateSingles[i]!;
    if (used.has(a.id)) continue;
    const aClass = classifyEvent(a).eventType;
    const group: PromotableItem[] = [a];
    used.add(a.id);

    for (let j = i + 1; j < candidateSingles.length; j++) {
      const b = candidateSingles[j]!;
      if (used.has(b.id)) continue;
      const bClass = classifyEvent(b).eventType;
      if (!similarStory(a, aClass, b, bClass)) continue;
      group.push(b);
      used.add(b.id);
    }

    softClusters.push(group);
  }

  return [...multi, ...softClusters];
}

function accountabilityBoost(cluster: PromotableItem[]): number {
  const tags = clusterMissionTags(cluster);
  const h = clusterHaystack(cluster);
  let boost = 0;

  if (tags.has('courts')) boost += 8;
  if (tags.has('voting_rights') || tags.has('elections')) boost += 7;
  if (tags.has('civil_liberties')) boost += 8;
  if (tags.has('executive_power')) boost += 6;
  if (tags.has('federal_agencies')) boost += 4;
  if (tags.has('congress')) boost += 7;
  if (hasAny(h, SURVEILLANCE_PATTERNS)) boost += 5;
  if (hasAny(h, OVERSIGHT_PATTERNS)) boost += 4;

  return Math.min(24, boost);
}

function congressUrgencyBoost(cluster: PromotableItem[], classified: ClassifiedClusterItem[]): number {
  if (classified.some((entry) => entry.eventType === 'congress_urgency')) return 10;

  const tags = clusterMissionTags(cluster);
  const h = clusterHaystack(cluster);
  const legislativeContext =
    tags.has('congress') || /\b(congress|senate|house|cloture|rules committee)\b/i.test(h);
  if (!legislativeContext) return 0;

  const hasSurveillance = hasAny(h, SURVEILLANCE_PATTERNS);
  const hasUrgency = hasAny(h, CONGRESS_URGENCY_PATTERNS);
  if (hasSurveillance && hasUrgency) return 9;
  if (hasUrgency) return 6;
  return 0;
}

function momentumBoost(cluster: PromotableItem[]): { delta: number; latestHours: number | null; spanHours: number } {
  const stamps = cluster
    .map((item) => (item.publishedAt ? new Date(item.publishedAt).getTime() : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (stamps.length === 0) return { delta: 0, latestHours: null, spanHours: 0 };

  const latest = stamps[stamps.length - 1]!;
  const latestHours = (Date.now() - latest) / 3600000;
  const spanHours = (latest - stamps[0]!) / 3600000;
  let delta = 0;

  if (cluster.length >= 2 && latestHours <= 6) delta += 2;
  if (cluster.length >= 3 && latestHours <= 12) delta += 2;
  if (spanHours >= 6 && latestHours <= 6) delta += 4;

  return { delta: Math.min(8, delta), latestHours, spanHours };
}

function creatorConvergenceSignal(cluster: PromotableItem[], classified: ClassifiedClusterItem[]): CreatorConvergenceSignal {
  const creatorEntries = classified.filter((entry) => isTrustedCreatorItem(entry.item));
  const creatorItems = creatorEntries.map((entry) => entry.item);
  const creatorSources = new Set(creatorItems.map((item) => item.sourceSlug).filter(Boolean));
  const supportingItems = cluster.filter((item) => !isTrustedCreatorItem(item));
  const supportingLanes = new Set(
    supportingItems.map((item) => item.deskLane ?? 'unknown').filter((lane) => lane !== 'voices'),
  );

  const publishedHours = creatorItems
    .map((item) => hoursSince(item.publishedAt))
    .filter((value): value is number => value != null && Number.isFinite(value));
  const latestHours = publishedHours.length ? Math.min(...publishedHours) : null;

  if (creatorItems.length < 2 || creatorSources.size < 2) {
    return {
      active: false,
      itemCount: creatorItems.length,
      sourceCount: creatorSources.size,
      supportingItemCount: supportingItems.length,
      supportingLaneCount: supportingLanes.size,
      sharedTokens: [],
      latestHours,
      delta: 0,
      creatorLedWithCorroboration: false,
      creatorSupportNoted: false,
    };
  }

  if (latestHours == null || latestHours > 36) {
    return {
      active: false,
      itemCount: creatorItems.length,
      sourceCount: creatorSources.size,
      supportingItemCount: supportingItems.length,
      supportingLaneCount: supportingLanes.size,
      sharedTokens: [],
      latestHours,
      delta: 0,
      creatorLedWithCorroboration: false,
      creatorSupportNoted: false,
    };
  }

  const tokenCounts = new Map<string, number>();
  for (const item of creatorItems) {
    const itemTokens = new Set(normStoryTokens(`${item.title} ${item.summary ?? ''}`));
    for (const token of itemTokens) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
  }

  const sharedTokens = Array.from(tokenCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([token]) => token)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 6);

  const creatorEventTypes = new Set(
    creatorEntries
      .map((entry) => entry.eventType)
      .filter((eventType) => eventType && eventType !== 'generic_report' && eventType !== 'statement_claim'),
  );
  const active = sharedTokens.length >= 2 || creatorEventTypes.size === 1;
  if (!active) {
    return {
      active: false,
      itemCount: creatorItems.length,
      sourceCount: creatorSources.size,
      supportingItemCount: supportingItems.length,
      supportingLaneCount: supportingLanes.size,
      sharedTokens,
      latestHours,
      delta: 0,
      creatorLedWithCorroboration: false,
      creatorSupportNoted: false,
    };
  }

  const creatorLedWithCorroboration = supportingItems.length > 0 && supportingLanes.size > 0;
  const baseDelta = creatorLedWithCorroboration
    ? 3 + Math.min(2, creatorSources.size - 2) + Math.min(1, sharedTokens.length >= 3 ? 1 : 0)
    : 0;

  return {
    active: true,
    itemCount: creatorItems.length,
    sourceCount: creatorSources.size,
    supportingItemCount: supportingItems.length,
    supportingLaneCount: supportingLanes.size,
    sharedTokens,
    latestHours,
    delta: Math.min(6, Math.max(0, baseDelta)),
    creatorLedWithCorroboration,
    creatorSupportNoted: true,
  };
}

function computeDecisionForCluster(cluster: PromotableItem[]): GlobalPromotionDecision {
  const classified = classifyClusterItems(cluster);
  const representative = pickBestItem(classified);
  const strongest = [...classified].sort((a, b) => b.severity - a.severity || a.eventType.localeCompare(b.eventType))[0]!;
  const momentum = momentumBoost(cluster);
  const creatorConvergence = creatorConvergenceSignal(cluster, classified);

  const contributions: PromotionContribution[] = [];
  let score = 50;

  const representativeDisplayPriority =
    typeof representative.displayPriority === 'number' ? representative.displayPriority : 50;
  const representativeDelta = clamp(Math.round((representativeDisplayPriority - 50) / 3), -12, 12);
  score += representativeDelta;
  contributions.push({
    code: 'representative_display_priority',
    delta: representativeDelta,
    message: 'Bounded representative display priority',
  });

  const eventDelta = Math.round((strongest.severity - 0.3) * 24);
  score += eventDelta;
  contributions.push({
    code: `event:${strongest.eventType}`,
    delta: eventDelta,
    message: `Strongest event support in cluster (${strongest.eventType})`,
  });

  const accountabilityDelta = accountabilityBoost(cluster);
  score += accountabilityDelta;
  if (accountabilityDelta) {
    contributions.push({
      code: 'accountability_signal',
      delta: accountabilityDelta,
      message: 'Accountability relevance across the cluster',
    });
  }

  const congressUrgencyDelta = congressUrgencyBoost(cluster, classified);
  score += congressUrgencyDelta;
  if (congressUrgencyDelta) {
    contributions.push({
      code: 'congress_urgency',
      delta: congressUrgencyDelta,
      message: 'Congressional procedural/surveillance urgency',
    });
  }

  const provenanceDelta = clusterProvenanceContribution(representative.provenanceClass);
  score += provenanceDelta;
  contributions.push({
    code: 'representative_provenance',
    delta: provenanceDelta,
    message: `Representative provenance (${representative.provenanceClass})`,
  });

  if (momentum.latestHours != null) {
    const freshnessDelta = momentum.latestHours <= 2 ? 8 : momentum.latestHours <= 6 ? 5 : momentum.latestHours <= 18 ? 2 : 0;
    score += freshnessDelta;
    if (freshnessDelta) {
      contributions.push({
        code: 'freshness',
        delta: freshnessDelta,
        message: 'Freshest item in cluster',
      });
    }
  }

  const sources = new Set(cluster.map((item) => item.sourceSlug).filter(Boolean));
  const lanes = new Set(cluster.map((item) => item.deskLane ?? 'unknown').filter(Boolean));
  const families = new Set(cluster.map((item) => item.sourceFamily ?? 'general').filter(Boolean));

  const sourceDelta = Math.min(18, Math.max(0, (sources.size - 1) * 6));
  score += sourceDelta;
  if (sourceDelta) {
    contributions.push({
      code: 'corroborated_multi_source',
      delta: sourceDelta,
      message: 'Corroboration from multiple sources',
    });
  }

  const laneDelta = Math.min(10, Math.max(0, (lanes.size - 1) * 5));
  score += laneDelta;
  if (laneDelta) {
    contributions.push({
      code: 'corroborated_multi_lane',
      delta: laneDelta,
      message: 'Corroboration across desks/lanes',
    });
  }

  const familyDelta = Math.min(8, Math.max(0, (families.size - 1) * 4));
  score += familyDelta;
  if (familyDelta) {
    contributions.push({
      code: 'corroborated_multi_family',
      delta: familyDelta,
      message: 'Corroboration across source families',
    });
  }

  if (creatorConvergence.creatorSupportNoted) {
    contributions.push({
      code: 'creator_support_noted',
      delta: 0,
      message: `Trusted creator support noted (${creatorConvergence.itemCount} items, ${creatorConvergence.sourceCount} creators)`,
    });
  }

  if (creatorConvergence.delta > 0) {
    score += creatorConvergence.delta;
    contributions.push({
      code: 'trusted_creator_convergence',
      delta: creatorConvergence.delta,
      message: 'Trusted creator convergence helped surface a corroborated live story',
    });
  }

  score += momentum.delta;
  if (momentum.delta) {
    contributions.push({
      code: 'new_phase_in_active_story',
      delta: momentum.delta,
      message: 'Fresh movement inside an active story cluster',
    });
  }

  const countBySource = new Map<string, number>();
  for (const item of cluster) {
    const key = item.sourceSlug || 'unknown';
    countBySource.set(key, (countBySource.get(key) ?? 0) + 1);
  }
  const maxSameSource = Math.max(...Array.from(countBySource.values()));
  if (maxSameSource >= 3 && sources.size === 1) {
    score -= 10;
    contributions.push({
      code: 'repeat_coverage_penalty',
      delta: -10,
      message: 'Penalty: repeated coverage without outside corroboration',
    });
  } else if (maxSameSource >= 4) {
    score -= 6;
    contributions.push({
      code: 'repeat_coverage_penalty',
      delta: -6,
      message: 'Penalty: same-source dominance inside cluster',
    });
  }

  const statementLike =
    representative.deskLane === 'statements' ||
    representative.trustWarningMode === 'source_controlled_official_claims';
  if (statementLike && (sources.size < 2 || families.size < 2)) {
    score -= 12;
    contributions.push({
      code: 'claims_lane_penalty',
      delta: -12,
      message: 'Penalty: claims/statement representative without corroboration',
    });
  }

  const totalScore = clamp(score, 0, 100);

  const reasons: PromotionReasonCode[] = [];
  if (momentum.latestHours != null && momentum.latestHours <= 6 && strongest.severity >= 0.68 && totalScore >= 70) {
    reasons.push('fresh_high_priority_event');
  }
  if (representative.provenanceClass === 'PRIMARY') reasons.push('primary_source');
  if (
    strongest.eventType === 'injunction' ||
    strongest.eventType === 'court_order' ||
    (representative.missionTags ?? []).includes('courts')
  ) {
    reasons.push('court_or_legal_action');
  }
  if (accountabilityDelta >= 10) reasons.push('accountability_signal');
  if (sourceDelta > 0) reasons.push('corroborated_multi_source');
  if (laneDelta > 0) reasons.push('corroborated_multi_lane');
  if (familyDelta > 0) reasons.push('corroborated_multi_family');
  if (creatorConvergence.active) reasons.push('creator_support_noted');
  if (creatorConvergence.delta > 0) reasons.push('trusted_creator_convergence');
  if (creatorConvergence.creatorLedWithCorroboration && creatorConvergence.delta > 0) {
    reasons.push('creator_led_story_with_corroboration');
  }
  if (congressUrgencyDelta > 0) reasons.push('congress_urgency');
  if (strongest.eventType === 'contradiction') reasons.push('contradiction_or_evasion');
  if (strongest.eventType === 'resignation' || strongest.eventType === 'ethics_probe') {
    reasons.push('resignation_or_ethics_signal');
  }
  if (
    strongest.eventType === 'executive_action' ||
    strongest.eventType === 'policy_change' ||
    strongest.eventType === 'sanctions_action' ||
    strongest.eventType === 'military_action'
  ) {
    reasons.push('major_government_action');
  }
  if (maxSameSource >= 3) reasons.push('repeat_coverage_penalty');
  if (statementLike && (sources.size < 2 || families.size < 2)) reasons.push('claims_lane_penalty');
  if (momentum.delta > 0 && momentum.spanHours >= 6) reasons.push('new_phase_in_active_story');

  return {
    totalScore,
    reasons: Array.from(new Set(reasons)),
    contributions,
    eventType: strongest.eventType,
    corroboration: {
      itemCount: cluster.length,
      sourceCount: sources.size,
      laneCount: lanes.size,
      familyCount: families.size,
    },
    creatorConvergence: {
      active: creatorConvergence.active,
      itemCount: creatorConvergence.itemCount,
      sourceCount: creatorConvergence.sourceCount,
      supportingItemCount: creatorConvergence.supportingItemCount,
      supportingLaneCount: creatorConvergence.supportingLaneCount,
      sharedTokens: creatorConvergence.sharedTokens,
      latestHours: creatorConvergence.latestHours,
      delta: creatorConvergence.delta,
      creatorLedWithCorroboration: creatorConvergence.creatorLedWithCorroboration,
    },
  };
}

export function promoteGlobally(items: PromotableItem[], opts?: { limit?: number }): PromotedCluster[] {
  const clusters = buildPromotionClusters(items);
  const enriched: PromotedCluster[] = clusters.map((cluster, idx) => {
    const representative = pickBestItem(classifyClusterItems(cluster));
    const decision = computeDecisionForCluster(cluster);
    const clusterId = `pcl_${idx}_${representative.id}`;
    return {
      clusterId,
      representativeId: representative.id,
      representative,
      items: cluster,
      decision,
    };
  });

  const sorted = enriched.sort((a, b) => {
    if (b.decision.totalScore !== a.decision.totalScore) return b.decision.totalScore - a.decision.totalScore;
    return a.representativeId.localeCompare(b.representativeId);
  });
  const limit = Math.max(1, Math.min(12, Number(opts?.limit) || 6));
  return sorted.slice(0, limit);
}

export function computeCreatorCorroborationBridge(
  targetItems: PromotableItem[],
  supportItems: PromotableItem[],
  opts?: { maxBoost?: number },
): CreatorCorroborationBridgeDecision[] {
  const targets = (Array.isArray(targetItems) ? targetItems : []).filter(
    (item) => item && item.surfaceState === 'surfaced' && !item.isDuplicateLoser,
  );
  const supports = (Array.isArray(supportItems) ? supportItems : []).filter(
    (item) => item && item.surfaceState !== 'suppressed' && !item.isDuplicateLoser,
  );
  if (targets.length === 0 || supports.length === 0) return [];

  const targetIds = new Set(targets.map((item) => item.id));
  const maxBoost = Math.max(0, Math.min(6, Number(opts?.maxBoost) || 4));
  const clusters = buildPromotionClusters([...targets, ...supports]);
  const out: CreatorCorroborationBridgeDecision[] = [];

  clusters.forEach((cluster, index) => {
    const clusterTargets = cluster.filter(
      (item) => targetIds.has(item.id) && !isTrustedCreatorItem(item),
    );
    if (clusterTargets.length === 0) return;

    const decision = computeDecisionForCluster(cluster);
    const boost = Math.min(
      maxBoost,
      Math.max(0, decision.creatorConvergence.delta ?? 0),
    );
    if (boost <= 0) return;

    const representative = pickBestItem(classifyClusterItems(cluster));
    const reasons = decision.reasons.filter((reason) =>
      reason === 'creator_support_noted' ||
      reason === 'trusted_creator_convergence' ||
      reason === 'creator_led_story_with_corroboration',
    );
    const contributions = decision.contributions.filter(
      (contribution) =>
        contribution.code === 'creator_support_noted' ||
        contribution.code === 'trusted_creator_convergence',
    );
    const clusterId = `creator_bridge_${index}_${representative.id}`;

    for (const target of clusterTargets) {
      out.push({
        targetItemId: target.id,
        clusterId,
        representativeId: representative.id,
        boost,
        eventType: decision.eventType,
        reasons,
        contributions,
        corroboration: decision.corroboration,
        creatorConvergence: decision.creatorConvergence,
      });
    }
  });

  return out.sort((a, b) => {
    if (b.boost !== a.boost) return b.boost - a.boost;
    return a.targetItemId.localeCompare(b.targetItemId);
  });
}
