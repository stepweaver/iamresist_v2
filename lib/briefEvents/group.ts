import { resolveNoteContentRole } from '@/lib/creatorNotes/contentRole';
import type { BriefEpisode } from '@/lib/creatorNotes/brief';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { identityFromAtomicNote, notesShouldGroup } from '@/lib/briefEvents/identity';
import type { ThreadIdentity } from '@/lib/eventThreads/identity';

/** Transcript-offset proximity for merging factual notes of the same development. */
export const BRIEF_EVENT_TIME_PROXIMITY_SECONDS = 300;
/** Wider window so analysis / why-it-matters can attach to a nearby factual cluster. */
export const BRIEF_EVENT_ANALYSIS_ATTACH_SECONDS = 900;

const ANALYSIS_KINDS = new Set(['creator_analysis', 'why_it_matters', 'evidence_reference']);

export type EligibleBriefNote = {
  note: CreatorAtomicNote;
  episode: BriefEpisode;
  identity: ThreadIdentity;
};

export function isEligibleBriefEventNote(
  note: Pick<CreatorAtomicNote, 'contentRole' | 'text' | 'sourceQuote' | 'exactQuote' | 'sourceExcerpt'>,
): boolean {
  return resolveNoteContentRole(note) === 'editorial';
}

function noteAnchorSeconds(note: CreatorAtomicNote): number | null {
  if (note.startSeconds != null && Number.isFinite(note.startSeconds)) return note.startSeconds;
  if (note.endSeconds != null && Number.isFinite(note.endSeconds)) return note.endSeconds;
  return null;
}

export function transcriptTimeDistance(a: CreatorAtomicNote, b: CreatorAtomicNote): number | null {
  const left = noteAnchorSeconds(a);
  const right = noteAnchorSeconds(b);
  if (left == null || right == null) return null;
  return Math.abs(left - right);
}

function rangesOverlap(a: CreatorAtomicNote, b: CreatorAtomicNote): boolean {
  if (a.startSeconds == null || a.endSeconds == null || b.startSeconds == null || b.endSeconds == null) {
    return false;
  }
  return a.startSeconds <= b.endSeconds && b.startSeconds <= a.endSeconds;
}

function isAnalysisKind(kind: string): boolean {
  return ANALYSIS_KINDS.has(kind);
}

/**
 * Conservative same-event test for two eligible notes in the same episode.
 * Prefer a false split over a false merge.
 */
export function shouldGroupBriefNotes(
  a: EligibleBriefNote,
  b: EligibleBriefNote,
): boolean {
  if (a.episode.sourceItemId !== b.episode.sourceItemId) return false;

  const identityMatch = notesShouldGroup(
    { identity: a.identity, text: a.note.text },
    { identity: b.identity, text: b.note.text },
  );
  if (!identityMatch) return false;

  const distance = transcriptTimeDistance(a.note, b.note);
  const overlapping = rangesOverlap(a.note, b.note);
  const eitherAnalysis = isAnalysisKind(a.note.kind) || isAnalysisKind(b.note.kind);

  if (overlapping) return true;
  if (distance == null) {
    // Missing timestamps: only merge on strong identity (already required).
    return true;
  }
  if (distance <= BRIEF_EVENT_TIME_PROXIMITY_SECONDS) return true;
  if (eitherAnalysis && distance <= BRIEF_EVENT_ANALYSIS_ATTACH_SECONDS) return true;
  return false;
}

function collectEligible(episodes: BriefEpisode[]): {
  eligible: EligibleBriefNote[];
  excludedNoteCount: number;
} {
  const eligible: EligibleBriefNote[] = [];
  let excludedNoteCount = 0;
  for (const episode of episodes) {
    for (const note of episode.notes) {
      if (!isEligibleBriefEventNote(note)) {
        excludedNoteCount += 1;
        continue;
      }
      eligible.push({
        note,
        episode,
        identity: identityFromAtomicNote(note, episode.creatorName),
      });
    }
  }
  return { eligible, excludedNoteCount };
}

/**
 * Union-find clustering within each source episode.
 * Notes from different episodes never merge.
 */
export function clusterEligibleNotes(eligible: EligibleBriefNote[]): EligibleBriefNote[][] {
  const byEpisode = new Map<string, EligibleBriefNote[]>();
  for (const item of eligible) {
    const key = item.episode.sourceItemId;
    const list = byEpisode.get(key) || [];
    list.push(item);
    byEpisode.set(key, list);
  }

  const clusters: EligibleBriefNote[][] = [];

  for (const items of byEpisode.values()) {
    const ordered = items.slice().sort((a, b) => {
      const aStart = a.note.startSeconds ?? Number.POSITIVE_INFINITY;
      const bStart = b.note.startSeconds ?? Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      return a.note.id.localeCompare(b.note.id);
    });

    const parent = ordered.map((_, index) => index);
    const find = (index: number): number => {
      let cursor = index;
      while (parent[cursor] !== cursor) {
        parent[cursor] = parent[parent[cursor]];
        cursor = parent[cursor];
      }
      return cursor;
    };
    const unite = (i: number, j: number) => {
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    };

    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        if (shouldGroupBriefNotes(ordered[i], ordered[j])) unite(i, j);
      }
    }

    const buckets = new Map<number, EligibleBriefNote[]>();
    for (let i = 0; i < ordered.length; i += 1) {
      const root = find(i);
      const list = buckets.get(root) || [];
      list.push(ordered[i]);
      buckets.set(root, list);
    }
    for (const bucket of buckets.values()) clusters.push(bucket);
  }

  return clusters;
}

export function collectAndClusterBriefNotes(episodes: BriefEpisode[]): {
  clusters: EligibleBriefNote[][];
  excludedNoteCount: number;
} {
  const { eligible, excludedNoteCount } = collectEligible(episodes);
  return { clusters: clusterEligibleNotes(eligible), excludedNoteCount };
}
