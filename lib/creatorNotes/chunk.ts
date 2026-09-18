import {
  CREATOR_NOTES_CHUNK_OVERLAP_CHARS,
  creatorNotesChunkChars,
} from '@/lib/creatorNotes/constants';
import { normalizeWhitespace } from '@/lib/creatorNotes/identity';
import type { CreatorTranscriptChunk, CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

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

function splitOversizedSegment(segment: CreatorTranscriptSegment, maxChars: number): CreatorTranscriptSegment[] {
  const text = String(segment.text || '');
  if (text.length <= maxChars) return [segment];

  const parts: CreatorTranscriptSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const remaining = text.length - cursor;
    const take = Math.min(maxChars, remaining);
    let end = cursor + take;
    if (end < text.length) {
      const window = text.slice(cursor, end);
      const breakAt = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf(' '));
      if (breakAt >= Math.floor(maxChars * 0.5)) {
        end = cursor + breakAt + 1;
      }
    }
    const slice = text.slice(cursor, end).trim();
    if (slice) {
      parts.push({
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        text: slice,
      });
    }
    cursor = end;
  }
  return parts.length ? parts : [segment];
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

export function chunkCreatorTranscript(
  segments: CreatorTranscriptSegment[],
  opts: { chunkChars?: number; overlapChars?: number } = {},
): CreatorTranscriptChunk[] {
  const maxChars = opts.chunkChars ?? creatorNotesChunkChars();
  const overlapChars = opts.overlapChars ?? CREATOR_NOTES_CHUNK_OVERLAP_CHARS;
  const flattened: CreatorTranscriptSegment[] = [];
  for (const segment of segments) {
    flattened.push(...splitOversizedSegment(segment, maxChars));
  }

  const chunks: CreatorTranscriptSegment[][] = [];
  let current: CreatorTranscriptSegment[] = [];
  let currentChars = 0;

  for (const segment of flattened) {
    const size = segmentChars(segment);
    if (current.length > 0 && currentChars + size > maxChars) {
      chunks.push(current);
      const overlap = overlapSegments(current, overlapChars);
      current = [...overlap];
      currentChars = current.reduce((sum, item) => sum + segmentChars(item), 0);
    }
    current.push(segment);
    currentChars += size;
  }
  if (current.length) chunks.push(current);

  return chunks.map((chunkSegments, index) => {
    const range = timeRange(chunkSegments);
    const text = chunkText(chunkSegments);
    return {
      index,
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds,
      segments: chunkSegments,
      text,
      charCount: text.length,
    };
  });
}
