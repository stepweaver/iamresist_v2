import { assessMissionScope } from '@/lib/intel/missionScope';

export function assessHomepageNewswireScope(story) {
  const missionScope = assessMissionScope({
    title: story?.title ?? '',
    summary: [story?.excerpt ?? '', story?.note ?? ''].filter(Boolean).join('\n'),
    categories: [],
  });

  return {
    missionScope,
    // Raw newswire rule: suppress only clear off-topic leakage. Ambiguous current events stay
    // visible for downstream editorial judgment instead of being pre-buried at ingest.
    allowOnNewswire: missionScope.scopeState !== 'off_topic',
    allowOnHomepageBriefing: story?.isCurated
      ? !missionScope.hardOffTopic && !missionScope.softOffTopic
      : missionScope.allowedOnHomepageCommentary,
  };
}
