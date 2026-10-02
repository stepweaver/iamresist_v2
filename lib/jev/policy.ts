import { JEV_NOUL_THRESHOLDS } from '@/lib/jev/constants';
import type { ShadowRecommendation } from '@/lib/jev/types';

/**
 * A recorded merge is intentionally hard.
 * The bounded candidate Choice, the pair event-identity Choice, and the
 * same-event Noul must all agree. Anything else stays a split or a review.
 * This function does not write.
 */
export function pairRecommendation(input: {
  candidateChoice: string | null;
  candidateId: string;
  pairChoice: string | null;
  noul: number | null;
  noulThreshold: number;
}): ShadowRecommendation {
  const noulAgrees = input.noul != null && Number.isFinite(input.noul) && input.noul >= input.noulThreshold;
  if (input.candidateChoice === input.candidateId && input.pairChoice === 'same_event' && noulAgrees) {
    return 'merge';
  }
  return 'review_or_split';
}

export function recommendationsAtThresholds(input: {
  candidateChoice: string | null;
  candidateId: string;
  pairChoice: string | null;
  noul: number | null;
}): Record<string, ShadowRecommendation> {
  const recommendations: Record<string, ShadowRecommendation> = {};
  for (const noulThreshold of JEV_NOUL_THRESHOLDS) {
    recommendations[String(noulThreshold)] = pairRecommendation({ ...input, noulThreshold });
  }
  return recommendations;
}

/** Pair Choice plus Noul, without the bounded candidate Choice. */
export function sameEventChoiceAndNoul(input: {
  pairChoice: string | null;
  noul: number | null;
  noulThreshold: number;
}): boolean {
  return input.pairChoice === 'same_event' && input.noul != null && Number.isFinite(input.noul) && input.noul >= input.noulThreshold;
}
