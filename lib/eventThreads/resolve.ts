import { randomUUID } from 'node:crypto';

import { isUuid } from '@/lib/creatorNotes/identity';
import { extractJsonObject } from '@/lib/themeMemory/ai/validate';
import {
  EVENT_THREAD_CONFIDENCE_VALUES,
  EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS,
  type EventThreadConfidence,
  type EventThreadEntryKind,
  type EventThreadResolutionType,
} from '@/lib/eventThreads/constants';
import { distinctiveTermsFromText } from '@/lib/eventThreads/identity';
import { suppliedContextText } from '@/lib/eventThreads/context';
import {
  checkInferenceBoundary,
  entryKindForNote,
  isAnalysisKind,
  looksLikeConditional,
  looksLikeSteelman,
  resolutionTypeForKind,
} from '@/lib/eventThreads/grounding';
import { EVENT_THREADS_ENTRY_KIND_SET, EVENT_THREADS_RESOLUTION_TYPE_SET } from '@/lib/eventThreads/schema';
import type { EventThreadNoteContext, EventThreadsAiConfig, ResolvedThreadEntry } from '@/lib/eventThreads/types';

const PRONOUN_RE = /\b(they|them|their|it|its|those|these|he|him|his|she|her)\b/i;
const LAUNCH_RE = /\b(fir(?:e|es|ed)|launch(?:ed|es)?|attack(?:ed|s)?)\b/i;
const INTERCEPT_RE = /\b(intercept(?:s|ed|ing)?|shot down|destroyed)\b/i;
const NUMBER_RE = /\b(\d{1,4})\b/g;
const MISSILE_RE = /\b(ballistic\s+missiles?|missiles?|rockets?|drones?)\b/i;

function clipResolved(text: string): string {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS) return cleaned;
  return cleaned.slice(0, EVENT_THREADS_RESOLVED_TEXT_MAX_CHARS).trimEnd();
}

function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = new RegExp(NUMBER_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function americanToUs(text: string): string {
  return text
    .replace(/\bAmerican\b/g, 'U.S.')
    .replace(/\bAmericans\b/g, 'U.S. forces');
}

export function listenAnchorSeconds(context: EventThreadNoteContext): number | null {
  const note = context.note;
  if (note.anchorStartSeconds != null && Number.isFinite(note.anchorStartSeconds) && note.anchorStartSeconds >= 0) {
    return note.anchorStartSeconds;
  }
  if (note.startSeconds != null && Number.isFinite(note.startSeconds) && note.startSeconds >= 0) {
    return note.startSeconds;
  }
  return null;
}

function identityFromContext(
  context: EventThreadNoteContext,
  resolutionType: EventThreadResolutionType,
  resolvedText: string,
): { terms: string[]; phrases: string[] } {
  const current = distinctiveTermsFromText(`${resolvedText}\n${context.note.text}\n${context.evidenceWindow}`);
  const contextual =
    resolutionType === 'semantic_role' ||
    resolutionType === 'coreference' ||
    resolutionType === 'ellipsis' ||
    resolutionType === 'discourse_context';
  const previous = contextual ? distinctiveTermsFromText(context.precedingWindow || '') : { terms: [], phrases: [] };
  return {
    terms: [...new Set([...current.terms, ...previous.terms])],
    phrases: [...new Set([...current.phrases, ...previous.phrases])],
  };
}

function fallbackEntry(context: EventThreadNoteContext, patch: Partial<ResolvedThreadEntry>): ResolvedThreadEntry {
  const entryKind = patch.entryKind || entryKindForNote(context.note.kind);
  const resolutionType = resolutionTypeForKind(
    entryKind,
    (patch.resolutionType as EventThreadResolutionType) || 'literal',
  );
  const resolvedText = clipResolved(patch.resolvedText || context.note.text);
  const identity = identityFromContext(context, resolutionType, resolvedText);
  return {
    id: patch.id || randomUUID(),
    atomicNoteId: context.note.id,
    entryKind,
    resolvedText,
    resolutionType,
    occurredAt: patch.occurredAt ?? null,
    timeProvenance: patch.timeProvenance || 'unknown',
    sortOrder: patch.sortOrder ?? 0,
    creatorName: patch.creatorName ?? context.note.attribution ?? context.source.creatorName,
    sourceUrl: patch.sourceUrl ?? context.source.url,
    listenAnchorSeconds: patch.listenAnchorSeconds ?? listenAnchorSeconds(context),
    confidence: patch.confidence || (resolutionType === 'uncertain' ? 'uncertain' : 'medium'),
    identityTerms: patch.identityTerms || identity.terms,
    identityPhrases: patch.identityPhrases || identity.phrases,
  };
}

function uncertain(context: EventThreadNoteContext, text?: string): ResolvedThreadEntry {
  return fallbackEntry(context, {
    resolvedText: text || context.note.text,
    resolutionType: 'uncertain',
    confidence: 'uncertain',
    entryKind: entryKindForNote(context.note.kind),
  });
}

export function resolveSemanticRoleIntercept(context: EventThreadNoteContext): ResolvedThreadEntry | null {
  const current = `${context.note.text}\n${context.evidenceWindow}`;
  const previous = context.precedingWindow || '';
  if (!previous || !INTERCEPT_RE.test(current) || !LAUNCH_RE.test(previous)) return null;
  if (!MISSILE_RE.test(previous) && !MISSILE_RE.test(current)) return null;

  const launched = numbersIn(previous);
  const intercepted = numbersIn(current);
  if (!launched.length || !intercepted.length) return null;

  const launchedCount = launched[0];
  const interceptedCount = intercepted[0];
  if (interceptedCount > launchedCount) return null;

  const interceptor =
    /\b(thaad|patriot)\b/i.test(current)
      ? 'U.S. THAAD and Patriot systems'
      : americanToUs(context.note.text).replace(/\bintercept(?:s|ed|ing)?\b.*$/i, '').trim() || 'U.S. systems';

  const weaponMatch = (previous.match(MISSILE_RE) || current.match(MISSILE_RE) || ['missiles'])[0];
  const weapon = /missile/i.test(weaponMatch) ? 'missiles' : weaponMatch.replace(/^iranian\s+/i, '');
  const resolved = `${interceptor} intercepted ${interceptedCount} of ${launchedCount} Iranian ${weapon}.`;

  const candidate = fallbackEntry(context, {
    resolvedText: resolved,
    resolutionType: 'semantic_role',
    confidence: 'high',
    entryKind: entryKindForNote(context.note.kind) === 'creator_analysis' ? 'creator_analysis' : 'event',
  });
  if (checkInferenceBoundary({ resolvedText: candidate.resolvedText, context, entryKind: candidate.entryKind })) {
    return null;
  }
  return candidate;
}

function resolveCoreference(context: EventThreadNoteContext): ResolvedThreadEntry | null {
  if (!PRONOUN_RE.test(context.note.text) && !PRONOUN_RE.test(context.evidenceWindow)) return null;
  const previous = context.precedingWindow || '';
  const prevActors = context.neighboringNotes
    .flatMap((note) => note.eventFeatures?.actors || [])
    .concat(context.note.eventFeatures?.actors || []);
  const actor =
    prevActors.find((value) => value && suppliedContextText(context).toLowerCase().includes(value.toLowerCase())) ||
    (previous.match(/\b(Iran|U\.?S\.?|United States|THAAD|Patriot(?:\s+Systems)?)\b/) || [])[0];
  if (!actor) return null;

  const replaced = context.note.text.replace(PRONOUN_RE, actor);
  if (replaced === context.note.text) return null;
  const candidate = fallbackEntry(context, {
    resolvedText: replaced,
    resolutionType: 'coreference',
    confidence: 'medium',
  });
  if (checkInferenceBoundary({ resolvedText: candidate.resolvedText, context, entryKind: candidate.entryKind })) {
    return null;
  }
  return candidate;
}

export function resolveNoteDeterministically(context: EventThreadNoteContext): ResolvedThreadEntry {
  const noteId = String(context.note.id || '');
  if (!isUuid(noteId) || !context.allowedNoteIds.has(noteId)) {
    const rejected = uncertain(context, context.note.text);
    rejected.atomicNoteId = null;
    return rejected;
  }

  const entryKind = entryKindForNote(context.note.kind);
  if (looksLikeSteelman(context.note.text) || looksLikeSteelman(context.evidenceWindow)) {
    return fallbackEntry(context, {
      entryKind: 'creator_analysis',
      resolutionType: 'creator_analysis',
      confidence: 'high',
      resolvedText: context.note.text,
    });
  }

  const intercept = resolveSemanticRoleIntercept(context);
  if (intercept) {
    intercept.entryKind = isAnalysisKind(entryKind) ? entryKind : intercept.entryKind;
    intercept.resolutionType = resolutionTypeForKind(intercept.entryKind, 'semantic_role');
    return intercept;
  }

  const coref = resolveCoreference(context);
  if (coref) {
    coref.entryKind = entryKind;
    coref.resolutionType = resolutionTypeForKind(entryKind, 'coreference');
    return coref;
  }

  if (looksLikeConditional(context.note.text)) {
    return fallbackEntry(context, {
      entryKind,
      resolutionType: resolutionTypeForKind(entryKind, 'literal'),
      confidence: 'high',
      resolvedText: context.note.text,
    });
  }

  return fallbackEntry(context, {
    entryKind,
    resolutionType: resolutionTypeForKind(entryKind, 'literal'),
    confidence: isAnalysisKind(entryKind) ? 'high' : 'high',
    resolvedText: context.note.text,
  });
}

function asResolutionType(value: unknown): EventThreadResolutionType | null {
  const cleaned = String(value || '').trim();
  return EVENT_THREADS_RESOLUTION_TYPE_SET.has(cleaned) ? (cleaned as EventThreadResolutionType) : null;
}

function asEntryKind(value: unknown): EventThreadEntryKind | null {
  const cleaned = String(value || '').trim();
  return EVENT_THREADS_ENTRY_KIND_SET.has(cleaned) ? (cleaned as EventThreadEntryKind) : null;
}

function asConfidence(value: unknown): EventThreadConfidence {
  const cleaned = String(value || '').trim();
  return (EVENT_THREAD_CONFIDENCE_VALUES as readonly string[]).includes(cleaned)
    ? (cleaned as EventThreadConfidence)
    : 'medium';
}

export function applyResolvedCandidate(
  context: EventThreadNoteContext,
  candidate: {
    resolvedText?: string;
    resolutionType?: string;
    entryKind?: string;
    confidence?: string;
  },
): ResolvedThreadEntry {
  const originalKind = entryKindForNote(context.note.kind);
  let entryKind = asEntryKind(candidate.entryKind) || originalKind;
  if (isAnalysisKind(originalKind)) entryKind = originalKind;
  if (looksLikeSteelman(context.note.text)) entryKind = 'creator_analysis';

  let resolutionType = asResolutionType(candidate.resolutionType) || 'uncertain';
  resolutionType = resolutionTypeForKind(entryKind, resolutionType);

  const resolvedText = clipResolved(candidate.resolvedText || context.note.text);
  const failure = checkInferenceBoundary({ resolvedText, context, entryKind });
  if (failure) {
    return uncertain(context, context.note.text);
  }

  return fallbackEntry(context, {
    resolvedText,
    resolutionType,
    entryKind,
    confidence: resolutionType === 'uncertain' ? 'uncertain' : asConfidence(candidate.confidence),
  });
}

export function parseResolverOutput(content: string, context: EventThreadNoteContext): ResolvedThreadEntry {
  try {
    const parsed = extractJsonObject(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return resolveNoteDeterministically(context);
    }
    const row = parsed as Record<string, unknown>;
    return applyResolvedCandidate(context, {
      resolvedText: typeof row.resolvedText === 'string' ? row.resolvedText : undefined,
      resolutionType: typeof row.resolutionType === 'string' ? row.resolutionType : undefined,
      entryKind: typeof row.entryKind === 'string' ? row.entryKind : undefined,
      confidence: typeof row.confidence === 'string' ? row.confidence : undefined,
    });
  } catch {
    return resolveNoteDeterministically(context);
  }
}

export async function resolveNoteWithOptionalAi(
  context: EventThreadNoteContext,
  deps: {
    aiConfig?: EventThreadsAiConfig | null;
    chatJson?: (input: {
      messages: Array<{ role: string; content: string }>;
      format: unknown;
      timeoutMs: number;
      baseUrl: string;
      model: string;
      retries: number;
      logLabel?: string;
      keepAlive?: string | null;
    }) => Promise<{ content: string }>;
    buildMessages?: (context: EventThreadNoteContext) => Array<{ role: string; content: string }>;
    format?: unknown;
  } = {},
): Promise<ResolvedThreadEntry> {
  const deterministic = resolveNoteDeterministically(context);
  const needsAi =
    deterministic.resolutionType === 'uncertain' ||
    (PRONOUN_RE.test(context.note.text) && deterministic.resolutionType === 'literal');
  if (!needsAi || !deps.chatJson || !deps.aiConfig || deps.aiConfig.provider !== 'ollama') {
    return deterministic;
  }

  const { buildEventThreadResolveMessages } = await import('@/lib/eventThreads/prompt');
  const { EVENT_THREADS_RESOLVE_JSON_SCHEMA } = await import('@/lib/eventThreads/schema');
  try {
    const { content } = await deps.chatJson({
      messages: (deps.buildMessages || buildEventThreadResolveMessages)(context),
      format: deps.format || EVENT_THREADS_RESOLVE_JSON_SCHEMA,
      timeoutMs: deps.aiConfig.timeoutMs,
      baseUrl: deps.aiConfig.baseUrl,
      model: deps.aiConfig.model,
      retries: deps.aiConfig.retries,
      logLabel: '[event-threads-ai]',
      keepAlive: deps.aiConfig.keepAlive || null,
    });
    return parseResolverOutput(content, context);
  } catch {
    return deterministic.resolutionType === 'uncertain' ? deterministic : uncertain(context);
  }
}

export function rejectInvalidAtomicNoteId(
  context: EventThreadNoteContext,
  atomicNoteId: string | null,
): string | null {
  if (!atomicNoteId) return 'missing_atomic_note_id';
  if (!isUuid(atomicNoteId)) return 'invalid_atomic_note_id';
  if (!context.allowedNoteIds.has(atomicNoteId)) return 'unknown_atomic_note_id';
  return null;
}
