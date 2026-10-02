import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { concatenateTranscriptSegments } from '@/lib/creatorNotes/quotes';
import type { CreatorAtomicNote, CreatorTranscriptSegment } from '@/lib/creatorNotes/types';
import { DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR } from '@/lib/creatorNotes/audioTranscriptCache';
import {
  JEV_DISCOURSE_FAILURE_CACHE_MISSING,
  JEV_DISCOURSE_FAILURE_EXCERPT_EMPTY,
  JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED,
  JEV_DISCOURSE_FAILURE_NO_NEIGHBORS,
  JEV_DISCOURSE_MAX_SECONDS,
} from '@/lib/jev/constants';
import type { ShadowDiscourseContext } from '@/lib/jev/types';

export type DiscourseTranscripts = ReadonlyMap<string, readonly CreatorTranscriptSegment[]>;

export type DiscourseSegmentSource = 'transcript_cache' | 'stored_podcast_transcript' | 'source_item_transcript';

export type CachedTranscriptLookup = {
  transcripts: Map<string, CreatorTranscriptSegment[]>;
  /** Set when a cache file exists for the source but its segments do not map to the notes. */
  failures: Map<string, string>;
};

type EvidenceSpan = {
  lo: number;
  hi: number;
};

type DiscourseNote = Pick<
  CreatorAtomicNote,
  'id' | 'sourceExcerpt' | 'sourceSegmentIndexes' | 'startSeconds' | 'endSeconds' | 'extractionRunId'
>;

const OVERLAP_MIN_CHARS = 40;
const TIME_SLACK_SECONDS = 1.5;

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function emptyDiscourse(reason = JEV_DISCOURSE_FAILURE_CACHE_MISSING): ShadowDiscourseContext {
  return {
    discourseContext: null,
    discourseStartSeconds: null,
    discourseEndSeconds: null,
    discourseSegmentIndexes: null,
    discourseContextSource: 'unavailable',
    discourseContextFailureReason: reason,
  };
}

function succeeded(
  text: string,
  start: number,
  end: number,
  indexes: number[],
  source: DiscourseSegmentSource,
): ShadowDiscourseContext {
  return {
    discourseContext: text,
    discourseStartSeconds: start,
    discourseEndSeconds: end,
    discourseSegmentIndexes: indexes,
    discourseContextSource: source,
    discourseContextFailureReason: null,
  };
}

function bounds(
  segments: readonly CreatorTranscriptSegment[],
  lo: number,
  hi: number,
): { start: number; end: number } | null {
  let start: number | null = null;
  let end: number | null = null;
  for (let index = lo; index <= hi; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const segStart = finite(segment.startSeconds);
    const segEnd = finite(segment.endSeconds) ?? segStart;
    if (segStart != null) start = start == null ? segStart : Math.min(start, segStart);
    if (segEnd != null) end = end == null ? segEnd : Math.max(end, segEnd);
  }
  if (start == null || end == null || end < start) return null;
  return { start, end };
}

function duration(segments: readonly CreatorTranscriptSegment[], lo: number, hi: number): number | null {
  const window = bounds(segments, lo, hi);
  return window ? window.end - window.start : null;
}

function sortedIndexes(indexes: readonly number[]): number[] {
  return [...new Set(indexes.filter((index) => Number.isInteger(index)))].sort((left, right) => left - right);
}

function contiguous(indexes: readonly number[]): boolean {
  const sorted = sortedIndexes(indexes);
  return sorted.length > 0 && sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
}

function timesAlign(
  note: Pick<CreatorAtomicNote, 'startSeconds' | 'endSeconds'>,
  window: { start: number; end: number } | null,
): boolean {
  if (!window) return false;
  const noteStart = finite(note.startSeconds);
  const noteEnd = finite(note.endSeconds);
  if (noteStart == null || noteEnd == null) return true;
  return Math.abs(window.start - noteStart) <= TIME_SLACK_SECONDS && Math.abs(window.end - noteEnd) <= TIME_SLACK_SECONDS;
}

/**
 * The note's sourceSegmentIndexes name the original extraction segments only when
 * those positions still contain the excerpt and share the note's timestamps.
 */
export function mappedIndexSpan(
  note: Pick<CreatorAtomicNote, 'sourceExcerpt' | 'sourceSegmentIndexes' | 'startSeconds' | 'endSeconds'>,
  segments: readonly CreatorTranscriptSegment[],
): EvidenceSpan | null {
  const excerpt = collapse(note.sourceExcerpt == null ? '' : String(note.sourceExcerpt));
  if (!excerpt || !segments.length) return null;
  const indexes = sortedIndexes(note.sourceSegmentIndexes || []);
  if (!contiguous(indexes)) return null;
  if (indexes.some((index) => index < 0 || index >= segments.length)) return null;
  const cited = collapse(concatenateTranscriptSegments(segments as CreatorTranscriptSegment[], indexes));
  if (!cited || (cited !== excerpt && !cited.includes(excerpt))) return null;
  const lo = indexes[0];
  const hi = indexes[indexes.length - 1];
  if (!timesAlign(note, bounds(segments, lo, hi))) return null;
  return { lo, hi };
}

function expandAround(
  segments: readonly CreatorTranscriptSegment[],
  evidence: EvidenceSpan,
): EvidenceSpan | null {
  const last = segments.length - 1;
  if (evidence.lo < 0 || evidence.hi > last || evidence.lo > evidence.hi) return null;
  if (duration(segments, evidence.lo, evidence.hi) == null) return null;
  if (evidence.lo === 0 && evidence.hi === last) return null;

  let lo = evidence.lo;
  let hi = evidence.hi;
  let best: EvidenceSpan | null = null;

  while (lo > 0 || hi < last) {
    const current = duration(segments, lo, hi);
    if (current == null) break;

    const canLeft = lo > 0;
    const canRight = hi < last;
    const steps: EvidenceSpan[] = [];
    if (canLeft && canRight) steps.push({ lo: lo - 1, hi: hi + 1 });
    if (canLeft) steps.push({ lo: lo - 1, hi });
    if (canRight) steps.push({ lo, hi: hi + 1 });

    const fitting = steps
      .map((step) => ({ step, duration: duration(segments, step.lo, step.hi) }))
      .filter((entry): entry is { step: EvidenceSpan; duration: number } => entry.duration != null && entry.duration <= JEV_DISCOURSE_MAX_SECONDS)
      .sort((left, right) => right.duration - left.duration);
    if (!fitting.length) break;

    const chosen = fitting[0];
    lo = chosen.step.lo;
    hi = chosen.step.hi;
    best = { lo, hi };
  }

  if (!best || (best.lo === evidence.lo && best.hi === evidence.hi)) return null;
  const wider = duration(segments, best.lo, best.hi);
  if (wider == null || wider > JEV_DISCOURSE_MAX_SECONDS) return null;
  return best;
}

function contextFromSegments(
  note: Pick<CreatorAtomicNote, 'sourceExcerpt' | 'sourceSegmentIndexes' | 'startSeconds' | 'endSeconds'>,
  segments: readonly CreatorTranscriptSegment[],
  source: DiscourseSegmentSource,
): ShadowDiscourseContext {
  const excerpt = collapse(note.sourceExcerpt == null ? '' : String(note.sourceExcerpt));
  if (!excerpt) return emptyDiscourse(JEV_DISCOURSE_FAILURE_EXCERPT_EMPTY);
  if (!segments.length) return emptyDiscourse(JEV_DISCOURSE_FAILURE_CACHE_MISSING);
  const span = mappedIndexSpan(note, segments);
  if (!span) return emptyDiscourse(JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED);

  const widened = expandAround(segments, span);
  if (!widened) return emptyDiscourse(JEV_DISCOURSE_FAILURE_NO_NEIGHBORS);

  const indexes: number[] = [];
  for (let index = widened.lo; index <= widened.hi; index += 1) indexes.push(index);
  const text = concatenateTranscriptSegments(segments as CreatorTranscriptSegment[], indexes);
  const window = bounds(segments, widened.lo, widened.hi);
  if (!text || !window || !collapse(text).includes(excerpt)) return emptyDiscourse(JEV_DISCOURSE_FAILURE_NO_NEIGHBORS);
  return succeeded(text, window.start, window.end, indexes, source);
}

function sameRun(anchor: DiscourseNote, sibling: DiscourseNote): boolean {
  const left = String(anchor.extractionRunId || '').trim();
  const right = String(sibling.extractionRunId || '').trim();
  if (!left || !right) return left === right;
  return left === right;
}

function indexesTouch(covered: readonly number[], extra: readonly number[]): boolean {
  if (!covered.length || !extra.length) return false;
  const lo = Math.min(...covered);
  const hi = Math.max(...covered);
  const extraLo = Math.min(...extra);
  const extraHi = Math.max(...extra);
  return extraHi >= lo - 1 && extraLo <= hi + 1;
}

function joinOverlap(left: string, right: string): string | null {
  const max = Math.min(left.length, right.length);
  const floor = Math.min(max, OVERLAP_MIN_CHARS);
  for (let length = max; length >= floor; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) return left + right.slice(length);
  }
  return null;
}

function contextFromStoredExcerpts(
  note: DiscourseNote,
  siblings: readonly DiscourseNote[],
): ShadowDiscourseContext | null {
  const excerpt = note.sourceExcerpt == null ? '' : String(note.sourceExcerpt);
  const anchorStart = finite(note.startSeconds);
  const anchorEnd = finite(note.endSeconds);
  if (!collapse(excerpt) || anchorStart == null || anchorEnd == null) return null;
  if (!contiguous(note.sourceSegmentIndexes || [])) return null;

  let text = excerpt;
  let start = anchorStart;
  let end = anchorEnd;
  let indexes = sortedIndexes(note.sourceSegmentIndexes || []);
  const used = new Set<string>([note.id]);

  const tryAdd = (side: 'before' | 'after' | 'either'): boolean => {
    let best: { joined: string; start: number; end: number; sibling: DiscourseNote; duration: number } | null = null;
    for (const sibling of siblings) {
      if (!sibling.id || used.has(sibling.id) || sibling.id === note.id) continue;
      if (!sameRun(note, sibling)) continue;
      const siblingExcerpt = sibling.sourceExcerpt == null ? '' : String(sibling.sourceExcerpt);
      if (!collapse(siblingExcerpt)) continue;
      const siblingIndexes = sortedIndexes(sibling.sourceSegmentIndexes || []);
      if (!indexesTouch(indexes, siblingIndexes)) continue;
      const siblingStart = finite(sibling.startSeconds);
      const siblingEnd = finite(sibling.endSeconds);
      if (siblingStart == null || siblingEnd == null) continue;

      const joins: string[] = [];
      if (side === 'before' || side === 'either') {
        const before = joinOverlap(siblingExcerpt, text);
        if (before && before.length > text.length) joins.push(before);
      }
      if (side === 'after' || side === 'either') {
        const after = joinOverlap(text, siblingExcerpt);
        if (after && after.length > text.length) joins.push(after);
      }
      for (const joined of joins) {
        if (!joined.includes(excerpt)) continue;
        const nextStart = Math.min(start, siblingStart);
        const nextEnd = Math.max(end, siblingEnd);
        const nextDuration = nextEnd - nextStart;
        if (nextDuration <= end - start || nextDuration > JEV_DISCOURSE_MAX_SECONDS) continue;
        if (!best || nextDuration > best.duration) {
          best = { joined, start: nextStart, end: nextEnd, sibling, duration: nextDuration };
        }
      }
    }
    if (!best) return false;
    text = best.joined;
    start = best.start;
    end = best.end;
    used.add(best.sibling.id);
    indexes = sortedIndexes([...indexes, ...(best.sibling.sourceSegmentIndexes || [])]);
    return true;
  };

  tryAdd('before');
  tryAdd('after');
  while (tryAdd('either')) {
    // Grow toward the 90–180s window while both sides stay inside the stored excerpts.
  }

  const at = text.indexOf(excerpt);
  if (at < 0) return null;
  const before = text.slice(0, at).trim();
  const after = text.slice(at + excerpt.length).trim();
  if (!before || !after) return null;
  return succeeded(text, start, end, indexes, 'source_item_transcript');
}

/**
 * Recover a 90–180s window around a note's source segment indexes.
 * Prefers the original extraction segments when they still map.
 * Otherwise stitches stored source excerpts from the same extraction run.
 * Does not fetch, transcribe, or invent missing text.
 */
export function recoverDiscourseContext(
  note: DiscourseNote,
  input: {
    segments?: readonly CreatorTranscriptSegment[] | null;
    segmentSource?: DiscourseSegmentSource;
    siblings?: readonly DiscourseNote[];
    unavailableReason?: string | null;
  } = {},
): ShadowDiscourseContext {
  const excerpt = collapse(note.sourceExcerpt == null ? '' : String(note.sourceExcerpt));
  if (!excerpt) return emptyDiscourse(JEV_DISCOURSE_FAILURE_EXCERPT_EMPTY);

  const fromExcerpts = contextFromStoredExcerpts(note, input.siblings || []);
  if (input.segments?.length) {
    const fromSegments = contextFromSegments(note, input.segments, input.segmentSource || 'transcript_cache');
    if (fromSegments.discourseContext) return fromSegments;
    if (fromExcerpts) return fromExcerpts;
    return fromSegments;
  }

  if (fromExcerpts) return fromExcerpts;
  if (input.unavailableReason === JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED) {
    return emptyDiscourse(JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED);
  }
  const sameRunSiblings = (input.siblings || []).some(
    (sibling) => sibling.id !== note.id && sameRun(note, sibling) && collapse(String(sibling.sourceExcerpt || '')),
  );
  if (sameRunSiblings) return emptyDiscourse(JEV_DISCOURSE_FAILURE_NO_NEIGHBORS);
  return emptyDiscourse(input.unavailableReason || JEV_DISCOURSE_FAILURE_CACHE_MISSING);
}

export function discourseContextForNote(
  note: Pick<CreatorAtomicNote, 'sourceExcerpt' | 'sourceSegmentIndexes' | 'startSeconds' | 'endSeconds'>,
  segments: readonly CreatorTranscriptSegment[] | null | undefined,
  source: DiscourseSegmentSource = 'transcript_cache',
): ShadowDiscourseContext {
  return recoverDiscourseContext(
    {
      id: '',
      extractionRunId: '',
      sourceExcerpt: note.sourceExcerpt,
      sourceSegmentIndexes: note.sourceSegmentIndexes,
      startSeconds: note.startSeconds,
      endSeconds: note.endSeconds,
    },
    { segments, segmentSource: source },
  );
}

function readCachedSegments(value: unknown): { sourceItemId: string; segments: CreatorTranscriptSegment[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sourceItemId = typeof row.sourceItemId === 'string' ? row.sourceItemId.trim() : '';
  if (!sourceItemId || !Array.isArray(row.segments)) return null;
  const segments: CreatorTranscriptSegment[] = [];
  for (const entry of row.segments) {
    if (!entry || typeof entry !== 'object') continue;
    const segment = entry as Record<string, unknown>;
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    if (!text) continue;
    segments.push({
      index: segments.length,
      startSeconds: finite(segment.startSeconds ?? segment.start),
      endSeconds: finite(segment.endSeconds ?? segment.end),
      text,
    });
  }
  if (!segments.length) return null;
  return { sourceItemId, segments };
}

/** Local transcript cache only. Does not fetch, transcribe, or call a model. */
export function cachedTranscriptsForSources(
  groups: ReadonlyArray<{
    sourceItemId: string;
    notes: ReadonlyArray<
      Pick<CreatorAtomicNote, 'sourceExcerpt' | 'sourceSegmentIndexes' | 'startSeconds' | 'endSeconds'>
    >;
  }>,
  cacheDir = DEFAULT_AUDIO_TRANSCRIPT_CACHE_DIR,
): CachedTranscriptLookup {
  const notesBySource = new Map<string, (typeof groups)[number]['notes']>();
  for (const group of groups) notesBySource.set(group.sourceItemId, group.notes);

  let files: string[] = [];
  try {
    files = readdirSync(cacheDir).filter((file) => file.endsWith('.json'));
  } catch {
    return { transcripts: new Map(), failures: new Map() };
  }

  const matches = new Map<string, Array<{ segments: CreatorTranscriptSegment[]; score: number }>>();
  const sawFile = new Set<string>();
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(cacheDir, file), 'utf8')) as unknown;
    } catch {
      continue;
    }
    const record = readCachedSegments(parsed);
    if (!record || !notesBySource.has(record.sourceItemId)) continue;
    sawFile.add(record.sourceItemId);
    const notes = notesBySource.get(record.sourceItemId) || [];
    const score = notes.filter((note) => mappedIndexSpan(note, record.segments)).length;
    const list = matches.get(record.sourceItemId) || [];
    list.push({ segments: record.segments, score });
    matches.set(record.sourceItemId, list);
  }

  const transcripts = new Map<string, CreatorTranscriptSegment[]>();
  const failures = new Map<string, string>();
  for (const [sourceItemId, list] of matches) {
    list.sort((left, right) => right.score - left.score || right.segments.length - left.segments.length);
    if (list[0] && list[0].score > 0) transcripts.set(sourceItemId, list[0].segments);
    else if (sawFile.has(sourceItemId)) failures.set(sourceItemId, JEV_DISCOURSE_FAILURE_INDEXES_UNMAPPED);
  }
  return { transcripts, failures };
}
