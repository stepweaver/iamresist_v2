export const STORY_COHERENCE_MAX_AGE_DELTA_HOURS = 48;

const STORY_COHERENCE_STOP_TOKENS = new Set([
  'about',
  'after',
  'amid',
  'amidst',
  'analysis',
  'around',
  'before',
  'commentary',
  'explainer',
  'latest',
  'live',
  'more',
  'news',
  'over',
  'report',
  'reports',
  'story',
  'says',
  'said',
  'that',
  'their',
  'there',
  'these',
  'this',
  'update',
  'updates',
  'what',
  'when',
  'where',
  'with',
  'would',
]);

export type StoryCoherenceMetrics = {
  sharedTokens: number;
  overlapScore: number;
  sharedEventType: boolean;
};

export function storyTextTokens(text: string | null | undefined): string[] {
  const normalized = String(text ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STORY_COHERENCE_STOP_TOKENS.has(token))
    .slice(0, 28);
}

export function storyTokenOverlapCount(a: string[], b: string[]): number {
  const bSet = new Set(b);
  let count = 0;
  for (const token of a) {
    if (bSet.has(token)) count += 1;
  }
  return count;
}

export function storyTokenJaccard(a: string[], b: string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function storyPublishedWithinWindow(
  anchorPublishedAt: string | null | undefined,
  candidatePublishedAt: string | null | undefined,
  maxAgeDeltaHours = STORY_COHERENCE_MAX_AGE_DELTA_HOURS,
): boolean {
  if (!anchorPublishedAt || !candidatePublishedAt) return true;
  const anchorTime = new Date(anchorPublishedAt).getTime();
  const candidateTime = new Date(candidatePublishedAt).getTime();
  if (!Number.isFinite(anchorTime) || !Number.isFinite(candidateTime)) return true;
  return Math.abs(anchorTime - candidateTime) / 3600000 <= maxAgeDeltaHours;
}

export function evaluateStoryCoherence(params: {
  anchorText: string | null | undefined;
  candidateText: string | null | undefined;
  anchorPublishedAt?: string | null;
  candidatePublishedAt?: string | null;
  anchorEventType?: string | null;
  candidateEventType?: string | null;
  minSharedTokens?: number;
}): StoryCoherenceMetrics | null {
  const {
    anchorText,
    candidateText,
    anchorPublishedAt,
    candidatePublishedAt,
    anchorEventType,
    candidateEventType,
    minSharedTokens = 3,
  } = params;

  if (!storyPublishedWithinWindow(anchorPublishedAt, candidatePublishedAt)) return null;

  const anchorTokens = storyTextTokens(anchorText);
  const candidateTokens = storyTextTokens(candidateText);
  if (anchorTokens.length === 0 || candidateTokens.length === 0) return null;

  const sharedTokens = storyTokenOverlapCount(anchorTokens, candidateTokens);
  const overlapScore = storyTokenJaccard(anchorTokens, candidateTokens);
  const sharedEventType =
    Boolean(anchorEventType) &&
    Boolean(candidateEventType) &&
    String(anchorEventType) === String(candidateEventType);

  const sameStory =
    sharedTokens >= Math.max(minSharedTokens + 1, 4) ||
    (sharedTokens >= minSharedTokens && overlapScore >= 0.2) ||
    Boolean(sharedEventType && sharedTokens >= 2 && overlapScore >= 0.15);

  if (!sameStory) return null;

  return {
    sharedTokens,
    overlapScore: Math.round(overlapScore * 1000) / 1000,
    sharedEventType,
  };
}
