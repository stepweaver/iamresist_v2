/**
 * Lane weights for homepage Live Briefing merge.
 * Applied as: weightedScore = rawScore * weight (rawScore is 0–100 for intel and bridged newswire).
 */
export type BriefingLane =
  | 'newswire'
  | 'osint'
  | 'watchdogs'
  | 'defense_ops'
  | 'voices';

export const BRIEFING_LANE_WEIGHT: Record<BriefingLane, number> = {
  newswire: 0.98,
  osint: 1,
  watchdogs: 1.02,
  defense_ops: 1,
  /** Commentary lane: surfaces only when raw score is unusually high after weighting. */
  voices: 0.88,
};

/** Top items taken per lane/desk for lane backstop (see `homepageBriefing.policy.ts`). */
export { BRIEFING_CANDIDATES_PER_DESK } from './homepageBriefing.policy';

/** Max newswire stories considered (pre-merge), diversity-picked then scored. */
export const BRIEFING_NEWSWIRE_POOL = 12;

/** Final slot count: 1 hero + (total - 1) supporting. */
export const BRIEFING_TOTAL_SLOTS = 5;

/** Max items from the same brief lane in the final rail (after dedupe). */
export const BRIEFING_MAX_PER_LANE = 2;

export function briefingLaneLabel(lane: BriefingLane | string): string {
  if (lane === 'voices') return 'Voices';
  if (lane === 'watchdogs') return 'Watchdogs';
  if (lane === 'defense_ops') return 'Defense';
  if (lane === 'osint') return 'OSINT';
  if (lane === 'newswire') return 'Newswire';
  return 'Intel';
}
