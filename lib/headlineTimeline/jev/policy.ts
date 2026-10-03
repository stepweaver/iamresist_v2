import { JEV_SAME_EVENT_JOIN_THRESHOLD } from '@/lib/headlineTimeline/jev/constants';
import type { JevClassificationResult, JevPairPolicyDecision } from '@/lib/headlineTimeline/jev/types';

function fmt(value: number): string {
  return value.toFixed(3);
}

/**
 * Evaluation-only join policy. This does not cluster /brief.
 * same_event may propose a join only when both scores clear the threshold.
 * same_story is reported as a future story-link and does not join an event cluster.
 * related_context, different, unclear, low confidence, and any Jev failure do not join.
 * related_context is not a story-link.
 */
export function decideJevPairPolicy(
  result: JevClassificationResult,
  threshold = JEV_SAME_EVENT_JOIN_THRESHOLD,
): JevPairPolicyDecision {
  if (!result.ok) {
    return { action: 'review', reason: `jev unavailable: ${result.error}` };
  }

  switch (result.relation) {
    case 'same_story':
      return {
        action: 'story_link',
        reason: 'same_story is a potential future story-link and does not join an event cluster',
      };
    case 'related_context':
      return {
        action: 'do_not_join',
        reason: 'related_context does not join an event cluster and is not a story-link',
      };
    case 'different':
      return { action: 'do_not_join', reason: 'different subjects do not join' };
    case 'unclear':
      return { action: 'review', reason: 'unclear relationship' };
    case 'same_event': {
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
    default: {
      const unexpected: never = result.relation;
      return { action: 'review', reason: `unexpected relation ${String(unexpected)}` };
    }
  }
}
