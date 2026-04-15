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
  | 'new_phase_in_active_story'
  | 'watched_theme_match'
  | 'contradiction_or_evasion'
  | 'resignation_or_ethics_signal'
  | 'major_government_action'
  | 'underreported_but_high_impact'
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
};

export type PromotedCluster = {
  clusterId: string;
  representativeId: string;
  representative: PromotableItem;
  items: PromotableItem[];
  decision: GlobalPromotionDecision;
};

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

function normTitleTokens(title: string): string[] {
  const t = String(title ?? '')
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
  const toks = t
    .split(' ')
    .map((x) => x.trim())
    .filter((x) => x.length >= 4 && !stop.has(x));
  return toks.slice(0, 18);
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

function provenanceWeight(p: ProvenanceClass): number {
  if (p === 'PRIMARY') return 12;
  if (p === 'SPECIALIST') return 8;
  if (p === 'WIRE') return 4;
  if (p === 'INDIE') return 2;
  if (p === 'COMMENTARY') return -8;
  if (p === 'SCHEDULE') return -10;
  return 0;
}

function accountabilityBoost(item: PromotableItem): number {
  const tags = new Set(item.missionTags ?? []);
  let b = 0;
  if (tags.has('courts')) b += 10;
  if (tags.has('voting_rights') || tags.has('elections')) b += 8;
  if (tags.has('civil_liberties')) b += 8;
  if (tags.has('executive_power')) b += 6;
  if (tags.has('federal_agencies')) b += 4;
  return Math.min(18, b);
}

function pickBestItem(items: PromotableItem[]): PromotableItem {
  const sorted = [...items].sort((a, b) => {
    const da = typeof a.displayPriority === 'number' ? a.displayPriority : 50;
    const db = typeof b.displayPriority === 'number' ? b.displayPriority : 50;
    if (db !== da) return db - da;
    const pa = provenanceWeight(a.provenanceClass);
    const pb = provenanceWeight(b.provenanceClass);
    if (pb !== pa) return pb - pa;
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
  return sorted[0]!;
}

function clusterKeyForItem(it: PromotableItem): string | null {
  if (it.canonicalUrl) return `url:${it.canonicalUrl}`;
  const ck = it.clusterKeys;
  if (ck && typeof ck === 'object') {
    for (const [k, v] of Object.entries(ck)) {
      if (typeof v === 'string' && v.trim()) return `ck:${k}:${v.trim()}`;
    }
  }
  return null;
}

function closeInTime(a: PromotableItem, b: PromotableItem, hours = 36): boolean {
  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : NaN;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : NaN;
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= hours * 3600000;
}

/**
 * Conservative, ephemeral clustering for promotion.
 * Order of operations:
 * - hard merge by canonicalUrl
 * - then hard merge by deterministic clusterKeys (bill/fr/eo/etc)
 * - then optional title similarity (tight threshold + time window + same event type)
 */
export function buildPromotionClusters(items: PromotableItem[]): PromotableItem[][] {
  const pool = (Array.isArray(items) ? items : []).filter(
    (it) => it && it.surfaceState !== 'suppressed' && !it.isDuplicateLoser,
  );

  const byHard = new Map<string, PromotableItem[]>();
  const leftovers: PromotableItem[] = [];
  for (const it of pool) {
    const key = clusterKeyForItem(it);
    if (!key) {
      leftovers.push(it);
      continue;
    }
    const arr = byHard.get(key) ?? [];
    arr.push(it);
    byHard.set(key, arr);
  }

  const hardClusters = Array.from(byHard.values()).filter((c) => c.length > 0);
  const singles = hardClusters.filter((c) => c.length === 1).map((c) => c[0]!);
  const multi = hardClusters.filter((c) => c.length > 1);

  const candidateSingles = [...singles, ...leftovers];
  const used = new Set<string>();
  const softClusters: PromotableItem[][] = [];

  for (let i = 0; i < candidateSingles.length; i++) {
    const a = candidateSingles[i]!;
    if (used.has(a.id)) continue;
    const aClass = classifyEvent(a);
    const aToks = normTitleTokens(a.title);
    const group: PromotableItem[] = [a];
    used.add(a.id);

    for (let j = i + 1; j < candidateSingles.length; j++) {
      const b = candidateSingles[j]!;
      if (used.has(b.id)) continue;
      if (!closeInTime(a, b, 30)) continue;
      const bClass = classifyEvent(b);
      if (bClass.eventType !== aClass.eventType) continue;
      const sim = jaccard(aToks, normTitleTokens(b.title));
      if (sim >= 0.74) {
        group.push(b);
        used.add(b.id);
      }
    }

    softClusters.push(group);
  }

  return [...multi, ...softClusters];
}

function computeDecisionForCluster(cluster: PromotableItem[]): GlobalPromotionDecision {
  const representative = pickBestItem(cluster);
  const cls = classifyEvent(representative);
  const severity = EVENT_SEVERITY[cls.eventType as keyof typeof EVENT_SEVERITY] ?? 0.3;

  const contributions: PromotionContribution[] = [];
  let score = typeof representative.displayPriority === 'number' ? representative.displayPriority : 50;
  contributions.push({ code: 'base_displayPriority', delta: score - 50, message: 'Base: desk display priority' });

  const sevDelta = Math.round((severity - 0.3) * 30); // centered around generic_report-ish
  score += sevDelta;
  contributions.push({
    code: `event:${cls.eventType}`,
    delta: sevDelta,
    message: `Event severity (${cls.eventType})`,
  });

  const acc = accountabilityBoost(representative);
  score += acc;
  if (acc) {
    contributions.push({
      code: 'accountability',
      delta: acc,
      message: 'Accountability relevance (mission tags)',
    });
  }

  const prov = provenanceWeight(representative.provenanceClass);
  score += prov;
  contributions.push({ code: 'provenance', delta: prov, message: `Provenance class ${representative.provenanceClass}` });

  const hrs = hoursSince(representative.publishedAt);
  if (hrs != null) {
    const rec = hrs <= 2 ? 10 : hrs <= 6 ? 7 : hrs <= 18 ? 4 : hrs <= 48 ? 1 : 0;
    score += rec;
    if (rec) contributions.push({ code: 'freshness', delta: rec, message: 'Freshness (published time)' });
  }

  // Corroboration (multi-source / multi-lane / multi-family).
  const sources = new Set(cluster.map((x) => x.sourceSlug).filter(Boolean));
  const lanes = new Set(cluster.map((x) => x.deskLane ?? 'unknown').filter(Boolean));
  const families = new Set(cluster.map((x) => x.sourceFamily ?? 'general').filter(Boolean));
  const corroborationBoost = Math.min(12, Math.max(0, (sources.size - 1) * 4));
  score += corroborationBoost;
  if (corroborationBoost) {
    contributions.push({ code: 'corroboration', delta: corroborationBoost, message: 'Corroboration (multi-source)' });
  }
  if (lanes.size >= 2) {
    score += 4;
    contributions.push({ code: 'multi_lane', delta: 4, message: 'Corroboration (multi-lane)' });
  }
  if (families.size >= 2) {
    score += 4;
    contributions.push({ code: 'multi_family', delta: 4, message: 'Corroboration (multi-family)' });
  }

  // Penalize repeat coverage inside cluster: too many items from same source.
  const countBySource = new Map<string, number>();
  for (const it of cluster) {
    const k = it.sourceSlug || 'unknown';
    countBySource.set(k, (countBySource.get(k) ?? 0) + 1);
  }
  const maxSameSource = Math.max(...Array.from(countBySource.values()));
  if (maxSameSource >= 3 && sources.size === 1) {
    score -= 10;
    contributions.push({ code: 'repeat_penalty', delta: -10, message: 'Penalty: repeated coverage (single-source cluster)' });
  } else if (maxSameSource >= 4) {
    score -= 6;
    contributions.push({ code: 'repeat_penalty', delta: -6, message: 'Penalty: repeated coverage (same-source dominance)' });
  }

  // Statements/claims discipline: statement-like sources cannot overpower without corroboration.
  const statementLike = representative.deskLane === 'statements' || representative.trustWarningMode === 'source_controlled_official_claims';
  if (statementLike && (sources.size < 2 || families.size < 2)) {
    score -= 12;
    contributions.push({ code: 'claims_lane_penalty', delta: -12, message: 'Penalty: claims/statement surface without corroboration' });
  }

  const totalScore = clamp(score, 0, 100);

  const reasons: PromotionReasonCode[] = [];
  if (hrs != null && hrs <= 6 && severity >= 0.68 && totalScore >= 70) reasons.push('fresh_high_priority_event');
  if (representative.provenanceClass === 'PRIMARY') reasons.push('primary_source');
  if (cls.eventType === 'injunction' || cls.eventType === 'court_order' || (representative.missionTags ?? []).includes('courts')) {
    reasons.push('court_or_legal_action');
  }
  if (accountabilityBoost(representative) >= 10) reasons.push('accountability_signal');
  if (sources.size >= 2) reasons.push('corroborated_multi_source');
  if (lanes.size >= 2) reasons.push('corroborated_multi_lane');
  if (cls.eventType === 'contradiction') reasons.push('contradiction_or_evasion');
  if (cls.eventType === 'resignation' || cls.eventType === 'ethics_probe') reasons.push('resignation_or_ethics_signal');
  if (cls.eventType === 'executive_action' || cls.eventType === 'policy_change' || cls.eventType === 'sanctions_action') {
    reasons.push('major_government_action');
  }
  if (maxSameSource >= 3) reasons.push('repeat_coverage_penalty');
  if (statementLike && (sources.size < 2 || families.size < 2)) reasons.push('claims_lane_penalty');

  // Momentum: new item on an older cluster within window.
  const times = cluster
    .map((x) => (x.publishedAt ? new Date(x.publishedAt).getTime() : NaN))
    .filter((x) => Number.isFinite(x));
  if (times.length >= 2) {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const spanH = (max - min) / 3600000;
    if (spanH >= 10 && hrs != null && hrs <= 3) reasons.push('new_phase_in_active_story');
  }

  return {
    totalScore,
    reasons: Array.from(new Set(reasons)),
    contributions,
    eventType: cls.eventType,
    corroboration: {
      itemCount: cluster.length,
      sourceCount: sources.size,
      laneCount: lanes.size,
      familyCount: families.size,
    },
  };
}

export function promoteGlobally(items: PromotableItem[], opts?: { limit?: number }): PromotedCluster[] {
  const clusters = buildPromotionClusters(items);
  const enriched: PromotedCluster[] = clusters.map((c, idx) => {
    const rep = pickBestItem(c);
    const decision = computeDecisionForCluster(c);
    const clusterId = `pcl_${idx}_${rep.id}`;
    return { clusterId, representativeId: rep.id, representative: rep, items: c, decision };
  });

  const sorted = enriched.sort((a, b) => b.decision.totalScore - a.decision.totalScore);
  const limit = Math.max(1, Math.min(12, Number(opts?.limit) || 6));
  return sorted.slice(0, limit);
}

