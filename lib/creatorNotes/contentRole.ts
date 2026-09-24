import type {
  CreatorTranscriptSegment,
  TranscriptContentEligibility,
  TranscriptContentRole,
  TranscriptContentRoleDiagnostics,
  TranscriptContentRoleSegmentDiagnostic,
} from '@/lib/creatorNotes/types';

/**
 * Segment roles are deterministic. Atomic Note windows may be built only from
 * segments whose contentRole is exactly `editorial`. sponsor_read, housekeeping,
 * intro_outro, and uncertain are excluded. A missing role is uncertain.
 * Cue-free spoken sentences are an explicit editorial decision (`no_non_editorial_cue`),
 * not a fallback for a missing role. The raw transcript is not rewritten.
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
/** Cue-free gap inside one sponsor read. A longer gap stays editorial. */
const SPONSOR_ISLAND_MAX_CHARS = 360;
const SPONSOR_ISLAND_MAX_SECONDS = 18;

const ROLE_RANK: Record<TranscriptContentRole, number> = {
  sponsor_read: 4,
  housekeeping: 3,
  intro_outro: 2,
  uncertain: 1,
  editorial: 0,
};

type NonEditorialCueRole = Exclude<TranscriptContentRole, 'editorial' | 'uncertain'>;
type Cue = { role: NonEditorialCueRole; id: string; source: string };

const CUES: Cue[] = [
  { role: 'sponsor_read', id: 'squarespace', source: String.raw`\bsquarespace\b` },
  { role: 'sponsor_read', id: 'chumba', source: String.raw`\bchumba(?:\s+casino)?\b` },
  { role: 'sponsor_read', id: 'cassina', source: String.raw`\bcassina\b` },
  { role: 'sponsor_read', id: 'wild_alaskan', source: String.raw`\bwild\s+alaskan\b` },
  { role: 'sponsor_read', id: 'wild_alaskan', source: String.raw`\bwildalaskan\b` },
  { role: 'sponsor_read', id: 'wild_caught', source: String.raw`\bwild[- ]caught\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\bbrought to you by\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\bsponsored by\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\btoday'?s sponsor\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\bour sponsor\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\bthis (?:episode|podcast|video|show) is sponsored\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\ba word from (?:our |the )?sponsor\b` },
  { role: 'sponsor_read', id: 'sponsor_intro', source: String.raw`\bfor sponsoring\b` },
  {
    role: 'sponsor_read',
    id: 'offer_code',
    source: String.raw`\b(?:use\s+(?:promo|offer)\s+code|use\s+code|(?:promo|offer)\s+code)\b`,
  },
  { role: 'sponsor_read', id: 'spoken_url', source: String.raw`\bslash\s+[a-z][a-z0-9]{3,}\b` },
  {
    role: 'sponsor_read',
    id: 'spoken_url',
    source: String.raw`\b(?:go to|visit|head to|check out|sign up at)\s+[a-z0-9][\w.-]*\.(?:com|org|net)\b`,
  },
  { role: 'sponsor_read', id: 'discount', source: String.raw`(?:\$\s*\d+|\b\d+\s*%)\s*off\b` },
  { role: 'sponsor_read', id: 'free_trial', source: String.raw`\bfree trial\b` },
  { role: 'sponsor_read', id: 'free_trial', source: String.raw`\blimited[- ]time (?:offer|deal)\b` },
  { role: 'sponsor_read', id: 'ad_legal', source: String.raw`\bterms and conditions apply\b` },
  { role: 'sponsor_read', id: 'ad_legal', source: String.raw`\bno purchase necessary\b` },
  { role: 'sponsor_read', id: 'ad_legal', source: String.raw`\bmoney[- ]back guarantee\b` },
  { role: 'sponsor_read', id: 'ad_legal', source: String.raw`\brisk[- ]free\b` },
  { role: 'sponsor_read', id: 'squarespace_script', source: String.raw`\bphotography school\b` },
  { role: 'sponsor_read', id: 'squarespace_script', source: String.raw`\bportraits online\b` },
  { role: 'sponsor_read', id: 'squarespace_script', source: String.raw`\bselling your portraits\b` },
  { role: 'sponsor_read', id: 'squarespace_script', source: String.raw`\bcookie empire\b` },
  { role: 'sponsor_read', id: 'squarespace_script', source: String.raw`\bcookies you just made\b` },
  { role: 'sponsor_read', id: 'squarespace_script', source: String.raw`\bmovie reviewing hobby\b` },
  { role: 'sponsor_read', id: 'social_games', source: String.raw`\bonline social games\b` },
  { role: 'sponsor_read', id: 'social_games', source: String.raw`\bdaily boosts\b` },
  { role: 'sponsor_read', id: 'social_games', source: String.raw`\blittle epiphanies\b` },
  { role: 'sponsor_read', id: 'social_games', source: String.raw`\bfun way to switch off\b` },
  { role: 'sponsor_read', id: 'celebrity_read', source: String.raw`\btiffany stratton\b` },
  { role: 'sponsor_read', id: 'celebrity_read', source: String.raw`\btiffy time\b` },
  { role: 'sponsor_read', id: 'celebrity_read', source: String.raw`\bsmackdown\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bvacuum[- ]sealed\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bindividually portioned\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\balaskan waters\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\balaskan fishermen\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bcoho salmon\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bbuying seafood\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bseafood that looks great\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bdelivered right to your door\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bhigh[- ]quality ingredients\b` },
  { role: 'sponsor_read', id: 'seafood_pitch', source: String.raw`\bpremium wild\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\blike and subscribe\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\b(?:hit|smash|tap|click) (?:that |the )?(?:like|subscribe|bell|notification)\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\bplease subscribe\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\bdon'?t forget to subscribe\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\bsubscribe (?:to|for) (?:more|the channel|the show|the podcast|notifications)\b` },
  { role: 'housekeeping', id: 'audience_goal', source: String.raw`\blet'?s get to \d` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\bkeep you posted\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\b(?:hit|ring) the bell\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\bturn on (?:post )?notifications\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`\bjoin (?:the )?(?:membership|patreon)\b` },
  { role: 'housekeeping', id: 'subscribe', source: String.raw`(^|[\s.!?…])subscribe(?=[.!?…]|$)` },
  { role: 'housekeeping', id: 'outro', source: String.raw`\bthat'?s the end of the discussion\b` },
  { role: 'housekeeping', id: 'outro', source: String.raw`\bend of the (?:discussion|episode|show|podcast)\b` },
  { role: 'intro_outro', id: 'welcome', source: String.raw`^\s*(?:hey[\s,]+)?(?:everybody[\s,]+)?welcome back[.!]?\s*$` },
  { role: 'intro_outro', id: 'welcome', source: String.raw`\bwelcome back to the (?:show|podcast|episode|channel)\b` },
  { role: 'intro_outro', id: 'welcome', source: String.raw`\bwelcome to the (?:show|podcast|episode|channel)\b` },
  { role: 'intro_outro', id: 'outro', source: String.raw`\bi(?:'ll| will) see you (?:in the )?next\b` },
  { role: 'intro_outro', id: 'outro', source: String.raw`\bthanks for (?:listening|watching|tuning in)\b` },
];

/** Weaker commercial wording. Applied only beside an already non-editorial span. */
const COMMERCIAL_CONTINUATION =
  /\b(?:seafood|fillets?|salmon|portioned|alaskan|quick[- ]frozen|omega|gmos?|fishermen|subscription|first box|epiphan(?:y|ies)|switch off|tiffy|smackdown|vacuum|coho|ingredients)\b/i;

/**
 * News vocabulary that must stay editorial even when it sits against an ad.
 * Checked only for spans that did not already match a sponsor or housekeeping cue.
 */
const EDITORIAL_GUARD =
  /\b(?:ukrain\w*|russia\w*|zelensky\w*|putin|trump|diesel|estonia|nato|congress|senate|court|refin\w*|missile|gaza|israel|tariff|election|white house|united nations|article\s+[ivx\d]+|iran|hormuz|president|war|ban)\b/i;

const NON_SPEECH = /^\s*(?:\[(?:music|applause|silence|inaudible|laughter|noise)\]|\((?:music|applause|silence|inaudible)\))\s*$/i;

const COMMERCIAL_WORD =
  /^(?:\s+)(?:helps|help|creators?|build(?:ing)?|websites?|business(?:es)?|for|your|their|our|to|and|go|visit|www|free|coins?|casino|use|code|promo|discount|trials?|company|seafood|salmon|premium|offers?|deals?|members?|sign|up|start|get|with|from|today|now|at|episode|podcast|show|sponsoring|sponsor|giving|away|is|new|players?|every|day|week|when|you|link|single|percent|off|shipping)\b/i;

type CueHit = { start: number; end: number; role: NonEditorialCueRole; id: string };
type Range = { start: number; end: number; role: TranscriptContentRole; reason: string };

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

function cuesIn(text: string): CueHit[] {
  const found: CueHit[] = [];
  for (const cue of CUES) {
    const re = new RegExp(cue.source, 'gi');
    for (const match of text.matchAll(re)) {
      if (match.index == null) continue;
      found.push({ start: match.index, end: match.index + match[0].length, role: cue.role, id: cue.id });
    }
  }
  return found;
}

function strongestRole(roles: TranscriptContentRole[]): TranscriptContentRole {
  return roles.reduce((best, role) => (ROLE_RANK[role] > ROLE_RANK[best] ? role : best), 'editorial');
}

function winningCue(cues: CueHit[]): CueHit {
  return cues.reduce((best, cue) => (ROLE_RANK[cue.role] > ROLE_RANK[best.role] ? cue : best));
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

function roleWithoutCue(sentence: string): { role: TranscriptContentRole; reason: string } {
  if (!sentence.trim()) return { role: 'uncertain', reason: 'empty' };
  if (NON_SPEECH.test(sentence.trim())) return { role: 'uncertain', reason: 'non_speech' };
  return { role: 'editorial', reason: 'no_non_editorial_cue' };
}

function partitionSentence(text: string, start: number, end: number): Range[] {
  const sentence = text.slice(start, end);
  const cues = cuesIn(sentence);
  if (!cues.length) {
    const plain = roleWithoutCue(sentence);
    return [{ start, end, role: plain.role, reason: plain.reason }];
  }

  const cue = winningCue(cues);
  const reason = `cue:${cue.id}`;
  let cueStart = start + Math.min(...cues.map((item) => item.start));
  let cueEnd = start + Math.max(...cues.map((item) => item.end));
  cueStart = peelLeadingGlue(text, start, cueStart);
  cueEnd = extendCommercial(text, cueEnd, end);

  const beforeChars = substantiveChars(text.slice(start, cueStart));
  const afterChars = substantiveChars(text.slice(cueEnd, end));
  const pieces: Range[] = [];

  if (beforeChars >= MIN_SPLIT_CHARS) {
    const before = roleWithoutCue(text.slice(start, cueStart));
    pieces.push({ start, end: cueStart, role: before.role, reason: before.reason });
  } else {
    cueStart = start;
  }

  if (afterChars >= MIN_SPLIT_CHARS) {
    const after = roleWithoutCue(text.slice(cueEnd, end));
    pieces.push({ start: cueStart, end: cueEnd, role: cue.role, reason });
    pieces.push({ start: cueEnd, end, role: after.role, reason: after.reason });
  } else {
    pieces.push({ start: cueStart, end, role: cue.role, reason });
  }

  return pieces;
}

function mergeRanges(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === range.role && previous.end >= range.start) {
      previous.end = Math.max(previous.end, range.end);
      if (range.reason.startsWith('cue:') && !previous.reason.startsWith('cue:')) {
        previous.reason = range.reason;
      }
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
  reason: string;
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

function piecesForSegment(segment: CreatorTranscriptSegment): Piece[] {
  const text = String(segment.text || '');
  if (!text.trim()) {
    return [
      {
        role: 'uncertain',
        reason: 'empty',
        text,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      },
    ];
  }
  const ranges = partitionText(text).filter((range) => text.slice(range.start, range.end).trim());
  if (!ranges.length) {
    const plain = roleWithoutCue(text);
    return [
      {
        role: plain.role,
        reason: plain.reason,
        text,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      },
    ];
  }
  const roles = [...new Set(ranges.map((range) => range.role))];
  if (roles.length === 1 || !roles.includes('editorial')) {
    const winning = ranges.reduce((best, range) => (ROLE_RANK[range.role] > ROLE_RANK[best.role] ? range : best));
    return [
      {
        role: winning.role,
        reason: winning.reason,
        text,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
      },
    ];
  }
  return ranges
    .map((range) => {
      const times = interpolateSeconds(segment.startSeconds, segment.endSeconds, text.length, range.start, range.end);
      return {
        role: range.role,
        reason: range.reason,
        text: text.slice(range.start, range.end).trim(),
        startSeconds: times.startSeconds,
        endSeconds: times.endSeconds,
      };
    })
    .filter((piece) => piece.text);
}

function nonEditorialNeighbor(
  prev: TranscriptContentRole | null | undefined,
  next: TranscriptContentRole | null | undefined,
): TranscriptContentRole | null {
  const roles = [prev, next].filter((role): role is TranscriptContentRole => Boolean(role) && role !== 'editorial');
  if (!roles.length) return null;
  return strongestRole(roles);
}

function confidentSponsorRead(segment: CreatorTranscriptSegment | undefined): boolean {
  return segment?.contentRole === 'sponsor_read' && String(segment.contentRoleReason || '').startsWith('cue:');
}

function islandSeconds(segments: CreatorTranscriptSegment[]): number | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const segment of segments) {
    if (segment.startSeconds == null || segment.endSeconds == null) return null;
    if (!Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.endSeconds)) return null;
    start = start == null ? segment.startSeconds : Math.min(start, segment.startSeconds);
    end = end == null ? segment.endSeconds : Math.max(end, segment.endSeconds);
  }
  if (start == null || end == null) return null;
  return end - start;
}

/** A short cue-free gap between two primary sponsor cues, not a separate discussion. */
function isolatedSponsorIsland(segments: CreatorTranscriptSegment[]): boolean {
  const chars = segments.reduce((sum, segment) => sum + substantiveChars(String(segment.text || '')), 0);
  if (chars === 0 || chars > SPONSOR_ISLAND_MAX_CHARS) return false;
  const seconds = islandSeconds(segments);
  if (seconds != null && seconds > SPONSOR_ISLAND_MAX_SECONDS) return false;
  return segments.every((segment) => !EDITORIAL_GUARD.test(String(segment.text || '')));
}

function absorbSponsorIslands(segments: CreatorTranscriptSegment[]): void {
  let index = 0;
  while (index < segments.length) {
    if (segments[index].contentRole !== 'editorial' || !confidentSponsorRead(segments[index - 1])) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < segments.length && segments[end].contentRole === 'editorial') end += 1;
    const run = segments.slice(index, end);
    if (confidentSponsorRead(segments[end]) && isolatedSponsorIsland(run)) {
      for (const segment of run) {
        segment.contentRole = 'sponsor_read';
        segment.contentRoleReason = 'sponsor_block_continuity';
      }
    }
    index = Math.max(end, index + 1);
  }
}

/**
 * A sponsor sentence that never hits a primary cue stays glued to the
 * neighboring editorial window unless we peel commercial or very short
 * leftovers that sit directly against an already excluded span.
 * A short cue-free gap between two primary sponsor cues stays in that block.
 * Editorial guard words stop both peels so the sentence after an ad survives.
 */
function applyAdjacency(segments: CreatorTranscriptSegment[]): void {
  absorbSponsorIslands(segments);
  const limit = Math.max(1, segments.length);
  for (let pass = 0; pass < limit; pass += 1) {
    let changed = false;
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      if (segment.contentRole !== 'editorial') continue;
      const text = String(segment.text || '');
      const prev = i > 0 ? segments[i - 1] : undefined;
      const next = i + 1 < segments.length ? segments[i + 1] : undefined;
      const neighbor = nonEditorialNeighbor(prev?.contentRole, next?.contentRole);
      if (!neighbor || neighbor === 'editorial') continue;
      if (EDITORIAL_GUARD.test(text)) {
        segment.contentRoleReason = 'editorial_guard';
        continue;
      }
      const commercial = COMMERCIAL_CONTINUATION.test(text);
      const short = substantiveChars(text) < MIN_SPLIT_CHARS;
      if (!commercial && !short) continue;
      segment.contentRole = commercial ? 'sponsor_read' : neighbor;
      segment.contentRoleReason = commercial ? 'adjacent_commercial' : 'adjacent_short_span';
      changed = true;
    }
    if (!changed) break;
  }
}

function countRole(
  diagnostics: Pick<
    TranscriptContentRoleDiagnostics,
    | 'editorialSegments'
    | 'sponsorReadSegments'
    | 'housekeepingSegments'
    | 'introOutroSegments'
    | 'uncertainSegments'
  >,
  role: TranscriptContentRole | null | undefined,
): void {
  if (role === 'sponsor_read') diagnostics.sponsorReadSegments += 1;
  else if (role === 'housekeeping') diagnostics.housekeepingSegments += 1;
  else if (role === 'intro_outro') diagnostics.introOutroSegments += 1;
  else if (role === 'editorial') diagnostics.editorialSegments += 1;
  else diagnostics.uncertainSegments += 1;
}

export function contentRoleSegmentDiagnostics(
  segments: CreatorTranscriptSegment[],
): TranscriptContentRoleSegmentDiagnostic[] {
  return segments.map((segment) => ({
    index: segment.index,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    contentRole: segment.contentRole === 'editorial' ? 'editorial' : segment.contentRole || 'uncertain',
    reason: segment.contentRoleReason || 'unspecified',
  }));
}

export function classifyPlainText(text: string): TranscriptContentRole {
  const value = String(text || '');
  if (!value.trim()) return 'uncertain';
  const { segments } = classifyTranscriptContent([
    { index: 0, startSeconds: null, endSeconds: null, text: value },
  ]);
  if (!segments.length) return 'uncertain';
  return strongestRole(segments.map((segment) => segment.contentRole || 'uncertain'));
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
    | 'segmentsExcludedFromAtomicNotes'
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
        contentRoleReason: piece.reason,
      });
    }
  });

  applyAdjacency(classified);

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
    segmentsExcludedFromAtomicNotes: 0,
  };
  for (const segment of classified) countRole(diagnostics, segment.contentRole);
  diagnostics.segmentsExcludedFromAtomicNotes =
    diagnostics.sponsorReadSegments +
    diagnostics.housekeepingSegments +
    diagnostics.introOutroSegments +
    diagnostics.uncertainSegments;
  return { segments: classified, diagnostics };
}

export function isEditorialExtractionRole(role: TranscriptContentRole | null | undefined): role is 'editorial' {
  return role === 'editorial';
}

export function resolveNoteContentRole(note: {
  contentRole?: TranscriptContentRole | null;
  text?: string | null;
  sourceQuote?: string | null;
  exactQuote?: string | null;
  sourceExcerpt?: string | null;
}): TranscriptContentRole {
  const spoken = [note.text, note.sourceQuote, note.exactQuote, note.sourceExcerpt].filter(Boolean).join('\n');
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
  sourceExcerpt?: string | null;
}): TranscriptContentEligibility {
  return resolveNoteContentRole(note) === 'editorial' ? EDITORIAL_ELIGIBLE : BLOCKED;
}

export function persistableCreatorNotes<T extends { contentRole?: TranscriptContentRole | null }>(notes: T[]): T[] {
  return notes.filter((note) => note.contentRole === 'editorial');
}

export function emptyContentRoleDiagnostics(): TranscriptContentRoleDiagnostics {
  return {
    editorialSegments: 0,
    sponsorReadSegments: 0,
    housekeepingSegments: 0,
    introOutroSegments: 0,
    uncertainSegments: 0,
    segmentsSplit: 0,
    segmentsExcludedFromAtomicNotes: 0,
    editorialWindows: 0,
    nonEditorialWindowsSkipped: 0,
    nonEditorialNotesDropped: 0,
  };
}
