import { assessMissionScope } from '@/lib/intel/missionScope';

export function assessHomepageNewswireScope(story) {
  const missionScope = assessMissionScope({
    title: story?.title ?? '',
    summary: [story?.excerpt ?? '', story?.note ?? ''].filter(Boolean).join('\n'),
    categories: [],
  });

  return {
    missionScope,
    allowOnNewswire: missionScope.scopeState !== 'off_topic',
    allowOnHomepageBriefing: story?.isCurated
      ? !missionScope.hardOffTopic && !missionScope.softOffTopic
      : missionScope.allowedOnHomepageCommentary,
  };
}
