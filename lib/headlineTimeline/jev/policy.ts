import { JEV_SAME_EVENT_JOIN_THRESHOLD } from '@/lib/headlineTimeline/jev/constants';
import type { JevClassificationResult, JevPairPolicyDecision } from '@/lib/headlineTimeline/jev/types';

function fmt(value: number): string {
  return value.toFixed(3);
}

/**
 * Evaluation-only join policy. Same broader topic, different, unclear,
 * low confidence, and any Jev failure never propose an automatic join.
 */
export function decideJevPairPolicy(
  result: JevClassificationResult,
  threshold = JEV_SAME_EVENT_JOIN_THRESHOLD,
): JevPairPolicyDecision {
  if (!result.ok) {
    return { action: 'review', reason: `jev unavailable: ${result.error}` };
  }

  if (result.relation === 'same_broader_topic') {
    return { action: 'do_not_join', reason: 'same_broader_topic does not join an event cluster' };
  }

  if (result.relation === 'different') {
    return { action: 'do_not_join', reason: 'different events do not join' };
  }

  if (result.relation === 'unclear') {
    return { action: 'review', reason: 'unclear relationship' };
  }

  const probability = result.probabilities.same_event;
  if (probability >= threshold && result.confidence >= threshold) {
    return {
      action: 'join',
      reason: `same_event probability ${fmt(probability)} and confidence ${fmt(result.confidence)} meet the join threshold ${fmt(threshold)}`,
    };
  }

  return {
    action: 'review',
    reason: `same_event probability ${fmt(probability)} and confidence ${fmt(result.confidence)} do not both meet the join threshold ${fmt(threshold)}`,
  };
}
