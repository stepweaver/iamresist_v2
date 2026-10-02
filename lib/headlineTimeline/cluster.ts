import { HEADLINE_TIMELINE_WINDOW_HOURS } from '@/lib/headlineTimeline/constants';
import { profileTitle } from '@/lib/headlineTimeline/normalize';
import { compareTitles, timeMs, titlesShouldCluster } from '@/lib/headlineTimeline/similarity';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';

export type HeadlineClusterDraft = {
  id: string;
  members: HeadlineCandidate[];
  sharedTokens: string[];
};

function clusterId(ids: string[]): string {
  const key = ids.slice().sort().join('|');
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  return `hl-${(hash >>> 0).toString(16)}`;
}

function sharedSupportTokens(members: HeadlineCandidate[]): string[] {
  if (members.length < 2) return [];
  const counts = new Map<string, number>();
  for (const member of members) {
    for (const token of profileTitle(member.title).support) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token);
}

/**
 * Union-find over pairwise title matches.
 * A pair joins only inside the time window, and a component may not grow past that window.
 */
export function clusterHeadlineCandidates(
  candidates: HeadlineCandidate[],
  windowHours = HEADLINE_TIMELINE_WINDOW_HOURS,
): HeadlineClusterDraft[] {
  const items = candidates.filter((item) => item.title.trim() && timeMs(item.publishedAt) != null);
  const parent = items.map((_, index) => index);
  const minT = items.map((item) => timeMs(item.publishedAt) as number);
  const maxT = minT.slice();
  const windowMs = windowHours * 3600000;

  function find(index: number): number {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  }

  function union(left: number, right: number) {
    const a = find(left);
    const b = find(right);
    if (a === b) return;
    const nextMin = Math.min(minT[a], minT[b]);
    const nextMax = Math.max(maxT[a], maxT[b]);
    if (nextMax - nextMin > windowMs) return;
    parent[b] = a;
    minT[a] = nextMin;
    maxT[a] = nextMax;
  }

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (!titlesShouldCluster(items[i].title, items[j].title, {
        a: items[i].publishedAt,
        b: items[j].publishedAt,
        windowHours,
      })) {
        continue;
      }
      union(i, j);
    }
  }

  const groups = new Map<number, HeadlineCandidate[]>();
  for (let i = 0; i < items.length; i += 1) {
    const root = find(i);
    const list = groups.get(root) || [];
    list.push(items[i]);
    groups.set(root, list);
  }

  const drafts: HeadlineClusterDraft[] = [];
  for (const members of groups.values()) {
    members.sort((a, b) => (timeMs(b.publishedAt) || 0) - (timeMs(a.publishedAt) || 0));
    drafts.push({
      id: clusterId(members.map((member) => member.id)),
      members,
      sharedTokens: sharedSupportTokens(members),
    });
  }

  drafts.sort((a, b) => (timeMs(b.members[0]?.publishedAt) || 0) - (timeMs(a.members[0]?.publishedAt) || 0));
  return drafts;
}

export function representativeMember(members: HeadlineCandidate[]): HeadlineCandidate {
  const news = members.filter((member) => member.sourceKind === 'news');
  const pool = news.length ? news : members;
  if (pool.length === 1) return pool[0];

  let best = pool[0];
  let bestScore = -1;
  for (const candidate of pool) {
    let total = 0;
    let compared = 0;
    for (const other of members) {
      if (other.id === candidate.id) continue;
      total += compareTitles(candidate.title, other.title).score;
      compared += 1;
    }
    const average = compared ? total / compared : 0;
    const newer = (timeMs(candidate.publishedAt) || 0) > (timeMs(best.publishedAt) || 0);
    if (average > bestScore + 1e-9 || (Math.abs(average - bestScore) <= 1e-9 && newer)) {
      best = candidate;
      bestScore = average;
    }
  }
  return best;
}
