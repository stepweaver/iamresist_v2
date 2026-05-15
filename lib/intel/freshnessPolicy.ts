/**
 * Centralized desk freshness policy.
 *
 * Freshness is a hard display eligibility rule, not merely a scoring bonus.
 * Each lane/surface pair has a max-age budget; items that exceed it are demoted
 * or excluded before lead selection runs.
 */

export type IntelDeskLane =
  | 'newswire'
  | 'osint'
  | 'watchdogs'
  | 'defense_ops'
  | 'voices'
  | 'statements'
  | 'indicators'
  | 'default';

export type DeskSurface =
  | 'homepage'
  | 'lead'
  | 'secondary'
  | 'defaultVisible'
  | 'background';

export type FreshnessBucket =
  | 'breaking'
  | 'fresh'
  | 'recent'
  | 'aging'
  | 'stale'
  | 'archive';

export type FreshnessPolicy = {
  leadMaxAgeHours: number;
  secondaryMaxAgeHours: number;
  defaultVisibleMaxAgeHours: number;
  homepageMaxAgeHours: number;
  archiveAfterHours: number;
};

export const DESK_FRESHNESS_POLICY: Record<IntelDeskLane, FreshnessPolicy> = {
  newswire: {
    leadMaxAgeHours: 36,
    secondaryMaxAgeHours: 72,
    defaultVisibleMaxAgeHours: 168,
    homepageMaxAgeHours: 72,
    archiveAfterHours: 336,
  },
  osint: {
    leadMaxAgeHours: 96,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
  watchdogs: {
    leadMaxAgeHours: 96,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
  defense_ops: {
    leadMaxAgeHours: 72,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
  voices: {
    leadMaxAgeHours: 36,
    secondaryMaxAgeHours: 72,
    defaultVisibleMaxAgeHours: 168,
    homepageMaxAgeHours: 42,
    archiveAfterHours: 336,
  },
  statements: {
    leadMaxAgeHours: 96,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
  indicators: {
    leadMaxAgeHours: 72,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
  default: {
    leadMaxAgeHours: 72,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
};

/** Age thresholds (hours) for freshness bucket boundaries. */
const BUCKET_THRESHOLDS = { breaking: 2, fresh: 12, recent: 48, aging: 96, stale: 336 } as const;

/** Parses publishedAt to ms epoch. Returns null if missing or invalid. */
export function getPublishedAtMs(
  itemOrIso: string | { publishedAt?: string | null } | null | undefined,
): number | null {
  const iso = typeof itemOrIso === 'string' ? itemOrIso : (itemOrIso?.publishedAt ?? null);
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Returns age in fractional hours, or null if publishedAt is missing or invalid.
 * `now` is an epoch-ms value (defaults to Date.now()).
 */
export function getAgeHours(
  itemOrIso: string | { publishedAt?: string | null } | null | undefined,
  now: number = Date.now(),
): number | null {
  const t = getPublishedAtMs(itemOrIso);
  return t === null ? null : (now - t) / 3600000;
}

/** Maps an age in fractional hours to a FreshnessBucket label. */
export function getFreshnessBucket(ageHours: number): FreshnessBucket {
  if (ageHours <= BUCKET_THRESHOLDS.breaking) return 'breaking';
  if (ageHours <= BUCKET_THRESHOLDS.fresh) return 'fresh';
  if (ageHours <= BUCKET_THRESHOLDS.recent) return 'recent';
  if (ageHours <= BUCKET_THRESHOLDS.aging) return 'aging';
  if (ageHours <= BUCKET_THRESHOLDS.stale) return 'stale';
  return 'archive';
}

/** Returns the freshness policy for a desk lane, falling back to `default`. */
export function getFreshnessPolicyForLane(lane: string | null | undefined): FreshnessPolicy {
  return (
    DESK_FRESHNESS_POLICY[(lane ?? 'default') as IntelDeskLane] ??
    DESK_FRESHNESS_POLICY.default
  );
}

/** Alias kept for callers that already use policyForLane(). */
export const policyForLane = getFreshnessPolicyForLane;

function maxHoursForSurface(policy: FreshnessPolicy, surface: DeskSurface): number {
  if (surface === 'lead') return policy.leadMaxAgeHours;
  if (surface === 'secondary') return policy.secondaryMaxAgeHours;
  if (surface === 'defaultVisible') return policy.defaultVisibleMaxAgeHours;
  if (surface === 'homepage') return policy.homepageMaxAgeHours;
  return policy.archiveAfterHours; // background
}

/**
 * Returns true when the item is fresh enough for the given surface.
 *
 * Missing or invalid publishedAt returns false for lead, secondary,
 * defaultVisible, and homepage. Only background is permissive about
 * missing timestamps.
 */
export function isFreshEnoughForSurface({
  item,
  lane,
  surface,
  now = Date.now(),
}: {
  item: string | { publishedAt?: string | null } | null | undefined;
  lane: string | null | undefined;
  surface: DeskSurface;
  now?: number;
}): boolean {
  const ageHours = getAgeHours(item, now);
  if (ageHours === null) return surface === 'background';
  return ageHours <= maxHoursForSurface(getFreshnessPolicyForLane(lane), surface);
}

/**
 * Returns a human-readable exclusion reason, or null if the item is fresh enough.
 * Missing or invalid publishedAt produces a reason for every surface except background.
 */
export function getFreshnessExclusionReason({
  item,
  lane,
  surface,
  now = Date.now(),
}: {
  item: string | { publishedAt?: string | null } | null | undefined;
  lane: string | null | undefined;
  surface: DeskSurface;
  now?: number;
}): string | null {
  const ageHours = getAgeHours(item, now);
  if (ageHours === null) {
    if (surface === 'background') return null;
    return `Missing or invalid publishedAt — excluded from ${surface}.`;
  }
  const maxHours = maxHoursForSurface(getFreshnessPolicyForLane(lane), surface);
  if (ageHours <= maxHours) return null;
  return `Age ${ageHours.toFixed(1)}h exceeds ${surface} max ${maxHours}h for lane "${lane ?? 'default'}".`;
}

/**
 * Returns true when the item's age is within the allowed budget for the
 * given lane/surface combination.
 *
 * Missing or invalid publishedAt returns false for all surfaces except
 * background. (The previous behavior of passing unknown-age items was a bug.)
 */
export function passesAgeGate(
  publishedAt: string | null | undefined,
  lane: string | null | undefined,
  surface: DeskSurface,
): boolean {
  return isFreshEnoughForSurface({ item: publishedAt, lane, surface });
}
