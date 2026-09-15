import { THEME_LIFECYCLE_THRESHOLDS } from '@/lib/themeMemory/constants';
import type { ThemeLifecycle } from '@/lib/themeMemory/themeTypes';

export type ThemeLifecycleInput = {
  firstSeenAt: string;
  lastCreatorActivityAt: string | null;
  now: string;
  activeDays7: number;
  activeDays14: number;
  creatorMomentum: number;
  todayCreatorItemCount: number;
  previousLifecycle: ThemeLifecycle | null;
};

function utcDayDiff(laterIso: string, earlierIso: string): number {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return 0;
  return Math.max(0, Math.floor((later - earlier) / 86400000));
}

/**
 * Deterministic lifecycle. No AI.
 *
 * new: first appeared recently and limited history
 * developing: active on multiple recent days and attention increasing
 * persistent: present across several distinct days
 * cooling: previously active but activity recently falling
 * resurging: inactive/cooling period followed by significant new activity
 * dormant: no meaningful creator activity for the configured gap
 */
export function resolveThemeLifecycle(input: ThemeLifecycleInput): ThemeLifecycle {
  const t = THEME_LIFECYCLE_THRESHOLDS;
  const ageDays = utcDayDiff(input.now, input.firstSeenAt);
  const daysSinceCreator = input.lastCreatorActivityAt
    ? utcDayDiff(input.now, input.lastCreatorActivityAt)
    : Number.POSITIVE_INFINITY;
  const previous = input.previousLifecycle;
  const wasQuiet = previous === 'dormant' || previous === 'cooling';

  if (daysSinceCreator >= t.DORMANT_DAYS_WITHOUT_CREATOR) {
    return 'dormant';
  }

  if (
    wasQuiet &&
    input.todayCreatorItemCount >= t.RESURGE_MIN_TODAY_CREATOR_ITEMS &&
    (previous === 'dormant' || input.creatorMomentum >= t.RESURGE_MIN_MOMENTUM)
  ) {
    return 'resurging';
  }

  if (input.activeDays14 >= t.PERSISTENT_MIN_ACTIVE_DAYS_14) {
    return 'persistent';
  }

  if (
    daysSinceCreator >= t.COOLING_MIN_DAYS_SINCE_ACTIVITY &&
    input.creatorMomentum <= t.COOLING_MAX_MOMENTUM &&
    input.activeDays14 >= t.COOLING_MIN_ACTIVE_DAYS_14
  ) {
    return 'cooling';
  }

  if (
    input.activeDays7 >= t.DEVELOPING_MIN_ACTIVE_DAYS_7 &&
    (input.creatorMomentum >= t.DEVELOPING_MIN_MOMENTUM || input.activeDays14 >= 3)
  ) {
    return 'developing';
  }

  if (ageDays <= t.NEW_MAX_AGE_DAYS && input.activeDays14 <= t.NEW_MAX_ACTIVE_DAYS_14) {
    return 'new';
  }

  if (input.activeDays7 >= t.DEVELOPING_MIN_ACTIVE_DAYS_7) {
    return 'developing';
  }

  if (daysSinceCreator >= t.COOLING_MIN_DAYS_SINCE_ACTIVITY) {
    return 'cooling';
  }

  return ageDays <= t.NEW_MAX_AGE_DAYS ? 'new' : 'developing';
}
