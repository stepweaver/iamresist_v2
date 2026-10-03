import { looseHeadlineUrl } from '@/lib/headlineTimeline/candidates';
import { HEADLINE_TIMELINE_WINDOW_HOURS } from '@/lib/headlineTimeline/constants';
import { JEV_PREFILTER_MIN_SHARED_ANCHORS } from '@/lib/headlineTimeline/jev/constants';
import type { PairPrefilterDecision } from '@/lib/headlineTimeline/jev/types';
import { cleanupDisplayTitle } from '@/lib/headlineTimeline/normalize';
import { compareTitles, withinHeadlineWindow } from '@/lib/headlineTimeline/similarity';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';

function normalizedTitle(title: string): string {
  return cleanupDisplayTitle(title).toLowerCase();
}

function round3(value: number): string {
  return value.toFixed(3);
}

/**
 * Decide whether a pair is already settled by the lexical timeline,
 * worth a Jev semantic check, or not worth a call.
 *
 * Order:
 * 1. Same id, or outside the headline window → skip.
 * 2. Same URL or the same normalized title → deterministic match.
 * 3. compareTitles already clusters the pair → deterministic match.
 * 4. No distinctive shared anchor → skip.
 * 5. Otherwise ask Jev.
 */
export function prefilterHeadlinePair(
  a: HeadlineCandidate,
  b: HeadlineCandidate,
  windowHours = HEADLINE_TIMELINE_WINDOW_HOURS,
): PairPrefilterDecision {
  if (a.id === b.id) {
    return { action: 'skip', reason: 'same item id' };
  }

  if (!withinHeadlineWindow(a.publishedAt, b.publishedAt, windowHours)) {
    return { action: 'skip', reason: 'outside headline timeline window' };
  }

  const leftUrl = looseHeadlineUrl(a.url);
  const rightUrl = looseHeadlineUrl(b.url);
  if (leftUrl && leftUrl === rightUrl) {
    return { action: 'deterministic_match', reason: 'same published url' };
  }

  const leftTitle = normalizedTitle(a.title);
  const rightTitle = normalizedTitle(b.title);
  if (leftTitle && leftTitle === rightTitle) {
    return { action: 'deterministic_match', reason: 'identical normalized title' };
  }

  const similarity = compareTitles(a.title, b.title, {
    a: a.publishedAt,
    b: b.publishedAt,
    windowHours,
  });

  if (similarity.cluster) {
    return {
      action: 'deterministic_match',
      reason: `lexical title match already clusters these items (similarity ${round3(similarity.score)})`,
    };
  }

  if (similarity.shared.length === 0) {
    return { action: 'skip', reason: 'no shared title tokens' };
  }

  if (similarity.sharedAnchors.length < JEV_PREFILTER_MIN_SHARED_ANCHORS) {
    return { action: 'skip', reason: 'title overlap has no distinctive anchor' };
  }

  return {
    action: 'ask_jev',
    reason: `partial title overlap below the lexical cluster bar (similarity ${round3(similarity.score)}, anchors ${similarity.sharedAnchors.join(', ')})`,
  };
}
