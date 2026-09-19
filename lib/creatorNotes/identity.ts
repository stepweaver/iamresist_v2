import { createHash } from 'node:crypto';

import type { CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(String(value || '').trim());
}

export function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function normalizeNoteText(value: string): string {
  return normalizeWhitespace(value).replace(/\s+/g, ' ').trim();
}

export function normalizeFingerprintText(value: string): string {
  return normalizeNoteText(value).toLowerCase();
}

export function normalizeAttribution(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = normalizeNoteText(String(value));
  return cleaned || null;
}

export function isGenericSpeakerAttribution(value: string | null | undefined): boolean {
  const cleaned = normalizeAttribution(value);
  if (!cleaned) return false;
  return /^(the\s+)?speaker$/i.test(cleaned);
}

export function resolveNoteAttribution(
  value: string | null | undefined,
  knownCreatorName?: string | null,
): string | null {
  const known = normalizeAttribution(knownCreatorName);
  const cleaned = normalizeAttribution(value);
  if (known && (!cleaned || isGenericSpeakerAttribution(cleaned))) {
    return known;
  }
  return cleaned;
}

export function applyKnownCreatorAttribution<T extends { attribution: string | null }>(
  notes: T[],
  knownCreatorName?: string | null,
): T[] {
  return notes.map((note) => ({
    ...note,
    attribution: resolveNoteAttribution(note.attribution, knownCreatorName),
  }));
}

function timestampKey(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

export function serializeTranscriptForHash(segments: CreatorTranscriptSegment[]): string {
  const lines = segments.map((segment) => {
    const text = normalizeWhitespace(segment.text).replace(/\s+/g, ' ');
    return `${timestampKey(segment.startSeconds)}|${timestampKey(segment.endSeconds)}|${text}`;
  });
  return lines.join('\n').trim();
}

export function hashCreatorTranscript(segments: CreatorTranscriptSegment[]): string {
  const payload = serializeTranscriptForHash(segments);
  return createHash('sha256').update(payload).digest('hex');
}

export function creatorNoteFingerprint(input: {
  sourceItemId: string;
  kind: string;
  text: string;
  startSeconds: number | null;
}): string {
  const payload = [
    String(input.sourceItemId || '').trim(),
    String(input.kind || '').trim(),
    normalizeFingerprintText(input.text),
    timestampKey(input.startSeconds),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function overlapDedupeKey(input: { kind: string; text: string }): string {
  return `${String(input.kind || '').trim()}|${normalizeFingerprintText(input.text)}`;
}

export function normalizeComparableNoteText(value: string): string {
  return normalizeFingerprintText(value).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function noteTextSimilarity(a: string, b: string): number {
  const left = normalizeComparableNoteText(a);
  const right = normalizeComparableNoteText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function sourceSegmentRangesOverlap(a: number[], b: number[]): boolean {
  if (!a.length || !b.length) return false;
  const left = [...new Set(a)].filter((index) => Number.isInteger(index)).sort((x, y) => x - y);
  const right = [...new Set(b)].filter((index) => Number.isInteger(index)).sort((x, y) => x - y);
  if (!left.length || !right.length) return false;
  return left[0] <= right[right.length - 1] && right[0] <= left[left.length - 1];
}

export function transcriptCharCount(segments: CreatorTranscriptSegment[]): number {
  return segments.reduce((sum, segment) => sum + String(segment.text || '').length, 0);
}

export function dedupeStringsCaseInsensitive(values: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const cleaned = normalizeNoteText(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}
