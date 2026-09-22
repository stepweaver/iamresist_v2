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
  /\b(steelman|steelmanning|steel-man|for the sake of argument|one might argue|the strongest version|grant(?:ing)? that)\b/i;

const HYPOTHETICAL_RE = /\b(hypothetic(?:al|ally)|suppose(?:d)? that|imagining that|imagine that)\b/i;

const ALTERNATIVE_RE =
  /\b(alternative explanation|alternative reading|another interpretation|other possibility|competing explanation|alternative view)\b/i;

const COUNTERARGUMENT_RE =
  /\b(counterargument|counter-argument|on the other hand|critics (?:would|might) (?:say|argue)|the opposing view)\b/i;

const SCENARIO_RE = /\b((?:in )?this scenario|scenario in which|scenario where)\b/i;

const CONDITIONAL_RE = /\b(if|unless|were to|would|could|should the|in the event that)\b/i;

const CREATOR_CONCLUSION_RE =
  /\b(this explanation fails|fails to account|does not account|doesn't account|breaks down|the problem with this|however,? this|jiang argues that this|jiang concludes|this (?:reading|explanation) (?:fails|collapses|breaks)|still fails|argues the steelman|steelman\b.{0,80}\bfails)\b/i;

const BELIEF_ATTRIBUTION_RE =
  /\b((?:jiang|he|she|the creator) believes|(?:jiang|he|she) thinks that|is convinced that)\b/i;

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
  if (!STEELMAN_RE.test(originalText) && !ALTERNATIVE_RE.test(originalText)) return true;
  return (
    STEELMAN_RE.test(resolvedText) ||
    ALTERNATIVE_RE.test(resolvedText) ||
    /considers the alternative/i.test(resolvedText) ||
    /does not (?:believe|claim|assert) that the steelman/i.test(resolvedText)
  );
}

export function looksLikeSteelman(text: string): boolean {
  return STEELMAN_RE.test(text);
}

export function looksLikeConditional(text: string): boolean {
  return CONDITIONAL_RE.test(text);
}

export type DiscourseState =
  | 'steelman'
  | 'hypothetical'
  | 'alternative_explanation'
  | 'counterargument'
  | 'scenario'
  | 'conditional'
  | 'creator_conclusion'
  | 'factual';

export function classifyDiscourseState(text: string): DiscourseState {
  const source = String(text || '');
  if (CREATOR_CONCLUSION_RE.test(source)) return 'creator_conclusion';
  if (STEELMAN_RE.test(source)) return 'steelman';
  if (ALTERNATIVE_RE.test(source)) return 'alternative_explanation';
  if (HYPOTHETICAL_RE.test(source)) return 'hypothetical';
  if (COUNTERARGUMENT_RE.test(source)) return 'counterargument';
  if (SCENARIO_RE.test(source)) return 'scenario';
  if (CONDITIONAL_RE.test(source)) return 'conditional';
  return 'factual';
}

export function isNonEndorsingDiscourse(state: DiscourseState): boolean {
  return (
    state === 'steelman' ||
    state === 'hypothetical' ||
    state === 'alternative_explanation' ||
    state === 'counterargument' ||
    state === 'scenario'
  );
}

export function looksLikeBeliefAttribution(text: string): boolean {
  return BELIEF_ATTRIBUTION_RE.test(text);
}

export function resolutionNumberHaystack(context: EventThreadNoteContext): string {
  return [context.note.text, context.evidenceWindow, context.precedingWindow, context.followingWindow]
    .filter(Boolean)
    .join('\n');
}

const YEAR_RE = /^(?:19|20)\d{2}$/;

export function eventCountNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /\b(\d{1,4})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text || '')))) {
    const n = Number(match[1]);
    if (!Number.isFinite(n)) continue;
    if (YEAR_RE.test(match[1])) continue;
    out.push(n);
  }
  return out;
}

export function unsupportedResolvedNumbers(resolvedText: string, context: EventThreadNoteContext): string[] {
  const haystack = resolutionNumberHaystack(context);
  const numeric = unsupportedNumericTokens(resolvedText, haystack);
  const resolvedCounts = eventCountNumbers(resolvedText);
  const allowed = new Set(eventCountNumbers(haystack));
  const missing = resolvedCounts.filter((value) => !allowed.has(value)).map(String);
  return [...new Set([...numeric, ...missing])];
}

function firstVerb(text: string): string | null {
  const match = String(text || '').match(
    /\b(announced|announce|fires?|fired|launch(?:ed|es)?|intercept(?:s|ed|ing)?|destroy(?:s|ed)?|ground(?:s|ed)?|widen(?:ed|s)?|escalat(?:e|es|ed|ing)|capture[ds]?|underwrit(?:e|es|ing)|attack(?:s|ed)?)\b/i,
  );
  return match ? match[1] : null;
}

export function extractSimpleRoles(text: string): { actor: string | null; action: string | null; object: string | null } {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const action = firstVerb(source);
  const actors = extractCandidateActors(source);
  const actor = actors[0] || null;
  let object: string | null = null;
  if (action) {
    const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const after = source.split(new RegExp(`\\b${escaped}\\b`, 'i'))[1] || '';
    const objectMatch = after.match(/^\s+(?:the\s+|a\s+|an\s+)?(.{2,80}?)(?:[.,;:]|$)/i);
    object = objectMatch ? objectMatch[1].replace(/\b(quietly|recently|today)\b/gi, '').trim() : null;
  }
  return { actor, action, object };
}

function actorAliases(actor: string): string[] {
  const normalized = normalizeMatchText(actor);
  for (const [pattern, aliases] of ACTOR_ALIASES) {
    if (pattern.test(actor)) return aliases;
  }
  return normalized ? [normalized] : [];
}

function sameEntity(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftAliases = actorAliases(a);
  const rightAliases = actorAliases(b);
  return leftAliases.some((alias) => rightAliases.includes(alias) || right.includes(alias) || alias.includes(right));
}

export function semanticRolesUnsupported(resolvedText: string, context: EventThreadNoteContext): boolean {
  const original = context.note.text;
  const originalRoles = extractSimpleRoles(original);
  const resolvedRoles = extractSimpleRoles(resolvedText);
  const contextText = resolutionNumberHaystack(context);
  const features = context.note.eventFeatures;

  if (resolvedRoles.actor && !haystackContains(contextText, resolvedRoles.actor)) {
    return true;
  }

  if (resolvedRoles.object && extractCandidateActors(resolvedRoles.object).length) {
    const objectActors = extractCandidateActors(resolvedRoles.object);
    for (const objectActor of objectActors) {
      const originalHadObjectActor = Boolean(originalRoles.object && haystackContains(originalRoles.object, objectActor));
      const featureObject = Boolean(features?.object && haystackContains(features.object, objectActor));
      const contextHasPatient =
        Boolean(resolvedRoles.action) &&
        new RegExp(
          `\\b${String(resolvedRoles.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^.!?]{0,60}\\b${objectActor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i',
        ).test(contextText);
      if (!originalHadObjectActor && !featureObject && !contextHasPatient && sameEntity(resolvedRoles.actor, objectActor)) {
        return true;
      }
    }
  }

  if (
    resolvedRoles.actor &&
    resolvedRoles.object &&
    sameEntity(resolvedRoles.actor, resolvedRoles.object) &&
    !(originalRoles.actor && originalRoles.object && sameEntity(originalRoles.actor, originalRoles.object))
  ) {
    return true;
  }

  if (
    /\b(them|it|those|these)\b/i.test(original) &&
    resolvedRoles.object &&
    extractCandidateActors(resolvedRoles.object).some(
      (actor) => (features?.actors || []).some((value) => sameEntity(value, actor)) || sameEntity(resolvedRoles.actor, actor),
    ) &&
    /\b(planes?|missiles?|ships?|drones?|flights?|aircraft)\b/i.test(original) &&
    !/\b(planes?|missiles?|ships?|drones?|flights?|aircraft)\b/i.test(resolvedRoles.object)
  ) {
    return true;
  }

  const patientVerbRe =
    /\b(ground(?:s|ed)?|destroy(?:s|ed)?|escalat(?:e|es|ed|ing)|intercept(?:s|ed|ing)?|capture[ds]?|widen(?:ed|s)?)\s+(them|it|those|these)\b/gi;
  let pronounObject: RegExpExecArray | null;
  while ((pronounObject = patientVerbRe.exec(original))) {
    const verb = pronounObject[1];
    if (!verb) continue;
    const resolvedObject = resolvedText.match(
      new RegExp(`\\b${verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([A-Z][A-Za-z.'-]{2,}(?:\\s+[A-Z][A-Za-z.'-]{2,})*)`, 'i'),
    );
    const replacement = resolvedObject?.[1];
    if (!replacement) continue;
    const replacementIsActor =
      sameEntity(resolvedRoles.actor, replacement) ||
      (features?.actors || []).some((actor) => sameEntity(actor, replacement)) ||
      extractCandidateActors(contextText).some((actor) => sameEntity(actor, replacement) && !haystackContains(original, `${verb} ${replacement}`));
    if (replacementIsActor && !haystackContains(original, `${verb} ${replacement}`)) {
      return true;
    }
  }

  return false;
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
  | 'role_corruption'
  | 'belief_from_steelman'
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
  if (proposed === 'discourse_context') return 'discourse_context';
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
  if (unsupportedResolvedNumbers(text, input.context).length) return 'invented_number';

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
  const discourseHaystack = `${original}\n${input.context.evidenceWindow || ''}\n${input.context.precedingWindow || ''}`;
  if (isNonEndorsingDiscourse(classifyDiscourseState(discourseHaystack)) && looksLikeBeliefAttribution(text)) {
    return 'belief_from_steelman';
  }
  if (semanticRolesUnsupported(text, input.context)) return 'role_corruption';

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
