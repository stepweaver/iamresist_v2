import {
  HEADLINE_TIMELINE_WINDOW_HOURS,
  RANK_CROSS_SOURCE_BONUS,
  RANK_PER_UNIQUE_CREATOR,
  RANK_PER_UNIQUE_NEWS_SOURCE,
  RANK_RECENCY_MAX,
  RANK_REPEAT_CAP,
  RANK_REPEAT_PER_EXTRA,
} from '@/lib/headlineTimeline/constants';
import { timeMs } from '@/lib/headlineTimeline/similarity';
import type { HeadlineCandidate, HeadlineRank } from '@/lib/headlineTimeline/types';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Primary /brief timeline gate.
 * A cluster is shown only when publishing has converged:
 * two creators, two news sources, or one of each.
 * Singleton clusters stay in the cluster pass so a later related item can qualify them.
 */
export function qualifiesForPrimaryTimeline(counts: {
  uniqueCreators: number;
  uniqueNewsSources: number;
}): boolean {
  if (counts.uniqueCreators >= 2) return true;
  if (counts.uniqueCreators >= 1 && counts.uniqueNewsSources >= 1) return true;
  if (counts.uniqueNewsSources >= 2) return true;
  return false;
}

/**
 * Prominence from distinct creators, distinct news sources, cross-source presence, and recency.
 * Extra posts from a source already counted are capped.
 */
export function scoreHeadlineMembers(
  members: Array<Pick<HeadlineCandidate, 'sourceId' | 'sourceKind' | 'publishedAt'>>,
  now: Date,
): HeadlineRank {
  const creators = new Set<string>();
  const news = new Set<string>();
  let latestMs: number | null = null;
  let latestAt: string | null = null;

  for (const member of members) {
    if (member.sourceKind === 'creator') creators.add(member.sourceId);
    else news.add(member.sourceId);
    const stamp = timeMs(member.publishedAt);
    if (stamp != null && (latestMs == null || stamp > latestMs)) {
      latestMs = stamp;
      latestAt = member.publishedAt;
    }
  }

  const uniqueCreators = creators.size;
  const uniqueNewsSources = news.size;
  const itemCount = members.length;
  const extras = Math.max(0, itemCount - uniqueCreators - uniqueNewsSources);
  const repeatPoints = Math.min(RANK_REPEAT_CAP, extras * RANK_REPEAT_PER_EXTRA);
  const crossSource = uniqueCreators > 0 && uniqueNewsSources > 0;
  const crossSourcePoints = crossSource ? RANK_CROSS_SOURCE_BONUS : 0;

  let recencyPoints = 0;
  if (latestMs != null) {
    const ageHours = Math.max(0, (now.getTime() - latestMs) / 3600000);
    const freshness = Math.max(0, 1 - ageHours / HEADLINE_TIMELINE_WINDOW_HOURS);
    recencyPoints = round1(RANK_RECENCY_MAX * freshness);
  }

  const creatorPoints = uniqueCreators * RANK_PER_UNIQUE_CREATOR;
  const newsPoints = uniqueNewsSources * RANK_PER_UNIQUE_NEWS_SOURCE;
  const score = round1(creatorPoints + newsPoints + crossSourcePoints + recencyPoints + repeatPoints);

  return {
    score,
    uniqueCreators,
    uniqueNewsSources,
    itemCount,
    crossSource,
    creatorPoints,
    newsPoints,
    crossSourcePoints,
    recencyPoints,
    repeatPoints,
    latestAt,
  };
}
