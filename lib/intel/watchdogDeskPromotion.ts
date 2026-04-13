import type { DisplayBucket } from '@/lib/intel/displayPriority';

export type DeskItemForPromotion = {
  id: string;
  displayBucket: DisplayBucket;
  displayPriority: number;
  displayExplanations: { ruleId: string; message: string }[];
  relevanceExplanations?: { ruleId: string; message: string }[];
  sourceSlug: string;
  sourceFamily?: string | null;
  provenanceClass: string;
  missionTags: string[];
  clusterKeys: Record<string, string>;
  publishedAt: string | null;
  surfaceState?: string;
  indicator_class?: string | null;
};

const DEFAULT_WINDOW_HOURS = 48;

function hoursBetween(isoA: string | null, isoB: string | null): number | null {
  if (!isoA || !isoB) return null;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(a - b) / (60 * 60 * 1000);
}

function withinWindow(
  publishedAt: string | null,
  otherPublishedAt: string | null,
  windowHours: number,
): boolean {
  const h = hoursBetween(publishedAt, otherPublishedAt);
  if (h == null) return false;
  return h <= windowHours;
}

function sharedClusterCorroboration(
  it: DeskItemForPromotion,
  pool: DeskItemForPromotion[],
  windowHours: number,
): boolean {
  const ck = it.clusterKeys;
  if (!ck || typeof ck !== 'object') return false;
  for (const [k, v] of Object.entries(ck)) {
    if (!v || typeof v !== 'string') continue;
    const comp = `${k}:${v}`;
    for (const o of pool) {
      if (o.id === it.id) continue;
      if (!withinWindow(it.publishedAt, o.publishedAt, windowHours)) continue;
      const ock = o.clusterKeys;
      if (!ock || typeof ock !== 'object') continue;
      for (const [ok, ov] of Object.entries(ock)) {
        if (!ov || typeof ov !== 'string') continue;
        if (`${ok}:${ov}` === comp) return true;
      }
    }
  }
  return false;
}

/** Another item in the window shares a mission tag from a different outlet (cross-source corroboration). */
function missionTagCrossOutletCorroboration(
  it: DeskItemForPromotion,
  pool: DeskItemForPromotion[],
  windowHours: number,
): boolean {
  const tags = new Set((it.missionTags ?? []).filter(Boolean));
  if (tags.size === 0) return false;

  for (const o of pool) {
    if (o.id === it.id) continue;
    if (o.sourceSlug === it.sourceSlug) continue;
    if (!withinWindow(it.publishedAt, o.publishedAt, windowHours)) continue;
    for (const t of o.missionTags ?? []) {
      if (tags.has(t)) return true;
    }
  }
  return false;
}

/**
 * Watchdogs desk: do not allow `lead` display bucket without deterministic corroboration
 * (shared cluster key in window, or two distinct source families on a shared mission tag in window).
 */
export function applyWatchdogLeadCorroborationRules(
  items: DeskItemForPromotion[],
  deskLane: string,
  opts?: { windowHours?: number },
): DeskItemForPromotion[] {
  if (deskLane !== 'watchdogs') return items;
  const windowHours = opts?.windowHours ?? DEFAULT_WINDOW_HOURS;
  const pool = items.filter((x) => x.surfaceState !== 'suppressed');

  return items.map((it) => {
    if (it.surfaceState === 'suppressed') return it;
    if (it.displayBucket !== 'lead') return it;
    if ((it.sourceFamily ?? '') !== 'watchdog_global') return it;

    const okCluster = sharedClusterCorroboration(it, pool, windowHours);
    const okCrossOutlet = missionTagCrossOutletCorroboration(it, pool, windowHours);
    if (okCluster || okCrossOutlet) return it;

    const msg =
      'Watchdogs promotion: lead blocked without corroboration (no shared cluster key or cross-family mission tag within window).';
    return {
      ...it,
      displayBucket: 'secondary' as DisplayBucket,
      displayPriority: Math.min(it.displayPriority, 72),
      displayExplanations: [
        ...it.displayExplanations,
        { ruleId: 'watchdogs:corroboration_cap', message: msg },
      ],
    };
  });
}

const ANECDOTAL_CAP_MSG =
  'Anecdotal indicator: display capped to routine (never hero without independent hard signals).';

/** Never surface anecdotal thermometer rows as lead/secondary. */
export function applyAnecdotalIndicatorClassCaps(
  items: DeskItemForPromotion[],
): DeskItemForPromotion[] {
  return items.map((it) => {
    if (it.indicator_class !== 'anecdotal') return it;
    if (it.displayBucket === 'routine') {
      return {
        ...it,
        displayPriority: Math.min(it.displayPriority, 32),
      };
    }
    const ex = [...(it.relevanceExplanations ?? []), { ruleId: 'indicator:anecdotal_cap', message: ANECDOTAL_CAP_MSG }];
    return {
      ...it,
      displayBucket: 'routine',
      displayPriority: Math.min(it.displayPriority, 32),
      displayExplanations: [...it.displayExplanations, { ruleId: 'indicator:anecdotal_cap', message: ANECDOTAL_CAP_MSG }],
      relevanceExplanations: ex,
    };
  });
}
