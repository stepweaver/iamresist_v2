import {
  CREATOR_NOTES_COMPOUND_NUMERIC_LIMIT,
  CREATOR_NOTES_COMPOUND_SENTENCE_LIMIT,
  CREATOR_NOTES_EVIDENCE_DURATION_FLAG_SECONDS,
  CREATOR_NOTES_EVIDENCE_DURATION_MAX_SECONDS,
  CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS,
  CREATOR_NOTES_PREFERRED_SOURCE_SEGMENTS,
  CREATOR_NOTES_SOURCE_EXCERPT_MAX_CHARS,
  CREATOR_NOTES_SOURCE_INDEX_MAX_GAP,
  CREATOR_NOTES_TEXT_MAX_CHARS,
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
    quoteVerificationRejected: 0,
    groundingRejected: 0,
    unsupportedNumberRejected: 0,
    compoundRejected: 0,
    wideEvidenceWindows: 0,
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
  const excerptText = concatenateTranscriptSegments(segments, filled);
  if (!excerptText) {
    return { ok: false, excerpt: null, indexes: [], invalid: true };
  }
  const built = buildSourceExcerpt(segments, filled);
  return {
    ok: true,
    excerpt: built?.excerpt || excerptText,
    indexes: filled,
    invalid: false,
  };
}

function verifyExactQuote(rawQuote: string | null, sourceText: string): string | null {
  const candidate = typeof rawQuote === 'string' ? unwrapOuterQuotes(rawQuote) || rawQuote.trim() : '';
  if (!candidate || !sourceText) return null;
  if (quoteCandidateLength(candidate) > CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS) return null;
  const verbatim = extractVerifiedQuote(candidate, sourceText);
  if (!verbatim || quoteCandidateLength(verbatim) > CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS) return null;
  return verbatim;
}

export function proposedSourceQuote(note: RawCreatorNote): string | null {
  const raw = note.sourceQuote || note.exactQuote;
  if (typeof raw !== 'string') return null;
  const candidate = unwrapOuterQuotes(raw) || raw.trim();
  return candidate || null;
}

export function smallestIndexesContainingQuote(
  segments: CreatorTranscriptSegment[],
  indexes: number[],
  quote: string,
): number[] | null {
  const sorted = uniqueSortedIndexes(indexes).filter((index) => index < segments.length);
  if (!sorted.length) return null;
  const sourceText = concatenateTranscriptSegments(segments, sorted);
  const verbatim = verifyExactQuote(quote, sourceText);
  if (!verbatim) return null;

  let best: number[] | null = null;
  for (let start = 0; start < sorted.length; start += 1) {
    for (let end = start; end < sorted.length; end += 1) {
      const window = sorted.slice(start, end + 1);
      if (!sourceIndexesAreNearlyContiguous(window)) continue;
      if (!verifyExactQuote(verbatim, concatenateTranscriptSegments(segments, window))) continue;
      if (
        !best ||
        window.length < best.length ||
        (window.length === best.length && window[0] < best[0])
      ) {
        best = window;
      }
    }
  }
  return best;
}

function normalizeNumericHaystack(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\$/g, ' ')
    .replace(/%/g, ' percent ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractNumericTokens(text: string): string[] {
  const source = String(text || '');
  const matches = source.match(/\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+\s*%|\b\d{4}\b|\b\d{2,}\b/g) || [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const normalized = match.replace(/,/g, '').replace(/\$/g, '').replace(/\s+/g, '').toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function unsupportedNumericTokens(noteText: string, evidenceText: string): string[] {
  const haystack = normalizeNumericHaystack(evidenceText);
  return extractNumericTokens(noteText).filter((token) => {
    const bare = token.replace(/%/g, '');
    return !haystack.includes(bare);
  });
}

export function countNotebookSentences(text: string): number {
  return String(text || '')
    .split(/[.!?]+\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20).length;
}

export function compoundNoteReason(text: string): 'text_too_long' | 'text_not_atomic' | null {
  const cleaned = String(text || '').trim();
  if (cleaned.length > CREATOR_NOTES_TEXT_MAX_CHARS) return 'text_too_long';
  const sentences = countNotebookSentences(cleaned);
  const numbers = extractNumericTokens(cleaned);
  if (sentences > CREATOR_NOTES_COMPOUND_SENTENCE_LIMIT) return 'text_not_atomic';
  if (numbers.length >= CREATOR_NOTES_COMPOUND_NUMERIC_LIMIT) return 'text_not_atomic';
  if (sentences >= 2 && numbers.length >= 3) return 'text_not_atomic';
  return null;
}

function evidenceDurationSeconds(
  range: { startSeconds: number | null; endSeconds: number | null },
): number | null {
  if (range.startSeconds == null || range.endSeconds == null) return null;
  if (!Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds)) return null;
  return Math.max(0, range.endSeconds - range.startSeconds);
}

function timeRangeFromIndexes(
  segments: CreatorTranscriptSegment[],
  indexes: number[],
): { startSeconds: number | null; endSeconds: number | null } {
  let start: number | null = null;
  let end: number | null = null;
  for (const index of uniqueSortedIndexes(indexes)) {
    const segment = segments[index];
    if (!segment) continue;
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

export function addEvidenceDiagnostics(
  target: CreatorNoteEvidenceDiagnostics,
  extra: CreatorNoteEvidenceDiagnostics,
): CreatorNoteEvidenceDiagnostics {
  target.notesWithSourceEvidence += extra.notesWithSourceEvidence;
  target.notesWithoutSourceEvidence += extra.notesWithoutSourceEvidence;
  target.invalidSourceSegmentReferences += extra.invalidSourceSegmentReferences;
  target.exactQuotesRequested += extra.exactQuotesRequested;
  target.exactQuotesVerified += extra.exactQuotesVerified;
  target.exactQuotesRejected += extra.exactQuotesRejected;
  target.quoteVerificationRejected += extra.quoteVerificationRejected;
  target.groundingRejected += extra.groundingRejected;
  target.unsupportedNumberRejected += extra.unsupportedNumberRejected;
  target.compoundRejected += extra.compoundRejected;
  target.wideEvidenceWindows += extra.wideEvidenceWindows;
  return target;
}

export function acceptGroundedCreatorNotes(
  notes: RawCreatorNote[],
  segments: CreatorTranscriptSegment[],
  opts: { allowedSegmentIndexes?: number[] } = {},
): { notes: RawCreatorNote[]; rejected: number; diagnostics: CreatorNoteEvidenceDiagnostics } {
  const allowed = opts.allowedSegmentIndexes ? new Set(opts.allowedSegmentIndexes) : null;
  let clearedInvalid = 0;
  const prepared = notes.map((note) => {
    const requested = uniqueSortedIndexes(Array.isArray(note.sourceSegmentIndexes) ? note.sourceSegmentIndexes : []);
    if (!requested.length) {
      return { ...note, sourceSegmentIndexes: [] };
    }
    if (allowed && requested.some((index) => !allowed.has(index))) {
      clearedInvalid += 1;
      return { ...note, sourceSegmentIndexes: [] };
    }
    return { ...note, sourceSegmentIndexes: requested };
  });

  const evidenced = applySourceEvidence(prepared, segments);
  const accepted: RawCreatorNote[] = [];
  let rejected = 0;
  const diagnostics = emptyEvidenceDiagnostics();
  diagnostics.invalidSourceSegmentReferences =
    clearedInvalid + evidenced.diagnostics.invalidSourceSegmentReferences;
  diagnostics.exactQuotesRequested = evidenced.diagnostics.exactQuotesRequested;
  diagnostics.exactQuotesVerified = evidenced.diagnostics.exactQuotesVerified;
  diagnostics.exactQuotesRejected = evidenced.diagnostics.exactQuotesRejected;

  for (const note of evidenced.notes) {
    const bounds = timeRangeFromIndexes(segments, note.sourceSegmentIndexes);
    const duration = evidenceDurationSeconds(bounds);
    const citedText = concatenateTranscriptSegments(segments, note.sourceSegmentIndexes);
    const quote = note.sourceQuote || note.exactQuote;

    if (duration != null && duration >= CREATOR_NOTES_EVIDENCE_DURATION_FLAG_SECONDS) {
      diagnostics.wideEvidenceWindows += 1;
    }

    if (!note.sourceExcerpt || !note.sourceSegmentIndexes.length) {
      rejected += 1;
      diagnostics.notesWithoutSourceEvidence += 1;
      diagnostics.groundingRejected += 1;
      continue;
    }
    if (!quote) {
      rejected += 1;
      diagnostics.quoteVerificationRejected += 1;
      diagnostics.groundingRejected += 1;
      continue;
    }
    if (duration != null && duration > CREATOR_NOTES_EVIDENCE_DURATION_MAX_SECONDS) {
      rejected += 1;
      diagnostics.groundingRejected += 1;
      continue;
    }
    const compound = compoundNoteReason(note.text);
    if (compound) {
      rejected += 1;
      diagnostics.compoundRejected += 1;
      diagnostics.groundingRejected += 1;
      continue;
    }
    const unsupported = unsupportedNumericTokens(note.text, citedText);
    if (unsupported.length) {
      rejected += 1;
      diagnostics.unsupportedNumberRejected += 1;
      diagnostics.groundingRejected += 1;
      continue;
    }

    accepted.push({
      ...note,
      startSeconds: note.startSeconds ?? bounds.startSeconds,
      endSeconds: note.endSeconds ?? bounds.endSeconds,
      sourceQuote: quote,
      exactQuote: quote,
      evidenceDurationSeconds: duration,
    });
    diagnostics.notesWithSourceEvidence += 1;
  }

  return { notes: accepted, rejected, diagnostics };
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

    const citedText = concatenateTranscriptSegments(segments, resolved.indexes);
    const rawQuote = proposedSourceQuote(note);
    let sourceQuote: string | null = null;
    let indexes = resolved.indexes;
    if (rawQuote) {
      diagnostics.exactQuotesRequested += 1;
      sourceQuote = verifyExactQuote(rawQuote, citedText);
      if (sourceQuote) {
        diagnostics.exactQuotesVerified += 1;
        const focused = smallestIndexesContainingQuote(segments, indexes, sourceQuote);
        if (focused?.length) indexes = focused;
      } else {
        diagnostics.exactQuotesRejected += 1;
      }
    }

    const excerpt =
      concatenateTranscriptSegments(segments, indexes) || resolved.excerpt;
    const bounded = excerpt ? buildSourceExcerpt(segments, indexes) : null;
    if (bounded?.excerpt) diagnostics.notesWithSourceEvidence += 1;
    else diagnostics.notesWithoutSourceEvidence += 1;

    return {
      ...note,
      sourceExcerpt: bounded?.excerpt || excerpt || null,
      sourceQuote,
      exactQuote: sourceQuote,
      sourceSegmentIndexes: indexes,
    };
  });
  return { notes: evidenced, diagnostics };
}
