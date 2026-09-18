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
