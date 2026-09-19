import {
  CREATOR_NOTES_CHUNK_OVERLAP_CHARS,
  creatorNotesChunkChars,
  creatorNotesRetryChunkChars,
} from '@/lib/creatorNotes/constants';
import { normalizeWhitespace } from '@/lib/creatorNotes/identity';
import type { CreatorTranscriptChunk, CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

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

function toChunk(chunkSegments: CreatorTranscriptSegment[], index: number): CreatorTranscriptChunk {
  const range = timeRange(chunkSegments);
  const text = chunkText(chunkSegments);
  return {
    index,
    startSeconds: range.startSeconds,
    endSeconds: range.endSeconds,
    segments: chunkSegments,
    segmentIndexes: uniqueSegmentIndexes(chunkSegments),
    text,
    charCount: text.length,
  };
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

export function splitCreatorTranscriptChunk(
  chunk: CreatorTranscriptChunk,
  opts: { chunkChars?: number; overlapChars?: number } = {},
): CreatorTranscriptChunk[] {
  const chunkChars = opts.chunkChars ?? creatorNotesRetryChunkChars(chunk.charCount);
  const children = chunkCreatorTranscript(chunk.segments, {
    chunkChars,
    overlapChars: opts.overlapChars ?? CREATOR_NOTES_CHUNK_OVERLAP_CHARS,
  });
  if (!children.length) return [chunk];
  return children.map((child) => ({
    ...child,
    index: chunk.index,
  }));
}
