import type {
  CreatorTranscriptSegment,
  TranscriptContentEligibility,
  TranscriptContentRole,
  TranscriptContentRoleDiagnostics,
} from '@/lib/creatorNotes/types';

/**
 * Segment roles are deterministic. Atomic Note extraction, reasoning, theme
 * memory, event threads, and editorial boost read this classification.
 * The raw transcript is not rewritten.
 */
const EDITORIAL_ELIGIBLE: TranscriptContentEligibility = {
  eligibleForThemeMemory: true,
  eligibleForEventThreads: true,
  eligibleForReasoningGraph: true,
  eligibleForEditorialBoost: true,
};

const BLOCKED: TranscriptContentEligibility = {
  eligibleForThemeMemory: false,
  eligibleForEventThreads: false,
  eligibleForReasoningGraph: false,
  eligibleForEditorialBoost: false,
};

const MIN_SPLIT_CHARS = 48;

const ROLE_RANK: Record<TranscriptContentRole, number> = {
  sponsor_read: 4,
  housekeeping: 3,
  intro_outro: 2,
  uncertain: 1,
  editorial: 0,
};

type Cue = { role: Exclude<TranscriptContentRole, 'editorial' | 'uncertain'>; source: string };

const CUES: Cue[] = [
  { role: 'sponsor_read', source: String.raw`\bsquarespace\b` },
  { role: 'sponsor_read', source: String.raw`\bchumba(?:\s+casino)?\b` },
  { role: 'sponsor_read', source: String.raw`\bwild\s+alaskan\b` },
  { role: 'sponsor_read', source: String.raw`\bwildalaskan\b` },
  { role: 'sponsor_read', source: String.raw`\bbrought to you by\b` },
  { role: 'sponsor_read', source: String.raw`\bsponsored by\b` },
  { role: 'sponsor_read', source: String.raw`\btoday'?s sponsor\b` },
  { role: 'sponsor_read', source: String.raw`\bour sponsor\b` },
  { role: 'sponsor_read', source: String.raw`\bthis (?:episode|podcast|video|show) is sponsored\b` },
  { role: 'sponsor_read', source: String.raw`\ba word from (?:our |the )?sponsor\b` },
  { role: 'sponsor_read', source: String.raw`\bfor sponsoring\b` },
  { role: 'sponsor_read', source: String.raw`\buse (?:promo )?code\b` },
  { role: 'sponsor_read', source: String.raw`\bpromo code\b` },
  { role: 'sponsor_read', source: String.raw`\b(?:go to|visit|head to|check out|sign up at)\s+[a-z0-9][\w.-]*\.(?:com|org|net)\b` },
  { role: 'sponsor_read', source: String.raw`\bfree trial\b` },
  { role: 'sponsor_read', source: String.raw`\blimited[- ]time (?:offer|deal)\b` },
  { role: 'housekeeping', source: String.raw`\blike and subscribe\b` },
  { role: 'housekeeping', source: String.raw`\b(?:hit|smash|tap|click) (?:that |the )?(?:like|subscribe|bell|notification)\b` },
  { role: 'housekeeping', source: String.raw`\bplease subscribe\b` },
  { role: 'housekeeping', source: String.raw`\bdon'?t forget to subscribe\b` },
  { role: 'housekeeping', source: String.raw`\bsubscribe (?:to|for) (?:more|the channel|the show|the podcast|notifications)\b` },
  { role: 'housekeeping', source: String.raw`\blet'?s get to \d` },
  { role: 'housekeeping', source: String.raw`\bkeep you posted\b` },
  { role: 'housekeeping', source: String.raw`\b(?:hit|ring) the bell\b` },
  { role: 'housekeeping', source: String.raw`\bturn on (?:post )?notifications\b` },
  { role: 'housekeeping', source: String.raw`\bjoin (?:the )?(?:membership|patreon)\b` },
  { role: 'housekeeping', source: String.raw`(^|[\s.!?…])subscribe(?=[.!?…]|$)` },
  { role: 'intro_outro', source: String.raw`^\s*(?:hey[\s,]+)?(?:everybody[\s,]+)?welcome back[.!]?\s*$` },
  { role: 'intro_outro', source: String.raw`\bwelcome back to the (?:show|podcast|episode|channel)\b` },
  { role: 'intro_outro', source: String.raw`\bwelcome to the (?:show|podcast|episode|channel)\b` },
  { role: 'intro_outro', source: String.raw`\bi(?:'ll| will) see you (?:in the )?next\b` },
  { role: 'intro_outro', source: String.raw`\bthanks for (?:listening|watching|tuning in)\b` },
];

const COMMERCIAL_WORD =
  /^(?:\s+)(?:helps|help|creators?|build(?:ing)?|websites?|business(?:es)?|for|your|their|our|to|and|go|visit|www|free|coins?|casino|use|code|promo|discount|trials?|company|seafood|salmon|premium|offers?|deals?|members?|sign|up|start|get|with|from|today|now|at|episode|podcast|show|sponsoring|sponsor|giving|away|is|new|players?|every|day|week|when|you|link|single|percent|off|shipping)\b/i;

type Range = { start: number; end: number; role: TranscriptContentRole };

function substantiveChars(text: string): number {
  return text.replace(/[^a-z0-9]+/gi, '').length;
}

function roundSeconds(value: number): number {
  return Math.round(value * 100) / 100;
}

function sentenceRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  // A dot inside a hostname (wildalaskan.com) is not a sentence boundary.
  const boundary = /(?:\.{3}|…|[!?]|\.(?=\s|$))+/g;
  let last = 0;
  for (const match of text.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end > last) ranges.push({ start: last, end });
    last = end;
  }
  if (last < text.length) ranges.push({ start: last, end: text.length });
  return ranges.filter((range) => text.slice(range.start, range.end).trim());
}

function cuesIn(text: string): Array<{ start: number; end: number; role: Cue['role'] }> {
  const found: Array<{ start: number; end: number; role: Cue['role'] }> = [];
  for (const cue of CUES) {
    const re = new RegExp(cue.source, 'gi');
    for (const match of text.matchAll(re)) {
      if (match.index == null) continue;
      found.push({ start: match.index, end: match.index + match[0].length, role: cue.role });
    }
  }
  return found;
}

function strongestRole(roles: TranscriptContentRole[]): TranscriptContentRole {
  return roles.reduce((best, role) => (ROLE_RANK[role] > ROLE_RANK[best] ? role : best), 'editorial');
}

function extendCommercial(text: string, from: number, limit: number): number {
  let pos = from;
  while (pos < limit) {
    const match = text.slice(pos, limit).match(COMMERCIAL_WORD);
    if (!match) break;
    pos += match[0].length;
  }
  return pos;
}

function peelLeadingGlue(text: string, start: number, cueStart: number): number {
  const before = text.slice(start, cueStart);
  const glue = before.match(/((?:thanks(?:\s+to)?|and)\s*)$/i);
  if (!glue || glue.index == null) return cueStart;
  const kept = before.slice(0, glue.index);
  if (substantiveChars(kept) >= MIN_SPLIT_CHARS || substantiveChars(kept) === 0) {
    return start + glue.index;
  }
  return cueStart;
}

function partitionSentence(text: string, start: number, end: number): Range[] {
  const sentence = text.slice(start, end);
  const cues = cuesIn(sentence);
  if (!cues.length) return [{ start, end, role: 'editorial' }];

  const role = strongestRole(cues.map((cue) => cue.role));
  let cueStart = start + Math.min(...cues.map((cue) => cue.start));
  let cueEnd = start + Math.max(...cues.map((cue) => cue.end));
  cueStart = peelLeadingGlue(text, start, cueStart);
  cueEnd = extendCommercial(text, cueEnd, end);

  const beforeChars = substantiveChars(text.slice(start, cueStart));
  const afterChars = substantiveChars(text.slice(cueEnd, end));
  const pieces: Range[] = [];

  if (beforeChars >= MIN_SPLIT_CHARS) {
    pieces.push({ start, end: cueStart, role: 'editorial' });
  } else {
    cueStart = start;
  }

  if (afterChars >= MIN_SPLIT_CHARS) {
    pieces.push({ start: cueStart, end: cueEnd, role });
    pieces.push({ start: cueEnd, end, role: 'editorial' });
  } else {
    pieces.push({ start: cueStart, end, role });
  }

  return pieces;
}

function mergeRanges(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === range.role && previous.end >= range.start) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

function partitionText(text: string): Range[] {
  const sentences = sentenceRanges(text);
  if (!sentences.length) return [];
  return mergeRanges(sentences.flatMap((sentence) => partitionSentence(text, sentence.start, sentence.end)));
}

function interpolateSeconds(
  startSeconds: number | null,
  endSeconds: number | null,
  textLength: number,
  from: number,
  to: number,
): { startSeconds: number | null; endSeconds: number | null } {
  if (
    startSeconds == null ||
    endSeconds == null ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    textLength <= 0
  ) {
    return { startSeconds, endSeconds };
  }
  const span = Math.max(0, endSeconds - startSeconds);
  const start = roundSeconds(startSeconds + span * (from / textLength));
  const end = roundSeconds(startSeconds + span * (to / textLength));
  return { startSeconds: start, endSeconds: Math.max(start, end) };
}

type Piece = {
  role: TranscriptContentRole;
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

function piecesForSegment(segment: CreatorTranscriptSegment): Piece[] {
  const text = String(segment.text || '');
  const ranges = partitionText(text).filter((range) => text.slice(range.start, range.end).trim());
  if (!ranges.length) {
    return [
      {
        role: 'editorial',
        text,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      },
    ];
  }
  const roles = [...new Set(ranges.map((range) => range.role))];
  if (roles.length === 1 || !roles.includes('editorial')) {
    return [
      {
        role: strongestRole(roles),
        text,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      },
    ];
  }
  return ranges.map((range) => {
    const times = interpolateSeconds(segment.startSeconds, segment.endSeconds, text.length, range.start, range.end);
    return {
      role: range.role,
      text: text.slice(range.start, range.end).trim(),
      startSeconds: times.startSeconds,
      endSeconds: times.endSeconds,
    };
  }).filter((piece) => piece.text);
}

export function classifyPlainText(text: string): TranscriptContentRole {
  const ranges = partitionText(String(text || ''));
  if (!ranges.length) return 'editorial';
  return strongestRole(ranges.map((range) => range.role));
}

export function classifyTranscriptContent(segments: CreatorTranscriptSegment[]): {
  segments: CreatorTranscriptSegment[];
  diagnostics: Pick<
    TranscriptContentRoleDiagnostics,
    | 'editorialSegments'
    | 'sponsorReadSegments'
    | 'housekeepingSegments'
    | 'introOutroSegments'
    | 'uncertainSegments'
    | 'segmentsSplit'
  >;
} {
  const classified: CreatorTranscriptSegment[] = [];
  let segmentsSplit = 0;

  segments.forEach((segment, position) => {
    const origin = Number.isInteger(segment.index) && segment.index >= 0 ? segment.index : position;
    const pieces = piecesForSegment(segment);
    if (pieces.length > 1) segmentsSplit += 1;
    for (const piece of pieces) {
      classified.push({
        index: origin,
        originSegmentIndex: origin,
        startSeconds: piece.startSeconds,
        endSeconds: piece.endSeconds,
        text: piece.text,
        contentRole: piece.role,
      });
    }
  });

  if (classified.length !== segments.length) {
    classified.forEach((segment, index) => {
      segment.index = index;
    });
  } else {
    classified.forEach((segment, index) => {
      const original = segments[index];
      segment.index = Number.isInteger(original?.index) && original.index >= 0 ? original.index : index;
    });
  }

  const diagnostics = {
    editorialSegments: 0,
    sponsorReadSegments: 0,
    housekeepingSegments: 0,
    introOutroSegments: 0,
    uncertainSegments: 0,
    segmentsSplit,
  };
  for (const segment of classified) {
    if (segment.contentRole === 'sponsor_read') diagnostics.sponsorReadSegments += 1;
    else if (segment.contentRole === 'housekeeping') diagnostics.housekeepingSegments += 1;
    else if (segment.contentRole === 'intro_outro') diagnostics.introOutroSegments += 1;
    else if (segment.contentRole === 'uncertain') diagnostics.uncertainSegments += 1;
    else diagnostics.editorialSegments += 1;
  }
  return { segments: classified, diagnostics };
}

export function resolveNoteContentRole(note: {
  contentRole?: TranscriptContentRole | null;
  text?: string | null;
  sourceQuote?: string | null;
  exactQuote?: string | null;
}): TranscriptContentRole {
  const spoken = [note.text, note.sourceQuote, note.exactQuote].filter(Boolean).join('\n');
  const inferred = classifyPlainText(spoken);
  if (inferred !== 'editorial') return inferred;
  if (note.contentRole && note.contentRole !== 'editorial') return note.contentRole;
  return 'editorial';
}

export function noteContentEligibility(note: {
  contentRole?: TranscriptContentRole | null;
  text?: string | null;
  sourceQuote?: string | null;
  exactQuote?: string | null;
}): TranscriptContentEligibility {
  return resolveNoteContentRole(note) === 'editorial' ? EDITORIAL_ELIGIBLE : BLOCKED;
}

export function emptyContentRoleDiagnostics(): TranscriptContentRoleDiagnostics {
  return {
    editorialSegments: 0,
    sponsorReadSegments: 0,
    housekeepingSegments: 0,
    introOutroSegments: 0,
    uncertainSegments: 0,
    segmentsSplit: 0,
    editorialWindows: 0,
    nonEditorialWindowsSkipped: 0,
    nonEditorialNotesDropped: 0,
  };
}
