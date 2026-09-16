import {
  THEME_CANDIDATE_MIN_SCORE,
  THEME_DETERMINISTIC_ACCEPT_SCORE,
  THEME_DETERMINISTIC_MIN_DISTINCTIVE,
  THEME_STRONG_SUBJECT_MIN_LENGTH,
} from '@/lib/themeMemory/constants';
import { tokenJaccard } from '@/lib/themeMemory/features';
import type { ThemeCandidateMatch, ThemeFingerprint, ThemeRecord } from '@/lib/themeMemory/themeTypes';

function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return [...new Set(a.filter((x) => setB.has(x)))];
}

function roundScore(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;
}

function hasDistinctiveAnchor(input: {
  sharedClusterKeys: string[];
  sharedStrongPhrases: string[];
  sharedStrongTokens: string[];
  sharedActions: string[];
}): boolean {
  if (input.sharedClusterKeys.length > 0) return true;
  if (input.sharedStrongPhrases.length > 0) return true;
  if (input.sharedStrongTokens.length >= 2) return true;
  if (input.sharedStrongTokens.length >= 1 && input.sharedActions.length >= 1) return true;
  if (input.sharedStrongTokens.some((token) => token.length >= THEME_STRONG_SUBJECT_MIN_LENGTH)) return true;
  return false;
}

export function scoreThemeCandidate(input: {
  item: ThemeFingerprint;
  theme: ThemeFingerprint;
  themeRecord: ThemeRecord;
  itemObservedAt?: string | null;
}): ThemeCandidateMatch {
  const sharedClusterKeys = Object.entries(input.item.clusterKeys)
    .filter(([key, value]) => input.theme.clusterKeys[key] && input.theme.clusterKeys[key] === value)
    .map(([key, value]) => `${key}:${value}`);
  const sharedDistinctive = intersect(input.item.distinctiveTokens, input.theme.distinctiveTokens);
  const sharedSupporting = intersect(input.item.supportingTokens || [], input.theme.supportingTokens || []);
  const sharedPhrases = intersect(input.item.phrases, input.theme.phrases);
  const sharedActions = intersect(input.item.actionHints, input.theme.actionHints);
  const sharedWeak = intersect(input.item.weakEntities, input.theme.weakEntities);
  const distinctiveAnchor = hasDistinctiveAnchor({
    sharedClusterKeys,
    sharedStrongPhrases: sharedPhrases,
    sharedStrongTokens: sharedDistinctive,
    sharedActions,
  });
  const weakEntityOnly =
    !distinctiveAnchor &&
    sharedSupporting.length === 0 &&
    (sharedWeak.length > 0 || (!sharedDistinctive.length && !sharedPhrases.length && !sharedClusterKeys.length && sharedWeak.length > 0));

  const reasons: string[] = [];
  let score = 0;

  if (sharedClusterKeys.length > 0) {
    score = 1;
    reasons.push(`shared_cluster_key:${sharedClusterKeys[0]}`);
  }

  if (sharedPhrases.length > 0) {
    score += Math.min(0.45, sharedPhrases.length * 0.22);
    reasons.push(`shared_phrase:${sharedPhrases[0]}`);
  }

  if (sharedDistinctive.length > 0) {
    const distinctiveJaccard = tokenJaccard(input.item.distinctiveTokens, input.theme.distinctiveTokens);
    score += Math.min(0.5, distinctiveJaccard * 0.7 + sharedDistinctive.length * 0.08);
    reasons.push(`shared_distinctive:${sharedDistinctive.slice(0, 4).join(',')}`);
    if (sharedDistinctive.length >= 2) {
      score += 0.2;
      reasons.push('aligned_event_anchors');
    }
  }

  if (sharedSupporting.length > 0 && distinctiveAnchor) {
    score += Math.min(0.12, sharedSupporting.length * 0.04);
    reasons.push(`supporting_feature:${sharedSupporting[0]}`);
  }

  if (sharedWeak.length > 0 && distinctiveAnchor) {
    score += 0.03;
    reasons.push(`weak_feature_support:${sharedWeak[0]}`);
  }

  if (sharedActions.length > 0 && sharedDistinctive.length > 0) {
    score += 0.1;
    reasons.push(`shared_action:${sharedActions[0]}`);
  }

  if (
    input.item.eventType &&
    input.theme.eventType &&
    input.item.eventType === input.theme.eventType &&
    sharedDistinctive.length > 0
  ) {
    score += 0.06;
    reasons.push(`shared_event_type:${input.item.eventType}`);
  }

  if (input.itemObservedAt && input.themeRecord.last_seen_at) {
    const itemMs = Date.parse(input.itemObservedAt);
    const themeMs = Date.parse(input.themeRecord.last_seen_at);
    if (Number.isFinite(itemMs) && Number.isFinite(themeMs)) {
      const days = Math.abs(itemMs - themeMs) / 86400000;
      if (days <= 3) score += 0.04;
      else if (days <= 14) score += 0.02;
    }
  }

  if (!distinctiveAnchor) {
    score = Math.min(score, sharedSupporting.length > 0 ? 0.28 : 0.15);
    if (sharedWeak.length > 0) reasons.push('weak_entity_only');
    else if (sharedSupporting.length > 0) reasons.push('supporting_features_without_anchor');
  }

  return {
    theme: input.themeRecord,
    score: roundScore(score),
    sharedDistinctive,
    sharedPhrases,
    sharedClusterKeys,
    sharedSupporting,
    distinctiveAnchor,
    weakEntityOnly: !distinctiveAnchor && sharedWeak.length > 0,
    reasons,
  };
}

export function isPlausibleThemeCandidate(match: ThemeCandidateMatch): boolean {
  if (match.weakEntityOnly) return false;
  if (!match.distinctiveAnchor) return false;
  if (match.sharedClusterKeys.length > 0) return true;
  if (match.score >= THEME_CANDIDATE_MIN_SCORE) return true;
  if (match.sharedPhrases.length > 0) return true;
  if (match.sharedDistinctive.some((token) => token.length >= THEME_STRONG_SUBJECT_MIN_LENGTH)) return true;
  return false;
}

export function isDeterministicThemeMatch(match: ThemeCandidateMatch): boolean {
  if (match.weakEntityOnly) return false;
  if (!match.distinctiveAnchor) return false;
  if (match.sharedClusterKeys.length > 0) return true;
  const strongSubjects = match.sharedDistinctive.filter((token) => token.length >= THEME_STRONG_SUBJECT_MIN_LENGTH);
  if (match.sharedPhrases.length >= 1 && match.sharedDistinctive.length >= 2 && match.score >= 0.55) {
    return true;
  }
  if (match.sharedDistinctive.length >= THEME_DETERMINISTIC_MIN_DISTINCTIVE && match.score >= THEME_DETERMINISTIC_ACCEPT_SCORE) {
    return true;
  }
  if (strongSubjects.length >= 1 && match.sharedDistinctive.length >= 2 && match.score >= 0.6) {
    return true;
  }
  return false;
}

export function rankThemeCandidates(matches: ThemeCandidateMatch[]): ThemeCandidateMatch[] {
  return [...matches].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.theme.id.localeCompare(b.theme.id);
  });
}
