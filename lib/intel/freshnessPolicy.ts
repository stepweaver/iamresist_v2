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
  default: {
    leadMaxAgeHours: 72,
    secondaryMaxAgeHours: 168,
    defaultVisibleMaxAgeHours: 336,
    homepageMaxAgeHours: 96,
    archiveAfterHours: 720,
  },
};

/** Returns the freshness policy for a desk lane, falling back to `default`. */
export function policyForLane(lane: string | null | undefined): FreshnessPolicy {
  return (
    DESK_FRESHNESS_POLICY[(lane ?? 'default') as IntelDeskLane] ??
    DESK_FRESHNESS_POLICY.default
  );
}

/**
 * Returns true when the item's age is within the allowed budget for the
 * given lane/surface combination.
 *
 * Items with no publishedAt pass by default — the caller must decide
 * separately whether unknown-age items are acceptable.
 */
export function passesAgeGate(
  publishedAt: string | null | undefined,
  lane: string | null | undefined,
  surface: DeskSurface,
): boolean {
  if (!publishedAt) return true;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return true;

  const policy = policyForLane(lane);
  const maxHours =
    surface === 'lead'
      ? policy.leadMaxAgeHours
      : surface === 'secondary'
        ? policy.secondaryMaxAgeHours
        : surface === 'defaultVisible'
          ? policy.defaultVisibleMaxAgeHours
          : surface === 'homepage'
            ? policy.homepageMaxAgeHours
            : policy.archiveAfterHours;

  const ageH = (Date.now() - t) / 3600000;
  return ageH <= maxHours;
}
