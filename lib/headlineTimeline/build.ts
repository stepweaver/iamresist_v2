import {
  HEADLINE_NOTE_DISPLAY_KINDS,
  HEADLINE_NOTES_PER_CREATOR,
  HEADLINE_TIMELINE_DISPLAY_LIMIT,
  HEADLINE_TIMELINE_TIME_ZONE,
  HEADLINE_TIMELINE_WINDOW_HOURS,
} from '@/lib/headlineTimeline/constants';
import { isHeadlineNoiseTitle } from '@/lib/headlineTimeline/candidates';
import { clusterHeadlineCandidates, representativeMember } from '@/lib/headlineTimeline/cluster';
import { cleanupDisplayTitle, profileTitle } from '@/lib/headlineTimeline/normalize';
import { qualifiesForPrimaryTimeline, scoreHeadlineMembers } from '@/lib/headlineTimeline/rank';
import { timeMs } from '@/lib/headlineTimeline/similarity';
import type {
  AttachedCreatorNote,
  HeadlineCandidate,
  HeadlineCluster,
  HeadlineCreatorDiscussion,
  HeadlineNoteSeed,
  HeadlineTimeline,
  HeadlineTimelineDay,
} from '@/lib/headlineTimeline/types';

const DISPLAY_KINDS = new Set<string>(HEADLINE_NOTE_DISPLAY_KINDS);
const HIDDEN_ROLES = new Set(['sponsor_read', 'housekeeping', 'intro_outro', 'uncertain']);

const KIND_ORDER = new Map<string, number>(HEADLINE_NOTE_DISPLAY_KINDS.map((kind, index) => [kind, index]));

export function formatHeadlineAge(fromIso: string | null, now: Date): string {
  const stamp = timeMs(fromIso);
  if (stamp == null) return 'time unknown';
  const delta = Math.max(0, now.getTime() - stamp);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(delta / 3600000);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(delta / 86400000);
  return `${days}d ago`;
}

export function headlineDayKey(iso: string | null): string {
  const stamp = timeMs(iso);
  if (stamp == null) return 'undated';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HEADLINE_TIMELINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(stamp));
}

export function headlineDayLabel(iso: string | null): string {
  const stamp = timeMs(iso);
  if (stamp == null) return 'DATE NOT STORED';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HEADLINE_TIMELINE_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
    .format(new Date(stamp))
    .toUpperCase();
}

function evidenceUrl(url: string, startSeconds: number | null): string | null {
  if (!url) return null;
  if (startSeconds == null || !Number.isFinite(startSeconds)) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtube.com') || host === 'youtu.be') {
      parsed.searchParams.set('t', String(Math.max(0, Math.floor(startSeconds))));
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

function noteVisible(note: HeadlineNoteSeed): boolean {
  if (note.contentRole && HIDDEN_ROLES.has(note.contentRole)) return false;
  if (!DISPLAY_KINDS.has(note.kind)) return false;
  return Boolean(note.text.trim());
}

function notesForMembers(
  members: HeadlineCandidate[],
  notesBySource: Map<string, HeadlineNoteSeed[]>,
): HeadlineCreatorDiscussion[] {
  const creators = new Map<string, HeadlineCreatorDiscussion>();

  for (const member of members) {
    if (member.sourceKind !== 'creator') continue;
    let group = creators.get(member.sourceId);
    if (!group) {
      group = {
        creatorId: member.sourceId,
        creatorName: member.sourceName,
        links: [],
        notes: [],
      };
      creators.set(member.sourceId, group);
    }
    if (member.url && !group.links.some((link) => link.url === member.url)) {
      group.links.push({ title: cleanupDisplayTitle(member.title), url: member.url });
    }
    const seeds = notesBySource.get(member.id) || [];
    for (const seed of seeds) {
      if (!noteVisible(seed) || group.notes.some((note) => note.id === seed.id)) continue;
      group.notes.push({
        id: seed.id,
        text: seed.text.trim(),
        kind: seed.kind,
        startSeconds: seed.startSeconds,
        endSeconds: seed.endSeconds,
        evidenceUrl: evidenceUrl(member.url, seed.startSeconds),
      });
    }
  }

  for (const group of creators.values()) {
    group.notes.sort((a, b) => {
      const byKind = (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99);
      if (byKind !== 0) return byKind;
      const aStart = a.startSeconds ?? Number.POSITIVE_INFINITY;
      const bStart = b.startSeconds ?? Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      return a.id.localeCompare(b.id);
    });
    group.notes = group.notes.slice(0, HEADLINE_NOTES_PER_CREATOR);
  }

  return [...creators.values()].sort((a, b) => {
    if (b.notes.length !== a.notes.length) return b.notes.length - a.notes.length;
    return a.creatorName.localeCompare(b.creatorName);
  });
}

function summaryFrom(member: HeadlineCandidate): { summary: string | null; summarySourceName: string | null } {
  if (member.sourceKind !== 'news') return { summary: null, summarySourceName: null };
  const text = String(member.summary || '').replace(/\s+/g, ' ').trim();
  if (!text) return { summary: null, summarySourceName: null };
  const clipped = text.length > 280 ? `${text.slice(0, 277).trim()}…` : text;
  return { summary: clipped, summarySourceName: member.sourceName };
}

function hasEnoughTokens(title: string): boolean {
  return profileTitle(title).meaningful.length >= 2;
}

export function buildHeadlineTimeline(input: {
  candidates: HeadlineCandidate[];
  notes?: HeadlineNoteSeed[];
  now?: Date;
  warnings?: string[];
  windowHours?: number;
}): HeadlineTimeline {
  const now = input.now instanceof Date ? input.now : new Date();
  const windowHours = input.windowHours ?? HEADLINE_TIMELINE_WINDOW_HOURS;
  const notesBySource = new Map<string, HeadlineNoteSeed[]>();
  for (const note of input.notes || []) {
    const list = notesBySource.get(note.sourceItemId) || [];
    list.push(note);
    notesBySource.set(note.sourceItemId, list);
  }

  const usable = input.candidates.filter(
    (candidate) => hasEnoughTokens(candidate.title) && !isHeadlineNoiseTitle(candidate.title),
  );
  const drafts = clusterHeadlineCandidates(usable, windowHours);
  const clusters: HeadlineCluster[] = drafts.map((draft) => {
    const rank = scoreHeadlineMembers(draft.members, now);
    const representative = representativeMember(draft.members);
    const summary = summaryFrom(representative);
    const headline = cleanupDisplayTitle(representative.title);
    return {
      id: draft.id,
      headline,
      headlineUrl: representative.url || null,
      summary: summary.summary,
      summarySourceName: summary.summarySourceName,
      latestAt: rank.latestAt,
      latestLabel: formatHeadlineAge(rank.latestAt, now),
      uniqueCreators: rank.uniqueCreators,
      uniqueNewsSources: rank.uniqueNewsSources,
      itemCount: rank.itemCount,
      crossSource: rank.crossSource,
      score: rank.score,
      rank,
      sharedTokens: draft.sharedTokens,
      creators: notesForMembers(draft.members, notesBySource),
      members: draft.members.map((member) => ({
        id: member.id,
        title: member.title,
        url: member.url,
        sourceName: member.sourceName,
        sourceKind: member.sourceKind,
        channel: member.channel,
        publishedAt: member.publishedAt,
      })),
    };
  });

  clusters.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const byTime = (timeMs(b.latestAt) || 0) - (timeMs(a.latestAt) || 0);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });

  // Singletons remain in `clusters` through scoring. Only the primary timeline drops them.
  const qualified = clusters.filter((cluster) =>
    qualifiesForPrimaryTimeline({
      uniqueCreators: cluster.uniqueCreators,
      uniqueNewsSources: cluster.uniqueNewsSources,
    }),
  );
  const shown = qualified.slice(0, HEADLINE_TIMELINE_DISPLAY_LIMIT);
  const days = new Map<string, HeadlineTimelineDay>();
  for (const cluster of shown) {
    const dayKey = headlineDayKey(cluster.latestAt);
    let day = days.get(dayKey);
    if (!day) {
      day = { dayKey, label: headlineDayLabel(cluster.latestAt), clusters: [] };
      days.set(dayKey, day);
    }
    day.clusters.push(cluster);
  }

  const orderedDays = [...days.values()].sort((a, b) => b.dayKey.localeCompare(a.dayKey));

  return {
    generatedAt: now.toISOString(),
    windowHours,
    candidateCount: usable.length,
    creatorCandidateCount: usable.filter((candidate) => candidate.sourceKind === 'creator').length,
    newsCandidateCount: usable.filter((candidate) => candidate.sourceKind === 'news').length,
    clusterCount: qualified.length,
    days: orderedDays,
    warnings: input.warnings ? input.warnings.slice() : [],
  };
}

export function countShownClusters(timeline: HeadlineTimeline): number {
  return timeline.days.reduce((sum, day) => sum + day.clusters.length, 0);
}

export type { AttachedCreatorNote };
