import {
  CREATOR_NOTES_CHUNK_OVERLAP_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS,
  CREATOR_NOTES_EVIDENCE_WINDOW_MIN_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_CHARS,
  CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS,
  CREATOR_NOTES_EVIDENCE_WINDOW_TARGET_SECONDS,
  creatorNotesChunkChars,
  creatorNotesRetryChunkChars,
} from '@/lib/creatorNotes/constants';
import { normalizeWhitespace } from '@/lib/creatorNotes/identity';
import type {
  CreatorEvidenceWindow,
  CreatorTranscriptChunk,
  CreatorTranscriptSegment,
  TranscriptContentRole,
} from '@/lib/creatorNotes/types';

function uniqueSegmentIndexes(segments: CreatorTranscriptSegment[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const segment of segments) {
    if (!Number.isInteger(segment.index) || seen.has(segment.index)) continue;
    seen.add(segment.index);
    out.push(segment.index);
  }
  return out;
}

function withOriginalIndexes(segments: CreatorTranscriptSegment[]): CreatorTranscriptSegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    index: Number.isInteger(segment.index) && segment.index >= 0 ? segment.index : index,
  }));
}

function segmentChars(segment: CreatorTranscriptSegment): number {
  return String(segment.text || '').length;
}

function chunkText(segments: CreatorTranscriptSegment[]): string {
  return segments
    .map((segment) => normalizeWhitespace(segment.text))
    .filter(Boolean)
    .join('\n');
}

function timeRange(segments: CreatorTranscriptSegment[]): {
  startSeconds: number | null;
  endSeconds: number | null;
} {
  let start: number | null = null;
  let end: number | null = null;
  for (const segment of segments) {
    if (segment.startSeconds != null && Number.isFinite(segment.startSeconds)) {
      start = start == null ? segment.startSeconds : Math.min(start, segment.startSeconds);
    }
    if (segment.endSeconds != null && Number.isFinite(segment.endSeconds)) {
      end = end == null ? segment.endSeconds : Math.max(end, segment.endSeconds);
    } else if (segment.startSeconds != null && Number.isFinite(segment.startSeconds)) {
      end = end == null ? segment.startSeconds : Math.max(end, segment.startSeconds);
    }
  }
  return { startSeconds: start, endSeconds: end };
}

function durationSeconds(range: { startSeconds: number | null; endSeconds: number | null }): number | null {
  if (range.startSeconds == null || range.endSeconds == null) return null;
  if (!Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds)) return null;
  return Math.max(0, range.endSeconds - range.startSeconds);
}

function segmentDurationSeconds(segment: CreatorTranscriptSegment): number | null {
  return durationSeconds({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds });
}

function hasTimestamps(segments: CreatorTranscriptSegment[]): boolean {
  return segments.some(
    (segment) =>
      (segment.startSeconds != null && Number.isFinite(segment.startSeconds)) ||
      (segment.endSeconds != null && Number.isFinite(segment.endSeconds)),
  );
}

function overlapSegments(segments: CreatorTranscriptSegment[], overlapChars: number): CreatorTranscriptSegment[] {
  if (overlapChars <= 0 || segments.length === 0) return [];
  const out: CreatorTranscriptSegment[] = [];
  let total = 0;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    out.unshift(segments[i]);
    total += segmentChars(segments[i]);
    if (total >= overlapChars) break;
  }
  return out;
}

function segmentContentRole(segment: CreatorTranscriptSegment): TranscriptContentRole {
  if (
    segment.contentRole === 'editorial' ||
    segment.contentRole === 'sponsor_read' ||
    segment.contentRole === 'housekeeping' ||
    segment.contentRole === 'intro_outro' ||
    segment.contentRole === 'uncertain'
  ) {
    return segment.contentRole;
  }
  return 'uncertain';
}

function windowContentRole(segments: CreatorTranscriptSegment[]): TranscriptContentRole {
  const roles = new Set(segments.map((segment) => segmentContentRole(segment)));
  if (roles.size === 1) return [...roles][0];
  return 'uncertain';
}

function toChunk(chunkSegments: CreatorTranscriptSegment[], index: number): CreatorTranscriptChunk {
  const range = timeRange(chunkSegments);
  const text = chunkText(chunkSegments);
  return {
    index,
    windowId: `w${index}`,
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
    segments: chunkSegments,
    segmentIndexes: uniqueSegmentIndexes(chunkSegments),
    text,
    verbatimTranscript: text,
    charCount: text.length,
    contentRole: windowContentRole(chunkSegments),
  };
}

function wouldExceedMax(
  current: CreatorTranscriptSegment[],
  next: CreatorTranscriptSegment,
  opts: { maxChars: number; maxSeconds: number; timed: boolean },
): boolean {
  if (!current.length) return false;
  const nextChars = current.reduce((sum, segment) => sum + segmentChars(segment), 0) + segmentChars(next);
  if (nextChars > opts.maxChars) return true;
  if (!opts.timed) return false;
  const range = timeRange([...current, next]);
  const duration = durationSeconds(range);
  return duration != null && duration > opts.maxSeconds;
}

function windowIsComplete(
  current: CreatorTranscriptSegment[],
  opts: { maxChars: number; minChars: number; targetSeconds: number; timed: boolean },
): boolean {
  if (!current.length) return false;
  const chars = current.reduce((sum, segment) => sum + segmentChars(segment), 0);
  if (chars >= opts.maxChars) return true;
  if (opts.timed) {
    const duration = durationSeconds(timeRange(current));
    return duration != null && duration >= opts.targetSeconds;
  }
  return chars >= opts.minChars;
}

function overlapStartIndex(
  segments: CreatorTranscriptSegment[],
  start: number,
  end: number,
  opts: { timed: boolean; overlapSeconds: number; overlapChars: number },
): number {
  if (end < start) return start + 1;
  if (opts.timed) {
    const range = timeRange(segments.slice(start, end + 1));
    if (range.endSeconds == null || !Number.isFinite(range.endSeconds)) {
      return Math.min(end, start + 1);
    }
    const overlapFrom = range.endSeconds - opts.overlapSeconds;
    let nextStart = end;
    for (let i = end; i > start; i -= 1) {
      const segment = segments[i];
      const segStart =
        segment.startSeconds != null && Number.isFinite(segment.startSeconds)
          ? segment.startSeconds
          : segment.endSeconds;
      if (segStart == null || !Number.isFinite(segStart) || segStart <= overlapFrom) {
        nextStart = i;
        break;
      }
      nextStart = i;
    }
    return Math.max(start + 1, nextStart);
  }

  let total = 0;
  let nextStart = end;
  for (let i = end; i > start; i -= 1) {
    total += segmentChars(segments[i]);
    nextStart = i;
    if (total >= opts.overlapChars) break;
  }
  return Math.max(start + 1, nextStart);
}

export function chunkCreatorTranscript(
  segments: CreatorTranscriptSegment[],
  opts: { chunkChars?: number; overlapChars?: number } = {},
): CreatorTranscriptChunk[] {
  const maxChars = opts.chunkChars ?? creatorNotesChunkChars();
  const overlapChars = opts.overlapChars ?? CREATOR_NOTES_CHUNK_OVERLAP_CHARS;
  const indexed = withOriginalIndexes(segments);

  const groups: CreatorTranscriptSegment[][] = [];
  let current: CreatorTranscriptSegment[] = [];
  let currentChars = 0;

  for (const segment of indexed) {
    const size = segmentChars(segment);
    if (current.length > 0 && currentChars + size > maxChars) {
      groups.push(current);
      const overlap = overlapSegments(current, overlapChars);
      current = [...overlap];
      currentChars = current.reduce((sum, item) => sum + segmentChars(item), 0);
    }
    current.push(segment);
    currentChars += size;
  }
  if (current.length) groups.push(current);

  return groups.map((chunkSegments, index) => toChunk(chunkSegments, index));
}

export function buildEvidenceWindows(
  segments: CreatorTranscriptSegment[],
  opts: {
    minChars?: number;
    maxChars?: number;
    targetSeconds?: number;
    maxSeconds?: number;
    overlapSeconds?: number;
    overlapChars?: number;
  } = {},
): CreatorEvidenceWindow[] {
  const indexed = withOriginalIndexes(segments);
  if (!indexed.length) return [];

  const maxChars = opts.maxChars ?? CREATOR_NOTES_EVIDENCE_WINDOW_MAX_CHARS;
  const minChars = opts.minChars ?? CREATOR_NOTES_EVIDENCE_WINDOW_MIN_CHARS;
  const targetSeconds = opts.targetSeconds ?? CREATOR_NOTES_EVIDENCE_WINDOW_TARGET_SECONDS;
  const maxSeconds = opts.maxSeconds ?? CREATOR_NOTES_EVIDENCE_WINDOW_MAX_SECONDS;
  const overlapSeconds = opts.overlapSeconds ?? CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_SECONDS;
  const overlapChars = opts.overlapChars ?? CREATOR_NOTES_EVIDENCE_WINDOW_OVERLAP_CHARS;
  const timed = hasTimestamps(indexed);

  const windows: CreatorEvidenceWindow[] = [];
  let start = 0;

  while (start < indexed.length) {
    const current: CreatorTranscriptSegment[] = [];
    let end = start - 1;
    for (let i = start; i < indexed.length; i += 1) {
      const next = indexed[i];
      if (current.length > 0 && segmentContentRole(current[0]) !== segmentContentRole(next)) {
        break;
      }
      if (
        wouldExceedMax(current, next, { maxChars, maxSeconds, timed }) &&
        current.length > 0
      ) {
        break;
      }
      current.push(next);
      end = i;
      if (windowIsComplete(current, { maxChars, minChars, targetSeconds, timed })) {
        break;
      }
    }
    if (!current.length) break;
    windows.push(toChunk(current, windows.length));
    if (end >= indexed.length - 1) break;
    const following = indexed[end + 1];
    if (following && segmentContentRole(current[0]) !== segmentContentRole(following)) {
      start = end + 1;
      continue;
    }
    const nextStart = overlapStartIndex(indexed, start, end, {
      timed,
      overlapSeconds,
      overlapChars,
    });
    if (nextStart <= start) {
      start += 1;
    } else {
      start = nextStart;
    }
  }

  return windows;
}

export function splitCreatorTranscriptChunk(
  chunk: CreatorTranscriptChunk,
  opts: { chunkChars?: number; overlapChars?: number } = {},
): CreatorTranscriptChunk[] {
  const chunkChars = opts.chunkChars ?? creatorNotesRetryChunkChars(chunk.charCount);
  if (chunk.segments.length <= 1 || chunkChars >= chunk.charCount) {
    return [chunk];
  }
  const children = chunkCreatorTranscript(chunk.segments, {
    chunkChars,
    overlapChars: opts.overlapChars ?? CREATOR_NOTES_CHUNK_OVERLAP_CHARS,
  });
  if (!children.length) return [chunk];
  if (children.length === 1 && children[0].segmentIndexes.join(',') === chunk.segmentIndexes.join(',')) {
    return [chunk];
  }
  return children.map((child, offset) => ({
    ...child,
    index: chunk.index,
    windowId: `${chunk.windowId || `w${chunk.index}`}.${offset}`,
  }));
}

export function evidenceWindowDurationSeconds(window: CreatorTranscriptChunk): number | null {
  return durationSeconds(window);
}

export function evidenceWindowSegmentDuration(segment: CreatorTranscriptSegment): number | null {
  return segmentDurationSeconds(segment);
}
