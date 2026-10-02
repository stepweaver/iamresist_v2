export type {
  AttachedCreatorNote,
  HeadlineCandidate,
  HeadlineChannel,
  HeadlineCluster,
  HeadlineCreatorDiscussion,
  HeadlineNoteSeed,
  HeadlineRank,
  HeadlineSourceKind,
  HeadlineTimeline,
  HeadlineTimelineDay,
  TitleProfile,
} from '@/lib/headlineTimeline/types';

export {
  HEADLINE_CLUSTER_LEXICAL_SIMILARITY,
  HEADLINE_CLUSTER_MIN_SIMILARITY,
  HEADLINE_NOTES_PER_CREATOR,
  HEADLINE_TIMELINE_DISPLAY_LIMIT,
  HEADLINE_TIMELINE_FETCH_LIMIT,
  HEADLINE_TIMELINE_TIME_ZONE,
  HEADLINE_TIMELINE_WINDOW_HOURS,
  RANK_CROSS_SOURCE_BONUS,
  RANK_PER_UNIQUE_CREATOR,
  RANK_PER_UNIQUE_NEWS_SOURCE,
  RANK_RECENCY_MAX,
  RANK_REPEAT_CAP,
} from '@/lib/headlineTimeline/constants';

export { cleanupDisplayTitle, profileTitle } from '@/lib/headlineTimeline/normalize';
export { compareTitles, titleSimilarity, titlesShouldCluster, withinHeadlineWindow } from '@/lib/headlineTimeline/similarity';
export { qualifiesForPrimaryTimeline, scoreHeadlineMembers } from '@/lib/headlineTimeline/rank';
export { clusterHeadlineCandidates, representativeMember } from '@/lib/headlineTimeline/cluster';
export { buildHeadlineTimeline, formatHeadlineAge, headlineDayKey, headlineDayLabel } from '@/lib/headlineTimeline/build';
export { formatHeadlineTimelineReport } from '@/lib/headlineTimeline/report';
