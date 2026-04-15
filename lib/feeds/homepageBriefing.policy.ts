import type { BriefingLane } from '@/lib/feeds/homepageBriefing.weights';
import type { ProvenanceClass } from '@/lib/intel/types';

/** Items per desk slice merged into the promotion pool (before clustering). */
export const BRIEFING_PROMOTION_POOL_PER_DESK = 22;

/** Top items taken per lane/desk for lane backstop (after promotion + newswire). */
export const BRIEFING_CANDIDATES_PER_DESK = 8;

/** Max items from the same source slug in the final briefing (any phase). */
export const BRIEFING_MAX_PER_SOURCE = 2;

/** Max items from the same source family in the final briefing (any phase). */
export const BRIEFING_MAX_PER_SOURCE_FAMILY = 3;

export type BriefingCandidateOrigin = 'promoted' | 'lane_backstop' | 'newswire';

export type FreshnessBucket = 'unknown' | 'fresh' | 'recent' | 'day' | 'old' | 'stale';

/**
 * Buckets for inspectable metadata (deterministic thresholds on age in hours).
 * `unknown` is used when publishedAt is missing or invalid.
 */
export function freshnessBucketFromAgeHours(ageHours: number | null): FreshnessBucket {
  if (ageHours == null || !Number.isFinite(ageHours)) return 'unknown';
  if (ageHours <= 6) return 'fresh';
  if (ageHours <= 24) return 'recent';
  if (ageHours <= 72) return 'day';
  if (ageHours <= 168) return 'old';
  return 'stale';
}

/** Hours since published; null if unavailable. */
export function hoursSincePublished(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 3600000;
}

/**
 * Intel / desk items: multiplicative freshness after lane weighting.
 * Stale items decay aggressively so the live briefing prefers recency.
 */
export function intelFreshnessMultiplier(
  bucket: FreshnessBucket,
  briefLane: BriefingLane,
  provenanceClass: ProvenanceClass | undefined,
): number {
  let m = 1;
  switch (bucket) {
    case 'unknown':
      m = 0.78;
      break;
    case 'fresh':
      m = 1;
      break;
    case 'recent':
      m = 0.94;
      break;
    case 'day':
      m = 0.8;
      break;
    case 'old':
      m = 0.58;
      break;
    case 'stale':
      m = 0.32;
      break;
    default:
      m = 0.78;
  }

  if (provenanceClass === 'COMMENTARY' && (bucket === 'old' || bucket === 'stale')) {
    m *= 0.72;
  }

  if (briefLane === 'voices' && (bucket === 'old' || bucket === 'stale')) {
    m *= bucket === 'stale' ? 0.62 : 0.78;
  }

  return m;
}

/**
 * Newswire raw score already encodes recency; apply a lighter second pass so older wires
 * do not stay competitive purely on curation boosts.
 */
export function newswireFreshnessMultiplier(ageHours: number | null): number {
  if (ageHours == null || !Number.isFinite(ageHours)) return 0.82;
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.97;
  if (ageHours <= 72) return 0.9;
  if (ageHours <= 168) return 0.78;
  return 0.58;
}

/** Max age (hours) for an item to be eligible for lane-cap overflow / fallback fill. */
export const FALLBACK_MAX_AGE_HOURS: Record<BriefingLane, number> = {
  newswire: 84,
  osint: 96,
  watchdogs: 96,
  defense_ops: 96,
  voices: 42,
};

/** Minimum homepage briefing score (after lane weight × freshness) for fallback. */
export const FALLBACK_MIN_HOMEPAGE_SCORE: Record<BriefingLane, number> = {
  newswire: 34,
  osint: 34,
  watchdogs: 34,
  defense_ops: 34,
  voices: 50,
};

/**
 * Extra cap: max additional items per lane that can appear only via fallback (after primary pass).
 * Prevents stale voices from padding the rail.
 */
export const FALLBACK_MAX_EXTRA_PER_LANE: Record<BriefingLane, number> = {
  newswire: 2,
  osint: 3,
  watchdogs: 3,
  defense_ops: 3,
  voices: 1,
};

/** Voices + commentary: stricter fallback unless raw promotion/desk score proves strength. */
export const VOICES_COMMENTARY_FALLBACK_MAX_AGE_H = 36;
export const VOICES_COMMENTARY_FALLBACK_MIN_RAW = 72;

/** Hard cap on voices lane in the final stack (primary + fallback). */
export const BRIEFING_VOICES_MAX_TOTAL = 2;

/**
 * Drop very weak stale/old Voices commentary from both primary and fallback so the live rail
 * does not read like recycled takes. Deterministic; does not apply to non-commentary voices.
 */
export const VOICES_STALE_COMMENTARY_MIN_HOMEPAGE_SCORE = 26;

export function shouldSuppressVoicesStaleCommentary(
  entry: { kind: string; briefLane: BriefingLane; intelItem?: { publishedAt?: string | null; provenanceClass?: ProvenanceClass } },
  homepageBriefingScore: number,
  ageHours: number | null,
): boolean {
  if (entry.kind !== 'intel' || entry.briefLane !== 'voices') return false;
  if (entry.intelItem?.provenanceClass !== 'COMMENTARY') return false;
  const bucket = freshnessBucketFromAgeHours(ageHours);
  if (bucket !== 'stale' && bucket !== 'old') return false;
  return homepageBriefingScore < VOICES_STALE_COMMENTARY_MIN_HOMEPAGE_SCORE;
}
