import { createHash } from 'node:crypto';

import {
  CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
  type CreatorNoteKind,
} from '@/lib/creatorNotes/constants';
import type { CreatorNoteEventFeatures, CreatorTranscriptSegment } from '@/lib/creatorNotes/types';

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

function attributionKey(value: string | null | undefined): string | null {
  const cleaned = normalizeAttribution(value);
  return cleaned ? cleaned.toLowerCase() : null;
}

function attributionMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = attributionKey(a);
  const right = attributionKey(b);
  return Boolean(left && right && left === right);
}

function featurePool(features: CreatorNoteEventFeatures | null | undefined): string[] {
  if (!features) return [];
  return [...(features.institutions || []), ...(features.referencedDocuments || [])];
}

function isReferencedEntityName(
  value: string | null | undefined,
  knownCreatorName?: string | null,
  eventFeatures?: CreatorNoteEventFeatures | null,
): boolean {
  const cleaned = normalizeAttribution(value);
  if (!cleaned || isGenericSpeakerAttribution(cleaned)) return false;
  if (attributionMatches(cleaned, knownCreatorName)) return false;
  return featurePool(eventFeatures).some((entry) => attributionMatches(entry, cleaned));
}

export function resolveCreatorVersusReferencedSource<
  T extends {
    kind: CreatorNoteKind;
    attribution: string | null;
    referencedSource?: string | null;
    eventFeatures?: CreatorNoteEventFeatures | null;
  },
>(note: T, knownCreatorName?: string | null): T {
  const known = normalizeAttribution(knownCreatorName);
  let attribution = resolveNoteAttribution(note.attribution, knownCreatorName);
  let referencedSource = normalizeAttribution(note.referencedSource);

  const attributionIsCreator = Boolean(known && attributionMatches(attribution, known));
  const attributionIsSpeaker = isGenericSpeakerAttribution(attribution);
  const moveAttributionToReferenced =
    Boolean(known) &&
    Boolean(attribution) &&
    !attributionIsCreator &&
    !attributionIsSpeaker &&
    (note.kind === 'evidence_reference' || isReferencedEntityName(attribution, known, note.eventFeatures));

  if (moveAttributionToReferenced) {
    referencedSource = referencedSource || attribution;
    attribution = known || null;
  }

  if (note.kind === 'evidence_reference') {
    if (known) attribution = known;
    if (!referencedSource) {
      referencedSource =
        normalizeAttribution(note.eventFeatures?.referencedDocuments?.[0]) ||
        normalizeAttribution(note.eventFeatures?.institutions?.[0]) ||
        null;
    }
  }

  return {
    ...note,
    attribution,
    referencedSource: referencedSource || null,
  };
}

export function applyKnownCreatorAttribution<
  T extends {
    kind: CreatorNoteKind;
    attribution: string | null;
    referencedSource?: string | null;
    eventFeatures?: CreatorNoteEventFeatures | null;
  },
>(notes: T[], knownCreatorName?: string | null): T[] {
  return notes.map((note) => resolveCreatorVersusReferencedSource(note, knownCreatorName));
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

export function canonicalizeTranscriptSegments(
  segments: CreatorTranscriptSegment[],
  version: string = CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
): CreatorTranscriptSegment[] {
  // v1: stable parse only. Caption-merge is a different algorithm and must not
  // silently rewrite Whisper cache identity. Unknown versions still parse as v1
  // so callers can include a bumped version in the hash without changing text.
  void version;
  const out: CreatorTranscriptSegment[] = [];
  for (const row of segments || []) {
    const text = normalizeWhitespace(String(row?.text || ''));
    if (!text) continue;
    const start =
      row.startSeconds != null && Number.isFinite(row.startSeconds) ? row.startSeconds : null;
    const end = row.endSeconds != null && Number.isFinite(row.endSeconds) ? row.endSeconds : null;
    out.push({
      index: out.length,
      startSeconds: start,
      endSeconds: end,
      text,
    });
  }
  return out;
}

export function hashRawTranscription(segments: CreatorTranscriptSegment[]): string {
  const payload = `raw\n${serializeTranscriptForHash(segments)}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function hashCanonicalTranscript(
  segments: CreatorTranscriptSegment[],
  normalizationVersion: string = CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
): string {
  const payload = `${normalizationVersion}\n${serializeTranscriptForHash(segments)}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function hashCreatorTranscript(
  segments: CreatorTranscriptSegment[],
  opts: { normalizationVersion?: string } = {},
): string {
  return hashCanonicalTranscript(
    segments,
    opts.normalizationVersion || CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
  );
}

export function hashEvidenceWindow(input: {
  windowId: string;
  segmentIndexes: number[];
  startSeconds: number | null;
  endSeconds: number | null;
  text: string;
}): string {
  const payload = [
    String(input.windowId || ''),
    input.segmentIndexes.join(','),
    timestampKey(input.startSeconds),
    timestampKey(input.endSeconds),
    normalizeWhitespace(input.text).replace(/\s+/g, ' '),
  ].join('|');
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
