/**
 * Application-side AI membership acceptance.
 * Schema validation stays in validate.ts. This only decides whether a valid
 * model decision is allowed to attach an item to a theme.
 *
 * Accepted membership must cite at least one concrete shared core anchor
 * already present in the deterministic overlap. Do not accept a model
 * that invents a topical bridge with no event-level feature in common.
 */

import { featureStrength, isLowInformationFeature, phraseStrength } from '@/lib/themeMemory/featureStrength';
import type { ThemeMembershipClassifyInput } from '@/lib/themeMemory/ai/types';
import type { ThemeCandidateMatch, ThemeMembershipDecision } from '@/lib/themeMemory/themeTypes';

export type ThemeAIMembershipAcceptance = {
  accept: boolean;
  reason: string | null;
};

function isUsableAnchor(value: string): boolean {
  const cleaned = String(value || '').trim();
  if (!cleaned) return false;
  if (cleaned.includes(':')) return true;
  if (cleaned.includes(' ')) return phraseStrength(cleaned) === 'strong';
  return featureStrength(cleaned) === 'strong' && !isLowInformationFeature(cleaned);
}

export function shouldAcceptAIMembership(input: {
  decision: ThemeMembershipDecision;
  match: ThemeCandidateMatch;
  classifyInput: ThemeMembershipClassifyInput;
}): ThemeAIMembershipAcceptance {
  void input.classifyInput;
  if (!input.decision.belongs) {
    return { accept: false, reason: 'ai_does_not_belong' };
  }
  if (input.decision.confidence < 0.55) {
    return { accept: false, reason: 'ai_confidence_below_threshold' };
  }
  if (!input.match.distinctiveAnchor) {
    return { accept: false, reason: 'ai_rejected_no_distinctive_anchor' };
  }

  const suppliedAnchors = [
    ...input.match.sharedDistinctive,
    ...input.match.sharedPhrases,
    ...input.match.sharedClusterKeys,
  ].filter(isUsableAnchor);
  if (suppliedAnchors.length === 0) {
    return { accept: false, reason: 'ai_rejected_no_shared_core_anchor' };
  }

  return { accept: true, reason: null };
}
