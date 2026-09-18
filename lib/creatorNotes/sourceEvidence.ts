import {
  CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS,
  CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS,
  CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS,
  CREATOR_NOTES_SOURCE_INDEX_MAX_GAP,
} from '@/lib/creatorNotes/constants';
import {
  concatenateTranscriptSegments,
  extractVerifiedQuote,
  normalizeForQuoteMatch,
} from '@/lib/creatorNotes/quotes';
import type {
  CreatorNoteEvidenceDiagnostics,
  CreatorNoteQuoteDiagnostics,
  CreatorTranscriptSegment,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';

export function emptyEvidenceDiagnostics(): CreatorNoteEvidenceDiagnostics {
  return {
    notesWithSourceEvidence: 0,
    notesWithoutSourceEvidence: 0,
    invalidSourceSegmentReferences: 0,
    exactQuotesRequested: 0,
    exactQuotesVerified: 0,
    exactQuotesRejected: 0,
  };
}

export function quoteDiagnosticsFromEvidence(
  diagnostics: CreatorNoteEvidenceDiagnostics,
): CreatorNoteQuoteDiagnostics {
  return {
    requested: diagnostics.exactQuotesRequested,
    verified: diagnostics.exactQuotesVerified,
    rejected: diagnostics.exactQuotesRejected,
  };
}

function unwrapOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const start = trimmed[0];
  const end = trimmed[trimmed.length - 1];
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['\u201C', '\u201D'],
    ['\u2018', '\u2019'],
  ];
  if (pairs.some(([open, close]) => start === open && end === close)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function quoteCandidateLength(value: string): number {
  return normalizeForQuoteMatch(unwrapOuterQuotes(value) || value.trim()).normalized.length;
}

export function uniqueSortedIndexes(indexes: number[]): number[] {
  return [...new Set(indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b);
}

export function sourceIndexesAreNearlyContiguous(
  indexes: number[],
  maxGap = CREATOR_NOTES_SOURCE_INDEX_MAX_GAP,
): boolean {
  if (indexes.length <= 1) return true;
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] - indexes[i - 1] > maxGap + 1) return false;
  }
  return true;
}

export function fillIndexRange(indexes: number[]): number[] {
  const sorted = uniqueSortedIndexes(indexes);
  if (sorted.length === 0) return [];
  const out: number[] = [];
  for (let index = sorted[0]; index <= sorted[sorted.length - 1]; index += 1) {
    out.push(index);
  }
  return out;
}

function inBoundsIndexes(indexes: number[], segmentCount: number): number[] {
  return uniqueSortedIndexes(indexes).filter((index) => index < segmentCount);
}

export function trimToWordBoundary(text: string, maxChars: number): string {
  const cleaned = String(text || '').trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, maxChars);
  const nextChar = cleaned[maxChars];
  if (!nextChar || /\s/.test(nextChar)) {
    return slice.trimEnd();
  }
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace <= 0) {
    return slice.trimEnd();
  }
  return slice.slice(0, lastSpace).trimEnd();
}

function contiguousWindows(indexes: number[], maxSegments: number): number[][] {
  const windows: number[][] = [];
  const maxSize = Math.min(maxSegments, indexes.length);
  for (let size = 1; size <= maxSize; size += 1) {
    for (let start = 0; start + size <= indexes.length; start += 1) {
      windows.push(indexes.slice(start, start + size));
    }
  }
  return windows;
}

function compareWindows(
  a: number[],
  b: number[],
  segments: CreatorTranscriptSegment[],
): number {
  if (a.length !== b.length) return a.length - b.length;
  const aLen = concatenateTranscriptSegments(segments, a).length;
  const bLen = concatenateTranscriptSegments(segments, b).length;
  if (aLen !== bLen) return aLen - bLen;
  return a[0] - b[0];
}

export function buildSourceExcerpt(
  segments: CreatorTranscriptSegment[],
  indexes: number[],
  opts: { maxChars?: number; maxSegments?: number } = {},
): { excerpt: string; indexes: number[] } | null {
  const maxChars = opts.maxChars ?? CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS;
  const maxSegments = opts.maxSegments ?? CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS;
  const bounded = inBoundsIndexes(indexes, segments.length);
  if (!bounded.length) return null;

  const joined = concatenateTranscriptSegments(segments, bounded);
  if (!joined) return null;

  if (bounded.length <= maxSegments && joined.length <= maxChars) {
    return { excerpt: joined, indexes: bounded };
  }

  const maxSize = Math.min(maxSegments, bounded.length);
  for (let size = maxSize; size >= 1; size -= 1) {
    const windows = contiguousWindows(bounded, size).filter((window) => window.length === size);
    const fitting = windows.filter(
      (window) => concatenateTranscriptSegments(segments, window).length <= maxChars,
    );
    if (!fitting.length) continue;
    fitting.sort((a, b) => compareWindows(a, b, segments));
    const chosen = fitting[0];
    return {
      excerpt: concatenateTranscriptSegments(segments, chosen),
      indexes: chosen,
    };
  }

  const singles = contiguousWindows(bounded, 1).filter((window) => window.length === 1);
  singles.sort((a, b) => compareWindows(a, b, segments));
  const fallback = singles[0] || [bounded[0]];
  const excerpt = trimToWordBoundary(concatenateTranscriptSegments(segments, fallback), maxChars);
  if (!excerpt) return null;
  return { excerpt, indexes: fallback };
}

export function resolveSourceSegmentEvidence(
  requestedIndexes: number[],
  segments: CreatorTranscriptSegment[],
): {
  ok: boolean;
  excerpt: string | null;
  indexes: number[];
  invalid: boolean;
} {
  const requested = uniqueSortedIndexes(requestedIndexes);
  if (!requested.length) {
    return { ok: true, excerpt: null, indexes: [], invalid: false };
  }

  const inBounds = inBoundsIndexes(requested, segments.length);
  if (inBounds.length !== requested.length || !sourceIndexesAreNearlyContiguous(inBounds)) {
    return { ok: false, excerpt: null, indexes: [], invalid: true };
  }

  const filled = fillIndexRange(inBounds).filter((index) => index < segments.length);
  const built = buildSourceExcerpt(segments, filled);
  if (!built?.excerpt) {
    return { ok: false, excerpt: null, indexes: [], invalid: true };
  }
  return { ok: true, excerpt: built.excerpt, indexes: built.indexes, invalid: false };
}

function verifyExactQuote(rawQuote: string | null, sourceText: string): string | null {
  const candidate = typeof rawQuote === 'string' ? unwrapOuterQuotes(rawQuote) || rawQuote.trim() : '';
  if (!candidate || !sourceText) return null;
  if (quoteCandidateLength(candidate) > CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS) return null;
  const verbatim = extractVerifiedQuote(candidate, sourceText);
  if (!verbatim || quoteCandidateLength(verbatim) > CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS) return null;
  return verbatim;
}

export function applySourceEvidence(
  notes: RawCreatorNote[],
  segments: CreatorTranscriptSegment[],
): { notes: RawCreatorNote[]; diagnostics: CreatorNoteEvidenceDiagnostics } {
  const diagnostics = emptyEvidenceDiagnostics();
  const evidenced = notes.map((note) => {
    const requestedIndexes = Array.isArray(note.sourceSegmentIndexes) ? note.sourceSegmentIndexes : [];
    const resolved = resolveSourceSegmentEvidence(requestedIndexes, segments);
    if (resolved.invalid) diagnostics.invalidSourceSegmentReferences += 1;
    if (resolved.excerpt) diagnostics.notesWithSourceEvidence += 1;
    else diagnostics.notesWithoutSourceEvidence += 1;

    const rawQuote = typeof note.exactQuote === 'string' ? note.exactQuote : null;
    const candidate = rawQuote ? unwrapOuterQuotes(rawQuote) || rawQuote.trim() : '';
    let exactQuote: string | null = null;
    if (candidate) {
      diagnostics.exactQuotesRequested += 1;
      exactQuote = verifyExactQuote(rawQuote, resolved.excerpt || '');
      if (exactQuote) diagnostics.exactQuotesVerified += 1;
      else diagnostics.exactQuotesRejected += 1;
    }

    return {
      ...note,
      sourceExcerpt: resolved.excerpt,
      exactQuote,
      sourceSegmentIndexes: resolved.indexes,
    };
  });
  return { notes: evidenced, diagnostics };
}
