import { CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS } from '@/lib/creatorNotes/constants';
import type {
  CreatorNoteQuoteDiagnostics,
  CreatorTranscriptSegment,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';

export function emptyQuoteDiagnostics(): CreatorNoteQuoteDiagnostics {
  return { requested: 0, verified: 0, rejected: 0 };
}

const WRAP_PAIRS: Array<[string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['\u201C', '\u201D'],
  ['\u2018', '\u2019'],
];

function unwrapOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const start = trimmed[0];
  const end = trimmed[trimmed.length - 1];
  if (WRAP_PAIRS.some(([open, close]) => start === open && end === close)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function foldQuoteChar(ch: string): string {
  if (ch === '\u2018' || ch === '\u2019' || ch === '\u201A' || ch === '\u2032') return "'";
  if (
    ch === '\u201C' ||
    ch === '\u201D' ||
    ch === '\u201E' ||
    ch === '\u2033' ||
    ch === '\u00AB' ||
    ch === '\u00BB'
  ) {
    return '"';
  }
  return ch;
}

/**
 * Collapse whitespace/line breaks and fold smart quotes for matching only.
 * The returned map[i] is the original index of normalized[i].
 */
export function normalizeForQuoteMatch(text: string): { normalized: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    let ch = foldQuoteChar(text[i]);
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = ' ';
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
    }
    chars.push(ch);
    map.push(i);
  }
  if (chars.length && chars[chars.length - 1] === ' ') {
    chars.pop();
    map.pop();
  }
  return { normalized: chars.join(''), map };
}

export function concatenateTranscriptSegments(
  segments: CreatorTranscriptSegment[],
  indexes: number[],
): string {
  const ordered = [...new Set(indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < segments.length)
    .sort((a, b) => a - b);
  return ordered
    .map((index) => String(segments[index]?.text || '').trim())
    .filter(Boolean)
    .join(' ');
}

export function extractVerifiedQuote(exactQuote: string, sourceText: string): string | null {
  if (!exactQuote || !sourceText) return null;
  const candidates = [unwrapOuterQuotes(exactQuote), exactQuote.trim()];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const quoteNorm = normalizeForQuoteMatch(candidate);
    if (!quoteNorm.normalized) continue;
    const sourceNorm = normalizeForQuoteMatch(sourceText);
    const idx = sourceNorm.normalized.indexOf(quoteNorm.normalized);
    if (idx < 0) continue;
    const start = sourceNorm.map[idx];
    const endChar = sourceNorm.map[idx + quoteNorm.normalized.length - 1];
    if (start == null || endChar == null) continue;
    const verbatim = sourceText.slice(start, endChar + 1);
    if (!verbatim.trim()) continue;
    return verbatim;
  }
  return null;
}

function quoteCandidateLength(value: string): number {
  return normalizeForQuoteMatch(unwrapOuterQuotes(value) || value.trim()).normalized.length;
}

export function applyQuoteVerification(
  notes: RawCreatorNote[],
  segments: CreatorTranscriptSegment[],
): { notes: RawCreatorNote[]; diagnostics: CreatorNoteQuoteDiagnostics } {
  const diagnostics = emptyQuoteDiagnostics();
  const verified = notes.map((note) => {
    const indexes = Array.isArray(note.sourceSegmentIndexes) ? note.sourceSegmentIndexes : [];
    const rawQuote = typeof note.sourceQuote === 'string' ? note.sourceQuote : note.exactQuote;
    const candidate = rawQuote ? unwrapOuterQuotes(rawQuote) || rawQuote.trim() : '';
    if (!candidate) {
      return { ...note, sourceQuote: null, exactQuote: null, sourceSegmentIndexes: indexes };
    }

    diagnostics.requested += 1;
    if (quoteCandidateLength(candidate) > CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS) {
      diagnostics.rejected += 1;
      return { ...note, sourceQuote: null, exactQuote: null, sourceSegmentIndexes: indexes };
    }

    const sourceText = concatenateTranscriptSegments(segments, indexes);
    const verbatim = extractVerifiedQuote(candidate, sourceText);
    if (!verbatim || quoteCandidateLength(verbatim) > CREATOR_NOTES_EXACT_QUOTE_MAX_CHARS) {
      diagnostics.rejected += 1;
      return { ...note, sourceQuote: null, exactQuote: null, sourceSegmentIndexes: indexes };
    }

    diagnostics.verified += 1;
    return { ...note, sourceQuote: verbatim, exactQuote: verbatim, sourceSegmentIndexes: indexes };
  });
  return { notes: verified, diagnostics };
}
