import { isGenericSpeakerAttribution } from '@/lib/creatorNotes/identity';
import type { CreatorNoteKind } from '@/lib/creatorNotes/constants';

export const SEMANTIC_FAILURE_REASONS = [
  'actor_mismatch',
  'relation_reversed',
  'attribution_mismatch',
  'modality_strengthened',
  'quantity_mismatch',
  'unsupported_inference',
  'other',
] as const;

export type SemanticFailureReason = (typeof SEMANTIC_FAILURE_REASONS)[number];

export type StatementRole = 'creator' | 'quoted_speaker' | 'reported' | 'unknown';

export type SemanticFidelityDecision = {
  decision: 'accept' | 'reject' | 'review';
  failureReason: SemanticFailureReason | null;
};

const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for', 'is', 'was', 'were', 'are', 'be', 'been',
  'this', 'that', 'with', 'from', 'at', 'by', 'or', 'as', 'it', 'its', 'they', 'them', 'their',
  'who', 'whom', 'which', 'into', 'during', 'against', 'about', 'after', 'before', 'than', 'then',
  'have', 'has', 'had', 'not', 'but', 'his', 'her', 'she', 'he', 'we', 'our', 'you', 'your',
]);

const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
};

const WEAK_MODAL = /\b(could|might|may|would|potentially)\s+([a-z][a-z'-]{2,})/gi;

export function isSemanticFailureReason(value: string | null | undefined): value is SemanticFailureReason {
  return SEMANTIC_FAILURE_REASONS.includes(value as SemanticFailureReason);
}

export function foldSemanticText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTokens(text: string): string[] {
  return foldSemanticText(text)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOP.has(token) && !NUMBER_WORDS[token]);
}

function headToken(phrase: string): string {
  const tokens = foldSemanticText(phrase)
    .split(' ')
    .filter((token) => token && !STOP.has(token) && token !== 'uss' && token !== 'us');
  return tokens[tokens.length - 1] || '';
}

function agentHead(subject: string): string {
  const folded = foldSemanticText(subject);
  const split = folded.split(/\b(?:assigned to|aboard|on board|stationed on|serving on)\b/);
  return headToken(split[0] || folded);
}

function phraseTokens(phrase: string): Set<string> {
  return new Set(contentTokens(phrase));
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let n = 0;
  for (const token of left) if (right.has(token)) n += 1;
  return n;
}

function quantities(text: string): Set<string> {
  const found = new Set<string>();
  const folded = foldSemanticText(text);
  for (const match of folded.match(/\b\d+\b/g) || []) found.add(match);
  for (const token of folded.split(' ')) {
    const value = NUMBER_WORDS[token];
    if (value) found.add(value);
  }
  return found;
}

function winFrames(text: string): Array<{ winner: string; loser: string }> {
  const folded = foldSemanticText(text);
  const frames: Array<{ winner: string; loser: string }> = [];
  const re =
    /\b(.{2,80}?)\s+won\b(?:\s+(?:a|an|the)\s+[a-z]+){0,4}\s+against\s+(.{2,80}?)(?=\s+(?:and|but|while|during|after|before|because)\b|$)/g;
  for (const match of folded.matchAll(re)) {
    frames.push({ winner: match[1].trim(), loser: match[2].trim() });
  }
  return frames;
}

function framesReversed(
  evidence: Array<{ winner: string; loser: string }>,
  note: Array<{ winner: string; loser: string }>,
): boolean {
  for (const left of evidence) {
    const win = phraseTokens(left.winner);
    const lose = phraseTokens(left.loser);
    for (const right of note) {
      const noteWin = phraseTokens(right.winner);
      const noteLose = phraseTokens(right.loser);
      const winnerSwapped = overlapCount(noteWin, lose) > 0 && overlapCount(noteWin, win) === 0;
      const loserSwapped = overlapCount(noteLose, win) > 0 || (win.size === 0 && /\bthey\b|\bthem\b/.test(left.winner));
      if (winnerSwapped && (loserSwapped || noteLose.size > 0)) return true;
      if (winnerSwapped && overlapCount(noteWin, lose) > 0) return true;
    }
  }
  return false;
}

function attemptFrame(text: string): { subject: string; complement: string } | null {
  const folded = foldSemanticText(text);
  const match = folded.match(/\b(.{2,140}?)\battempted\s+(.{2,80}?)(?=\s+during\b|\s+while\b|$)/);
  if (!match) return null;
  return { subject: match[1].trim(), complement: match[2].trim() };
}

function saidFrame(text: string): { speaker: string } | null {
  const folded = foldSemanticText(text);
  const match = folded.match(/\b(.{2,80}?)\s+(?:said|says|asked)\b/);
  if (!match) return null;
  return { speaker: match[1].trim() };
}

function obtainedBy(text: string): string | null {
  const match = String(text || '').match(/\bobtained by\s+([A-Za-z][\w.&'-]*(?:\s+[A-Za-z][\w.&'-]*){0,3})/i);
  return match ? foldSemanticText(match[1]) : null;
}

function obtainedAgent(text: string): string | null {
  const match = foldSemanticText(text).match(/\b(.{2,80}?)\s+obtained\b/);
  if (!match) return null;
  return headToken(match[1]);
}

function negationMismatch(evidence: string, note: string): boolean {
  const negatedNear = (text: string): Set<string> => {
    const tokens = foldSemanticText(text).split(' ');
    const found = new Set<string>();
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i] !== 'not' && tokens[i] !== 'never' && tokens[i] !== 'no') continue;
      const next = tokens.slice(i + 1, i + 4).find((token) => token.length >= 4 && !STOP.has(token));
      if (next) found.add(next);
    }
    return found;
  };
  const evidenceNegated = negatedNear(evidence);
  const noteNegated = negatedNear(note);
  const noteTokens = new Set(foldSemanticText(note).split(' '));
  for (const token of evidenceNegated) {
    if (noteTokens.has(token) && !noteNegated.has(token)) return true;
  }
  for (const token of noteNegated) {
    if (foldSemanticText(evidence).split(' ').includes(token) && !evidenceNegated.has(token)) return true;
  }
  return false;
}

function modalityStrengthened(evidence: string, note: string): boolean {
  const evidenceFold = foldSemanticText(evidence);
  const noteFold = foldSemanticText(note);
  const noteHasHedge = /\b(could|might|may|would|potentially|appears|appear|believes|believe|suggests|suggest|asks|ask|whether|if|claims|claimed|said|says|according)\b/.test(
    noteFold,
  );

  for (const match of evidenceFold.matchAll(WEAK_MODAL)) {
    const verb = match[2];
    if (!verb) continue;
    const noteUsesVerb = new RegExp(`\\b${verb}\\b`).test(noteFold);
    if (!noteUsesVerb) continue;
    const noteKeepsWeak = new RegExp(`\\b(could|might|may|would|potentially)\\s+${verb}\\b`).test(noteFold);
    if (noteKeepsWeak) continue;
    if (new RegExp(`\\b(will|shall|did|does|is|are|was|were)\\b(?:\\s+\\w+){0,3}\\s+${verb}\\b`).test(noteFold)) {
      return true;
    }
    if (new RegExp(`\\b${verb}s\\b|\\b${verb}d\\b|\\b${verb}ed\\b`).test(noteFold) && !noteHasHedge) return true;
    if (new RegExp(`\\bwill\\s+${verb}\\b`).test(noteFold)) return true;
  }

  if (/\basks?\s+whether\b/.test(evidenceFold) && !/\b(asks?|whether|question)\b/.test(noteFold)) {
    const complement = evidenceFold.split(/\basks?\s+whether\b/).slice(1).join(' ');
    if (overlapCount(phraseTokens(complement), phraseTokens(noteFold)) >= 1) return true;
  }
  if (/\bbelieves?\b/.test(evidenceFold) && !/\bbelieves?\b/.test(noteFold) && !noteHasHedge) {
    const complement = evidenceFold.split(/\bbelieves?\b/).slice(1).join(' ');
    if (overlapCount(phraseTokens(complement), phraseTokens(noteFold)) >= 1) return true;
  }
  if (/\b(suggests?|appears?)\b/.test(evidenceFold) && !noteHasHedge) {
    const complement = evidenceFold.split(/\b(?:suggests?|appears?)\b/).slice(1).join(' ');
    if (overlapCount(phraseTokens(complement), phraseTokens(noteFold)) >= 2) return true;
  }
  if (/\bif\b/.test(evidenceFold) && !/\bif\b/.test(noteFold) && /\b(will|shall)\b/.test(noteFold)) {
    const clause = evidenceFold.split(/\bif\b/).slice(1).join(' ');
    if (overlapCount(phraseTokens(clause), phraseTokens(noteFold)) >= 2) return true;
  }
  return false;
}

function attributionMismatch(
  evidence: string,
  note: string,
  quotedSpeaker?: string | null,
): boolean {
  const source = obtainedBy(evidence);
  const agent = obtainedAgent(note);
  if (source && agent && agent !== headToken(source) && !source.split(' ').includes(agent)) return true;

  const evidenceSaid = saidFrame(evidence);
  const noteSaid = saidFrame(note);
  if (evidenceSaid && noteSaid) {
    const left = headToken(evidenceSaid.speaker);
    const right = headToken(noteSaid.speaker);
    if (left && right && left !== right) return true;
  }

  const speaker = foldSemanticText(quotedSpeaker || '');
  if (speaker && evidenceSaid && foldSemanticText(evidence).includes(speaker)) {
    const noteFold = foldSemanticText(note);
    const preservesSpeaker = noteFold.includes(headToken(speaker)) || /\b(said|says|asked|quoted|according|clip)\b/.test(noteFold);
    if (!preservesSpeaker && overlapCount(phraseTokens(evidence), phraseTokens(note)) >= 2) return true;
  }
  return false;
}

function unsupportedTokens(evidence: string, note: string): string[] {
  const known = new Set(foldSemanticText(evidence).split(' ').filter(Boolean));
  return contentTokens(note).filter((token) => !known.has(token));
}

export function assessSemanticFidelity(
  evidenceText: string,
  noteText: string,
  opts: { quotedSpeaker?: string | null } = {},
): SemanticFidelityDecision {
  const evidence = String(evidenceText || '').trim();
  const note = String(noteText || '').trim();
  if (!evidence || !note) return { decision: 'review', failureReason: null };

  const evidenceWins = winFrames(evidence);
  const noteWins = winFrames(note);
  if (evidenceWins.length && noteWins.length && framesReversed(evidenceWins, noteWins)) {
    return { decision: 'reject', failureReason: 'relation_reversed' };
  }
  if (negationMismatch(evidence, note)) {
    return { decision: 'reject', failureReason: 'relation_reversed' };
  }

  const evidenceAttempt = attemptFrame(evidence);
  const noteAttempt = attemptFrame(note);
  if (evidenceAttempt && noteAttempt) {
    const evidenceHead = agentHead(evidenceAttempt.subject);
    const noteHead = agentHead(noteAttempt.subject);
    const complementChanged = headToken(evidenceAttempt.complement) !== headToken(noteAttempt.complement);
    if (evidenceHead && noteHead && evidenceHead !== noteHead) {
      return { decision: 'reject', failureReason: 'actor_mismatch' };
    }
    if (complementChanged && evidenceHead === noteHead) {
      return { decision: 'reject', failureReason: 'actor_mismatch' };
    }
  }

  if (attributionMismatch(evidence, note, opts.quotedSpeaker)) {
    return { decision: 'reject', failureReason: 'attribution_mismatch' };
  }
  if (modalityStrengthened(evidence, note)) {
    return { decision: 'reject', failureReason: 'modality_strengthened' };
  }

  const evidenceQty = quantities(evidence);
  const noteQty = quantities(note);
  for (const qty of noteQty) {
    if (!evidenceQty.has(qty)) return { decision: 'reject', failureReason: 'quantity_mismatch' };
  }

  const novel = unsupportedTokens(evidence, note);
  const noteTokens = contentTokens(note);
  if (!noteTokens.length) return { decision: 'review', failureReason: null };
  const grounded = noteTokens.filter((token) => foldSemanticText(evidence).split(' ').includes(token));
  const groundedRatio = grounded.length / noteTokens.length;
  if (novel.length >= 2 && groundedRatio < 0.5) {
    return { decision: 'review', failureReason: null };
  }
  if (groundedRatio >= 0.6 && novel.length === 0) {
    return { decision: 'accept', failureReason: null };
  }
  return { decision: 'review', failureReason: null };
}

export function resolveStatementRole(input: {
  kind?: CreatorNoteKind | null;
  attribution?: string | null;
  quotedSpeaker?: string | null;
  referencedSource?: string | null;
  text?: string | null;
}): StatementRole {
  if (input.quotedSpeaker) return 'quoted_speaker';
  if (input.referencedSource) return 'reported';
  const text = foldSemanticText(input.text || '');
  if (/\b(according to|reported that|obtained by|quoted)\b/.test(text)) return 'reported';
  if (input.kind === 'creator_analysis' || input.kind === 'why_it_matters') return 'creator';
  if (!input.attribution || isGenericSpeakerAttribution(input.attribution)) return 'unknown';
  return 'creator';
}

export type SemanticEntailmentItem = {
  id: string;
  entailed: boolean;
  failureReason: SemanticFailureReason | null;
  confidence: 'high' | 'low';
  correctedNote: string | null;
};

const CONFIDENCE = new Set(['high', 'low']);

export function parseSemanticEntailmentContent(content: string): SemanticEntailmentItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(content || ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { results?: unknown }).results)) return null;
  const items: SemanticEntailmentItem[] = [];
  for (const row of (parsed as { results: unknown[] }).results) {
    if (!row || typeof row !== 'object') return null;
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? '').trim();
    if (!id || typeof record.entailed !== 'boolean') return null;
    const confidence = String(record.confidence || '').trim();
    if (!CONFIDENCE.has(confidence)) return null;
    const reasonRaw = record.failureReason == null || record.failureReason === '' ? null : String(record.failureReason);
    if (reasonRaw && !isSemanticFailureReason(reasonRaw)) return null;
    const failureReason: SemanticFailureReason | null = reasonRaw && isSemanticFailureReason(reasonRaw) ? reasonRaw : null;
    const corrected = typeof record.correctedNote === 'string' ? record.correctedNote.trim() : '';
    items.push({
      id,
      entailed: record.entailed,
      failureReason,
      confidence: confidence as 'high' | 'low',
      correctedNote: corrected || null,
    });
  }
  return items;
}

export function applyEntailmentItem(
  evidenceText: string,
  noteText: string,
  item: SemanticEntailmentItem | undefined,
  opts: { quotedSpeaker?: string | null } = {},
): { text: string | null; failureReason: SemanticFailureReason | null } {
  const local = assessSemanticFidelity(evidenceText, noteText, opts);
  if (local.decision === 'reject') {
    return { text: null, failureReason: local.failureReason || 'other' };
  }
  if (!item || item.confidence !== 'high') {
    return { text: null, failureReason: item?.failureReason || 'other' };
  }
  if (item.entailed) return { text: noteText, failureReason: null };
  const corrected = item.correctedNote;
  if (!corrected) return { text: null, failureReason: item.failureReason || 'other' };
  const repaired = assessSemanticFidelity(evidenceText, corrected, opts);
  if (repaired.decision !== 'accept') return { text: null, failureReason: item.failureReason || 'other' };
  return { text: corrected, failureReason: null };
}
