import { briefStatementRole } from '@/lib/creatorNotes/briefPresentation';
import type { BriefEpisode } from '@/lib/creatorNotes/brief';
import type { VerificationStatus } from '@/lib/creatorNotes/constants';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { collectAndClusterBriefNotes, type EligibleBriefNote } from '@/lib/briefEvents/group';
import { selectBriefEventHeadline } from '@/lib/briefEvents/headline';
import {
  creatorNamesLabel,
  formatTranscriptClock,
  formatTranscriptRange,
  presentEventNote,
  primaryVerificationLabel,
} from '@/lib/briefEvents/format';
import type { BriefEventCandidate, BriefEventDay, BriefEventsCorpus } from '@/lib/briefEvents/types';

export {
  creatorNamesLabel,
  formatTranscriptClock,
  formatTranscriptRange,
  presentEventNote,
  primaryVerificationLabel,
};

function dayKeyFrom(value: string | null): string {
  if (!value) return 'undated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'undated';
  return parsed.toISOString().slice(0, 10);
}

function dayLabel(dayKey: string, chronology: 'published' | 'extracted'): string {
  if (dayKey === 'undated') return 'DATE NOT STORED';
  return chronology === 'published' ? dayKey : `${dayKey} · extraction day`;
}

function timeMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function partitionNotes(notes: CreatorAtomicNote[]): {
  developments: CreatorAtomicNote[];
  reportedClaims: CreatorAtomicNote[];
  creatorAnalysis: CreatorAtomicNote[];
  whyItMatters: CreatorAtomicNote[];
  evidence: CreatorAtomicNote[];
  context: CreatorAtomicNote[];
} {
  const developments: CreatorAtomicNote[] = [];
  const reportedClaims: CreatorAtomicNote[] = [];
  const creatorAnalysis: CreatorAtomicNote[] = [];
  const whyItMatters: CreatorAtomicNote[] = [];
  const evidence: CreatorAtomicNote[] = [];
  const context: CreatorAtomicNote[] = [];

  for (const note of notes) {
    if (note.kind === 'creator_analysis') {
      creatorAnalysis.push(note);
      continue;
    }
    if (note.kind === 'why_it_matters') {
      whyItMatters.push(note);
      continue;
    }
    if (note.kind === 'evidence_reference') {
      evidence.push(note);
      continue;
    }
    if (note.kind === 'context') {
      context.push(note);
      continue;
    }
    const role = briefStatementRole(note);
    if (role === 'reported' || (note.kind === 'claim' && note.referencedSource)) {
      reportedClaims.push(note);
      continue;
    }
    // event, new_development, and non-reported claims → developments
    developments.push(note);
  }

  return { developments, reportedClaims, creatorAnalysis, whyItMatters, evidence, context };
}

function clusterTimeBounds(notes: CreatorAtomicNote[]): {
  startSeconds: number | null;
  endSeconds: number | null;
} {
  let start: number | null = null;
  let end: number | null = null;
  for (const note of notes) {
    if (note.startSeconds != null && Number.isFinite(note.startSeconds)) {
      start = start == null ? note.startSeconds : Math.min(start, note.startSeconds);
    }
    if (note.endSeconds != null && Number.isFinite(note.endSeconds)) {
      end = end == null ? note.endSeconds : Math.max(end, note.endSeconds);
    } else if (note.startSeconds != null && Number.isFinite(note.startSeconds)) {
      end = end == null ? note.startSeconds : Math.max(end, note.startSeconds);
    }
  }
  return { startSeconds: start, endSeconds: end };
}

function eventIdFor(notes: CreatorAtomicNote[], sourceItemId: string): string {
  const ids = notes
    .map((note) => note.id)
    .slice()
    .sort()
    .join('|');
  // Browser-safe deterministic id (no node:crypto — this module is imported by a client component).
  let hash = 2166136261;
  const raw = `${sourceItemId}:${ids}`;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `bec_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function uniqueCreators(
  notes: CreatorAtomicNote[],
  episode: BriefEpisode,
): Array<{ id: string | null; name: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ id: string | null; name: string | null }> = [];
  const push = (id: string | null, name: string | null) => {
    const key = `${id || ''}|${name || ''}`.toLowerCase();
    if (!key.replace('|', '') || seen.has(key)) return;
    seen.add(key);
    out.push({ id, name });
  };
  push(episode.creatorId, episode.creatorName);
  for (const note of notes) {
    if (note.attribution) push(note.creatorId, note.attribution);
  }
  return out.length ? out : [{ id: episode.creatorId, name: episode.creatorName }];
}

function verificationStatuses(notes: CreatorAtomicNote[]): VerificationStatus[] {
  const seen = new Set<string>();
  const out: VerificationStatus[] = [];
  for (const note of notes) {
    const status = note.verificationStatus;
    if (!status || seen.has(status)) continue;
    seen.add(status);
    out.push(status);
  }
  return out;
}

export function buildBriefEventCandidate(cluster: EligibleBriefNote[]): BriefEventCandidate {
  const episode = cluster[0].episode;
  const notes = cluster
    .map((item) => item.note)
    .slice()
    .sort((a, b) => {
      const byStart = (a.startSeconds ?? Number.POSITIVE_INFINITY) - (b.startSeconds ?? Number.POSITIVE_INFINITY);
      if (byStart !== 0) return byStart;
      return a.id.localeCompare(b.id);
    });
  const bounds = clusterTimeBounds(notes);
  const parts = partitionNotes(notes);
  const stamp = episode.publishedAt || episode.extractedAt;

  return {
    id: eventIdFor(notes, episode.sourceItemId),
    sourceItemIds: [episode.sourceItemId],
    startSeconds: bounds.startSeconds,
    endSeconds: bounds.endSeconds,
    date: dayKeyFrom(stamp),
    chronology: episode.chronology,
    headline: selectBriefEventHeadline(notes),
    creators: uniqueCreators(notes, episode),
    verificationStatuses: verificationStatuses(notes),
    notes,
    developments: parts.developments,
    reportedClaims: parts.reportedClaims,
    creatorAnalysis: parts.creatorAnalysis,
    whyItMatters: parts.whyItMatters,
    evidence: parts.evidence,
    context: parts.context,
    noteCount: notes.length,
    episode: {
      sourceItemId: episode.sourceItemId,
      creatorId: episode.creatorId,
      creatorName: episode.creatorName,
      title: episode.title,
      publishedAt: episode.publishedAt,
      extractedAt: episode.extractedAt,
      sourceUrl: episode.sourceUrl,
      chronology: episode.chronology,
      extractionVersion: episode.extractionVersion,
      runId: episode.runId,
    },
  };
}

function sortEvents(events: BriefEventCandidate[]): BriefEventCandidate[] {
  return events.slice().sort((a, b) => {
    const aStart = a.startSeconds ?? Number.POSITIVE_INFINITY;
    const bStart = b.startSeconds ?? Number.POSITIVE_INFINITY;
    if (aStart !== bStart) return aStart - bStart;
    return a.id.localeCompare(b.id);
  });
}

export function groupBriefEventsByDay(events: BriefEventCandidate[]): BriefEventDay[] {
  const days = new Map<string, BriefEventDay>();
  for (const event of events) {
    const key = event.date || 'undated';
    const dayId = `${event.chronology}:${key}`;
    let day = days.get(dayId);
    if (!day) {
      day = {
        dayKey: key,
        label: dayLabel(key, event.chronology),
        chronology: event.chronology,
        events: [],
      };
      days.set(dayId, day);
    }
    day.events.push(event);
  }

  const ordered = [...days.values()];
  ordered.sort((a, b) => {
    if (a.dayKey === 'undated') return 1;
    if (b.dayKey === 'undated') return -1;
    const byDay = b.dayKey.localeCompare(a.dayKey);
    if (byDay !== 0) return byDay;
    return timeMs(b.events[0]?.episode.publishedAt || b.events[0]?.episode.extractedAt) -
      timeMs(a.events[0]?.episode.publishedAt || a.events[0]?.episode.extractedAt);
  });
  for (const day of ordered) {
    day.events = sortEvents(day.events);
  }
  return ordered;
}

/**
 * Build the read-only Event Candidate corpus from brief episodes.
 * Does not persist, mutate notes, or call a model.
 */
export function buildBriefEventsCorpus(episodes: BriefEpisode[]): BriefEventsCorpus {
  const { clusters, excludedNoteCount } = collectAndClusterBriefNotes(episodes);
  const events = clusters.map(buildBriefEventCandidate);
  const days = groupBriefEventsByDay(events);
  const participatingNoteIds = events.flatMap((event) => event.notes.map((note) => note.id));
  return {
    days,
    eventCount: events.length,
    noteCount: participatingNoteIds.length,
    participatingNoteIds,
    excludedNoteCount,
  };
}
