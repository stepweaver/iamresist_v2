import { extractNumericTokens, unsupportedNumericTokens } from '@/lib/creatorNotes/sourceEvidence';
import {
  ANALYSIS_ENTRY_KINDS,
  EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS,
  NOTE_KIND_TO_ENTRY_KIND,
  type EventThreadEntryKind,
  type EventThreadResolutionType,
} from '@/lib/eventThreads/constants';
import { suppliedContextText } from '@/lib/eventThreads/context';
import type { EventThreadNoteContext } from '@/lib/eventThreads/types';

const ACTOR_ALIASES: Array<[RegExp, string[]]> = [
  [/\b(u\.?s\.?a?|united states|america[ns]?)\b/i, ['u.s.', 'us', 'usa', 'united states', 'america', 'american', 'americans']],
  [/\biranian?s?\b/i, ['iran', 'iranian', 'iranians']],
  [/\bthaad\b/i, ['thaad']],
  [/\bpatriot\b/i, ['patriot', 'patriots']],
];

const MOTIVE_FACT_RE =
  /\b(because they want|in order to|to intimidate|to destabilize|secretly (?:trying|planning)|their motive)\b/i;

const STEELMAN_RE =
  /\b(steelman|steelmanning|hypothetic(?:al|ally)|for the sake of argument|one might argue|the strongest version|counterargument|steel-man)\b/i;

const CONDITIONAL_RE = /\b(if|unless|were to|would|could|should the|in the event that)\b/i;

const DATE_TOKEN_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{4})?|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi;

export function normalizeMatchText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function haystackContains(haystack: string, needle: string): boolean {
  const hay = normalizeMatchText(haystack);
  const need = normalizeMatchText(needle);
  if (!need) return true;
  if (hay.includes(need)) return true;
  for (const [pattern, aliases] of ACTOR_ALIASES) {
    if (pattern.test(needle) && aliases.some((alias) => hay.includes(normalizeMatchText(alias)))) {
      return true;
    }
  }
  return false;
}

export function extractDateTokens(text: string): string[] {
  const matches = String(text || '').match(DATE_TOKEN_RE) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const key = normalizeMatchText(match);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(match.trim());
  }
  return out;
}

const PROPER_NOUN_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}|[A-Z]{2,}(?:\s+[A-Z]{2,})?)\b/g;

const GENERIC_PROPER = new Set(
  [
    'The',
    'This',
    'That',
    'These',
    'Those',
    'Professor',
    'Jiang',
    'U',
    'S',
    'US',
    'UAE',
    'THAAD',
    'Patriot',
    'Patriots',
    'Systems',
    'Iran',
    'Iranian',
    'American',
    'Americans',
  ].map((value) => value.toLowerCase()),
);

export function extractCandidateActors(text: string): string[] {
  const matches = String(text || '').match(PROPER_NOUN_RE) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const cleaned = match.replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    if (key === 'the' || key === 'this' || key === 'that') continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export function preserveConditionalLanguage(resolvedText: string, originalText: string): boolean {
  if (!CONDITIONAL_RE.test(originalText)) return true;
  return CONDITIONAL_RE.test(resolvedText);
}

export function preserveSteelmanLanguage(resolvedText: string, originalText: string): boolean {
  if (!STEELMAN_RE.test(originalText)) return true;
  return STEELMAN_RE.test(resolvedText) || /does not (?:believe|claim|assert) that the steelman/i.test(resolvedText);
}

export function looksLikeSteelman(text: string): boolean {
  return STEELMAN_RE.test(text);
}

export function looksLikeConditional(text: string): boolean {
  return CONDITIONAL_RE.test(text);
}

export function inventedMotive(resolvedText: string, contextText: string): boolean {
  if (!MOTIVE_FACT_RE.test(resolvedText)) return false;
  return !MOTIVE_FACT_RE.test(contextText);
}

export type InferenceBoundaryFailure =
  | 'invented_number'
  | 'invented_date'
  | 'invented_actor'
  | 'invented_motive'
  | 'dropped_conditional'
  | 'dropped_steelman'
  | 'analysis_flattened'
  | 'text_too_long'
  | 'empty_text';

type CreatorAtomicNoteKindLike = keyof typeof NOTE_KIND_TO_ENTRY_KIND;

export function entryKindForNote(kind: CreatorAtomicNoteKindLike): EventThreadEntryKind {
  return NOTE_KIND_TO_ENTRY_KIND[kind];
}

export function isAnalysisKind(kind: EventThreadEntryKind): boolean {
  return (ANALYSIS_ENTRY_KINDS as readonly string[]).includes(kind);
}

export function resolutionTypeForKind(
  entryKind: EventThreadEntryKind,
  proposed: EventThreadResolutionType,
): EventThreadResolutionType {
  if (proposed === 'uncertain') return 'uncertain';
  if (isAnalysisKind(entryKind)) return 'creator_analysis';
  return proposed;
}

export function checkInferenceBoundary(input: {
  resolvedText: string;
  context: EventThreadNoteContext;
  entryKind: EventThreadEntryKind;
}): InferenceBoundaryFailure | null {
  const text = String(input.resolvedText || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'empty_text';
  if (text.length > EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS) return 'text_too_long';

  const contextText = suppliedContextText(input.context);
  const unsupported = unsupportedNumericTokens(text, contextText);
  if (unsupported.length) return 'invented_number';

  for (const date of extractDateTokens(text)) {
    if (!haystackContains(contextText, date) && !extractNumericTokens(contextText).includes(date.replace(/\D/g, ''))) {
      const dateHay = normalizeMatchText(contextText);
      if (!dateHay.includes(normalizeMatchText(date))) return 'invented_date';
    }
  }

  const original = input.context.note.text;
  if (!preserveConditionalLanguage(text, original)) return 'dropped_conditional';
  if (!preserveSteelmanLanguage(text, original)) return 'dropped_steelman';
  if (inventedMotive(text, contextText)) return 'invented_motive';

  const originalKind = entryKindForNote(input.context.note.kind);
  if (isAnalysisKind(originalKind) && !isAnalysisKind(input.entryKind)) {
    return 'analysis_flattened';
  }

  const contextNorm = normalizeMatchText(contextText);
  for (const actor of extractCandidateActors(text)) {
    if (haystackContains(contextText, actor)) continue;
    const actorNorm = normalizeMatchText(actor);
    if (actorNorm.split(' ').every((part) => contextNorm.includes(part))) continue;
    if (GENERIC_PROPER.has(actorNorm)) continue;
    if (actorNorm.length < 4) continue;
    return 'invented_actor';
  }

  return null;
}
