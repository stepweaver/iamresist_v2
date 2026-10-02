import { JEV_API_BASE_URL, JEV_PINNED_MODEL, JEV_VENDOR_REQUEST_HEADERS } from '@/lib/jev/constants';
import { JevShadowError } from '@/lib/jev/errors';
import type {
  JevAnswer,
  JevChoiceAnswer,
  JevDecisionProvider,
  JevDecisionResult,
  JevFetch,
  JevModelCatalogSnapshot,
  JevModelListing,
  JevNoulAnswer,
} from '@/lib/jev/types';

const VERSIONED_JEV_MODEL = /^jev-\d+\.\d+\.\d+$/;

export function assertPinnedJevModel(model: string): void {
  if (model === 'jev-preview') {
    throw new JevShadowError('Refusing jev-preview. Jev model must be jev-latest.', 'model_unpinned');
  }
  if (model !== JEV_PINNED_MODEL) {
    throw new JevShadowError(
      `Jev model must be ${JEV_PINNED_MODEL}. Refusing "${model || 'empty'}".`,
      'model_unpinned',
    );
  }
}

export function assertPinnedModelListed(models: readonly JevModelListing[], requestedModel: string): void {
  assertPinnedJevModel(requestedModel);
  const names = models.map((model) => model.name);
  if (!names.includes(requestedModel)) {
    throw new JevShadowError(
      `Requested model ${requestedModel} is not available to this key. Refusing to fall back to jev-preview or any other model.`,
      'model_unavailable',
    );
  }
}

/**
 * `jev-latest` is an alias. System One may answer with a versioned id such as `jev-1.13.0`.
 * That resolution is expected. Any other name, including `jev-preview`, is not.
 */
export function classifyReturnedJevModel(input: {
  requestedModel: string;
  modelCatalogName: string;
  returnedModel: string;
}): 'match' | 'resolved_release' | 'unexpected' {
  if (input.returnedModel === input.requestedModel || input.returnedModel === input.modelCatalogName) {
    return 'match';
  }
  if (input.requestedModel === JEV_PINNED_MODEL && VERSIONED_JEV_MODEL.test(input.returnedModel)) {
    return 'resolved_release';
  }
  return 'unexpected';
}

export function catalogSnapshotForRequestedModel(
  models: readonly JevModelListing[],
  requestedModel: string,
): JevModelCatalogSnapshot {
  assertPinnedModelListed(models, requestedModel);
  const catalog = models.find((model) => model.name === requestedModel);
  if (!catalog?.releaseDate) {
    throw new JevShadowError(
      `Jev model catalog entry for ${requestedModel} did not include a release_date`,
      'response_invalid',
    );
  }
  return {
    requestedModel,
    modelCatalogName: catalog.name,
    modelCatalogReleaseDate: catalog.releaseDate,
    modelCatalogDescription: catalog.description,
  };
}

function vendorRequestId(headers: Headers): string | null {
  for (const name of JEV_VENDOR_REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new JevShadowError('Jev response was not an object', code);
  }
  return value as Record<string, unknown>;
}

function parseUsage(value: unknown): { inputTokens: number; outputTokens: number } {
  const usage = asRecord(value, 'response_invalid');
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    throw new JevShadowError('Jev response did not include token usage', 'response_invalid');
  }
  return { inputTokens, outputTokens };
}

function parseAnswer(value: unknown): JevAnswer {
  const row = asRecord(value, 'response_invalid');
  if (row.type === 'noul') {
    if (typeof row.noul !== 'number' || !Number.isFinite(row.noul)) {
      throw new JevShadowError('Jev noul answer was not a probability', 'response_invalid');
    }
    const answer: JevNoulAnswer = { type: 'noul', noul: row.noul };
    return answer;
  }
  if (row.type === 'choice') {
    if (typeof row.choice !== 'string' || !row.choice) {
      throw new JevShadowError('Jev choice answer was missing a choice', 'response_invalid');
    }
    if (typeof row.confidence !== 'number' || !Number.isFinite(row.confidence)) {
      throw new JevShadowError('Jev choice answer was missing confidence', 'response_invalid');
    }
    const probabilities = asRecord(row.probabilities, 'response_invalid');
    const parsed: Record<string, number> = {};
    for (const [key, probability] of Object.entries(probabilities)) {
      if (typeof probability !== 'number' || !Number.isFinite(probability)) {
        throw new JevShadowError('Jev choice probabilities were not numbers', 'response_invalid');
      }
      parsed[key] = probability;
    }
    const answer: JevChoiceAnswer = {
      type: 'choice',
      choice: row.choice,
      confidence: row.confidence,
      probabilities: parsed,
    };
    return answer;
  }
  throw new JevShadowError('Jev answer type was not noul or choice', 'response_invalid');
}

function parseModels(value: unknown): JevModelListing[] {
  const body = asRecord(value, 'response_invalid');
  if (!Array.isArray(body.models)) {
    throw new JevShadowError('Jev model list was missing models', 'response_invalid');
  }
  return body.models.map((entry) => {
    const row = asRecord(entry, 'response_invalid');
    if (typeof row.name !== 'string' || !row.name.trim()) {
      throw new JevShadowError('Jev model list entry was missing a name', 'response_invalid');
    }
    return {
      name: row.name.trim(),
      description: optionalText(row.description),
      releaseDate: optionalText(row.release_date),
    };
  });
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new JevShadowError('Jev response was not JSON', 'response_invalid');
  }
}

export function createTypeSafeJevProvider(input?: {
  apiKey?: string | null;
  fetchImpl?: JevFetch;
  baseUrl?: string;
}): JevDecisionProvider {
  const requestedModel = JEV_PINNED_MODEL;
  assertPinnedJevModel(requestedModel);
  const apiKey = input?.apiKey === undefined ? process.env.TYPESAFE_API_KEY : input.apiKey;
  const fetchImpl = input?.fetchImpl || fetch;
  const baseUrl = (input?.baseUrl || JEV_API_BASE_URL).replace(/\/$/, '');
  let validated = false;

  async function authed(path: string, init: RequestInit): Promise<Response> {
    const key = String(apiKey || '').trim();
    if (!key) {
      throw new JevShadowError('TYPESAFE_API_KEY is not configured', 'api_key_missing');
    }
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${key}`);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetchImpl(`${baseUrl}${path}`, { ...init, headers });
  }

  return {
    requestedModel,
    async validateModel() {
      const response = await authed('/models', { method: 'GET' });
      const body = await readJson(response);
      if (!response.ok) {
        throw new JevShadowError(`Jev model list failed with HTTP ${response.status}`, 'model_unavailable');
      }
      const models = parseModels(body);
      const catalog = catalogSnapshotForRequestedModel(models, requestedModel);
      validated = true;
      return { ...catalog, listedModels: models.map((model) => model.name) };
    },
    async decide(decision) {
      if (!validated) {
        throw new JevShadowError('Jev model was not validated before a decision call', 'model_unavailable');
      }
      assertPinnedJevModel(requestedModel);
      const response = await authed('/systemone', {
        method: 'POST',
        body: JSON.stringify({
          model: requestedModel,
          state: decision.state,
          questions: decision.questions,
        }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        throw new JevShadowError(`Jev decision failed with HTTP ${response.status}`, 'response_invalid');
      }
      const row = asRecord(body, 'response_invalid');
      if (typeof row.model !== 'string' || !row.model.trim()) {
        throw new JevShadowError('Jev decision response did not include a model', 'response_invalid');
      }
      const answersRow = asRecord(row.answers, 'response_invalid');
      const answers: Record<string, JevAnswer> = {};
      for (const key of Object.keys(decision.questions)) {
        answers[key] = parseAnswer(answersRow[key]);
      }
      const result: JevDecisionResult = {
        requestedModel,
        returnedModel: row.model,
        vendorRequestId: vendorRequestId(response.headers),
        answers,
        usage: parseUsage(row.usage),
      };
      return result;
    },
  };
}
