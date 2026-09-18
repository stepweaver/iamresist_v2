import { normalizeWhitespace } from '@/lib/creatorNotes/identity';
import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

export const CAPTION_MERGE_TARGET_MIN_SECONDS = 15;
export const CAPTION_MERGE_TARGET_MAX_SECONDS = 30;
export const CAPTION_MERGE_MAX_GAP_SECONDS = 3;

export interface CaptionCue {
  startSeconds: number | null;
  endSeconds: number | null;
  text: string;
}

function optionalFinite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function cueStart(cue: CaptionCue): number {
  if (cue.startSeconds != null && Number.isFinite(cue.startSeconds)) return cue.startSeconds;
  return Number.POSITIVE_INFINITY;
}

function cueEnd(cue: CaptionCue): number | null {
  if (cue.endSeconds != null && Number.isFinite(cue.endSeconds)) return cue.endSeconds;
  if (cue.startSeconds != null && Number.isFinite(cue.startSeconds)) return cue.startSeconds;
  return null;
}

function compareCues(a: CaptionCue, b: CaptionCue): number {
  const startDiff = cueStart(a) - cueStart(b);
  if (startDiff !== 0) return startDiff;
  const aEnd = cueEnd(a);
  const bEnd = cueEnd(b);
  if (aEnd == null && bEnd == null) return 0;
  if (aEnd == null) return -1;
  if (bEnd == null) return 1;
  return aEnd - bEnd;
}

function canMerge(current: CaptionCue, next: CaptionCue): boolean {
  const currentStart = optionalFinite(current.startSeconds);
  const currentEnd = cueEnd(current);
  const nextStart = optionalFinite(next.startSeconds);
  const nextEnd = cueEnd(next);

  if (currentStart == null || nextStart == null) return false;
  if (currentEnd == null) return false;

  const gap = nextStart - currentEnd;
  if (gap > CAPTION_MERGE_MAX_GAP_SECONDS) return false;

  const mergedEnd = nextEnd == null ? nextStart : nextEnd;
  const mergedSpan = mergedEnd - currentStart;
  if (mergedSpan > CAPTION_MERGE_TARGET_MAX_SECONDS) return false;

  return true;
}

function joinCueText(left: string, right: string): string {
  return normalizeWhitespace(`${left} ${right}`);
}

function toSegment(cue: CaptionCue, index: number): CreatorTranscriptSegment {
  return {
    index,
    startSeconds: optionalFinite(cue.startSeconds),
    endSeconds: optionalFinite(cue.endSeconds),
    text: cue.text,
  };
}

export function normalizeCaptionCues(cues: CaptionCue[]): CreatorTranscriptSegment[] {
  const cleaned = cues
    .map((cue) => ({
      startSeconds: optionalFinite(cue.startSeconds),
      endSeconds: optionalFinite(cue.endSeconds),
      text: normalizeWhitespace(cue.text),
    }))
    .filter((cue) => Boolean(cue.text));

  cleaned.sort(compareCues);

  const merged: CaptionCue[] = [];
  for (const cue of cleaned) {
    const current = merged[merged.length - 1];
    if (current && canMerge(current, cue)) {
      current.endSeconds = cueEnd(cue);
      current.text = joinCueText(current.text, cue.text);
      continue;
    }
    merged.push({
      startSeconds: cue.startSeconds,
      endSeconds: cueEnd(cue),
      text: cue.text,
    });
  }

  return merged.map(toSegment);
}

export function durationCoveredSeconds(segments: Array<{
  startSeconds: number | null;
  endSeconds: number | null;
}>): number | null {
  const starts = segments
    .map((segment) => optionalFinite(segment.startSeconds))
    .filter((value): value is number => value != null);
  const ends = segments
    .map((segment) => optionalFinite(segment.endSeconds) ?? optionalFinite(segment.startSeconds))
    .filter((value): value is number => value != null);
  if (!starts.length || !ends.length) return null;
  return Math.max(...ends) - Math.min(...starts);
}
