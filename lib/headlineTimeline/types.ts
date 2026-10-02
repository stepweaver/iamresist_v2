export type HeadlineSourceKind = 'creator' | 'news';

export type HeadlineChannel = 'voices' | 'newswire' | 'intel';

/** One published title. Source records are not mutated. */
export type HeadlineCandidate = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceKind: HeadlineSourceKind;
  channel: HeadlineChannel;
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
};

export type HeadlineNoteSeed = {
  id: string;
  sourceItemId: string;
  kind: string;
  text: string;
  contentRole?: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  createdAt: string | null;
};

export type HeadlineRank = {
  score: number;
  uniqueCreators: number;
  uniqueNewsSources: number;
  itemCount: number;
  crossSource: boolean;
  creatorPoints: number;
  newsPoints: number;
  crossSourcePoints: number;
  recencyPoints: number;
  repeatPoints: number;
  latestAt: string | null;
};

export type AttachedCreatorNote = {
  id: string;
  text: string;
  kind: string;
  startSeconds: number | null;
  endSeconds: number | null;
  evidenceUrl: string | null;
};

export type HeadlineCreatorDiscussion = {
  creatorId: string;
  creatorName: string;
  links: Array<{ title: string; url: string }>;
  notes: AttachedCreatorNote[];
};

export type HeadlineClusterMember = {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceKind: HeadlineSourceKind;
  channel: HeadlineChannel;
  publishedAt: string | null;
};

export type HeadlineCluster = {
  id: string;
  headline: string;
  headlineUrl: string | null;
  summary: string | null;
  summarySourceName: string | null;
  latestAt: string | null;
  latestLabel: string;
  uniqueCreators: number;
  uniqueNewsSources: number;
  itemCount: number;
  crossSource: boolean;
  score: number;
  rank: HeadlineRank;
  sharedTokens: string[];
  creators: HeadlineCreatorDiscussion[];
  members: HeadlineClusterMember[];
};

export type HeadlineTimelineDay = {
  dayKey: string;
  label: string;
  clusters: HeadlineCluster[];
};

export type HeadlineTimeline = {
  generatedAt: string;
  windowHours: number;
  candidateCount: number;
  creatorCandidateCount: number;
  newsCandidateCount: number;
  clusterCount: number;
  days: HeadlineTimelineDay[];
  warnings: string[];
};

export type TitleProfile = {
  meaningful: string[];
  support: string[];
  numbers: string[];
};
