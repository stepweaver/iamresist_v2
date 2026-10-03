import { requestJevSystemOne, resolveJevModel } from '@/lib/headlineTimeline/jev/client';
import {
  JEV_RELATION_CRITERIA,
  JEV_RELATION_INSTRUCTIONS,
  JEV_RELATION_QUESTION_KEY,
} from '@/lib/headlineTimeline/jev/constants';
import {
  HEADLINE_RELATIONS,
  RETIRED_HEADLINE_RELATION,
  type HeadlineJevStateItem,
  type HeadlineRelation,
  type JevCallOptions,
  type JevClassificationResult,
  type JevTokenUsage,
} from '@/lib/headlineTimeline/jev/types';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';

export function jevStateItem(item: HeadlineCandidate): HeadlineJevStateItem {
  return {
    title: item.title,
    description: item.summary,
    publishedAt: item.publishedAt,
    sourceType: item.sourceKind,
  };
}

export function buildJevRelationRequest(
  a: HeadlineCandidate,
  b: HeadlineCandidate,
  model?: string,
) {
  return {
    model: resolveJevModel(model),
    state: {
      a: jevStateItem(a),
      b: jevStateItem(b),
    },
    questions: {
      [JEV_RELATION_QUESTION_KEY]: {
        type: 'choice' as const,
        instructions: JEV_RELATION_INSTRUCTIONS,
        criteria: JEV_RELATION_CRITERIA,
      },
    },
  };
}

function isRelation(value: unknown): value is HeadlineRelation {
  return typeof value === 'string' && (HEADLINE_RELATIONS as readonly string[]).includes(value);
}

function readProbabilities(value: unknown): Record<HeadlineRelation, number> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const probabilities = {} as Record<HeadlineRelation, number>;
  for (const relation of HEADLINE_RELATIONS) {
    const score = record[relation];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return null;
    probabilities[relation] = score;
  }
  return probabilities;
}

function readUsage(payload: unknown): JevTokenUsage | null {
  if (!payload || typeof payload !== 'object' || !('usage' in payload)) return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return null;
  if (!Number.isInteger(inputTokens) || !Number.isInteger(outputTokens)) return null;
  if (inputTokens < 0 || outputTokens < 0) return null;
  return { inputTokens, outputTokens };
}

/** Parse a System One body. Malformed output is a failure, not a guess. */
export function parseJevSystemOneResponse(
  payload: unknown,
  elapsedMs: number | null,
): JevClassificationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'jev response did not include a relation choice', elapsedMs };
  }
  const body = payload as { model?: unknown; answers?: unknown };
  if (typeof body.model !== 'string' || !body.model.trim()) {
    return { ok: false, error: 'jev response did not include a model', elapsedMs };
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return { ok: false, error: 'jev response did not include a relation choice', elapsedMs };
  }
  const answer = (body.answers as Record<string, unknown>)[JEV_RELATION_QUESTION_KEY];
  if (!answer || typeof answer !== 'object') {
    return { ok: false, error: 'jev response did not include a relation choice', elapsedMs };
  }
  const choice = answer as { type?: unknown; choice?: unknown; probabilities?: unknown; confidence?: unknown };
  if (choice.choice === RETIRED_HEADLINE_RELATION) {
    return {
      ok: false,
      error: 'retired relation same_broader_topic is not remapped',
      elapsedMs,
    };
  }
  if (choice.type !== 'choice' || !isRelation(choice.choice)) {
    return { ok: false, error: 'jev response did not include a relation choice', elapsedMs };
  }
  const probabilities = readProbabilities(choice.probabilities);
  if (!probabilities) {
    return { ok: false, error: 'jev response probabilities were malformed', elapsedMs };
  }
  if (typeof choice.confidence !== 'number' || !Number.isFinite(choice.confidence) || choice.confidence < 0 || choice.confidence > 1) {
    return { ok: false, error: 'jev response confidence was malformed', elapsedMs };
  }
  return {
    ok: true,
    relation: choice.choice,
    probabilities,
    confidence: choice.confidence,
    model: body.model,
    usage: readUsage(payload),
    elapsedMs,
  };
}

export async function classifyHeadlinePair(
  a: HeadlineCandidate,
  b: HeadlineCandidate,
  options: JevCallOptions = {},
): Promise<JevClassificationResult> {
  const request = buildJevRelationRequest(a, b, options.model);
  const http = await requestJevSystemOne(request, options);
  if (!http.ok) {
    return { ok: false, error: http.error, elapsedMs: http.elapsedMs };
  }
  return parseJevSystemOneResponse(http.body, http.elapsedMs);
}
