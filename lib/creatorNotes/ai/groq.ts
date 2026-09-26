import 'server-only';

import { Agent, fetch as undiciFetch } from 'undici';

import type {
  CreatorNotesAiConfig,
  CreatorNotesChatJsonRequest,
  CreatorNotesChatJsonResult,
  CreatorNotesHealthCheckResult,
  CreatorNotesRateLimitSnapshot,
  CreatorNotesTextProvider,
  CreatorNotesTokenUsage,
} from '@/lib/creatorNotes/ai/types';
import { CREATOR_NOTES_GROQ_BASE_URL } from '@/lib/creatorNotes/constants';
import { CreatorNotesInferenceError, CreatorNotesRateLimitError } from '@/lib/creatorNotes/errors';

const GROQ_CONNECT_TIMEOUT_MS = 30_000;
const GROQ_HEALTH_TIMEOUT_MS = 8_000;

type HeaderSource = { get(name: string): string | null };

type GroqChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: unknown;
  error?: { message?: string };
};

/**
 * Groq strict JSON schema mode requires every property to be required.
 * Creator Notes schemas keep optional fields, and application validation stays
 * authoritative, so requests use best-effort json_schema (strict: false).
 */
export const CREATOR_NOTES_GROQ_JSON_SCHEMA_STRICT = false;

export function creatorNotesGroqApiKey(): string {
  return String(process.env.GROQ_API_KEY || '').trim();
}

function groqFetchTimeoutMs(timeoutMs: number): number {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : 60_000;
  return timeout + 5_000;
}

function createGroqDispatcher(timeoutMs: number): Agent {
  const wait = groqFetchTimeoutMs(timeoutMs);
  return new Agent({
    headersTimeout: wait,
    bodyTimeout: wait,
    connectTimeout: GROQ_CONNECT_TIMEOUT_MS,
  });
}

function groqRuntimeFetch(): typeof undiciFetch {
  if (process.env.NODE_ENV === 'test' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch as unknown as typeof undiciFetch;
  }
  return undiciFetch;
}

function headerValue(headers: HeaderSource, name: string): string | null {
  const value = headers.get(name);
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function readCreatorNotesRateLimitHeaders(headers: HeaderSource): CreatorNotesRateLimitSnapshot | null {
  const snapshot: CreatorNotesRateLimitSnapshot = {
    limitRequests: headerValue(headers, 'x-ratelimit-limit-requests'),
    limitTokens: headerValue(headers, 'x-ratelimit-limit-tokens'),
    remainingRequests: headerValue(headers, 'x-ratelimit-remaining-requests'),
    remainingTokens: headerValue(headers, 'x-ratelimit-remaining-tokens'),
    resetRequests: headerValue(headers, 'x-ratelimit-reset-requests'),
    resetTokens: headerValue(headers, 'x-ratelimit-reset-tokens'),
    retryAfter: headerValue(headers, 'retry-after'),
  };
  if (Object.values(snapshot).every((value) => value == null)) return null;
  return snapshot;
}

function finiteTokenCount(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

export function parseCreatorNotesTokenUsage(usage: unknown): CreatorNotesTokenUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const row = usage as Record<string, unknown>;
  const promptTokens = finiteTokenCount(row.prompt_tokens);
  const completionTokens = finiteTokenCount(row.completion_tokens);
  const totalTokens = finiteTokenCount(row.total_tokens);
  if (promptTokens == null && completionTokens == null && totalTokens == null) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function responseHeaders(headers: unknown): HeaderSource {
  if (headers && typeof headers === 'object' && 'get' in headers && typeof headers.get === 'function') {
    return headers as HeaderSource;
  }
  return { get: () => null };
}

function groqBaseUrl(config: CreatorNotesAiConfig): string {
  return (config.baseUrl || CREATOR_NOTES_GROQ_BASE_URL).replace(/\/$/, '');
}

function clipDetail(value: string): string {
  return value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function groqMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
}

function requireGroqApiKey(): string {
  const apiKey = creatorNotesGroqApiKey();
  if (!apiKey) {
    throw new CreatorNotesInferenceError('GROQ_API_KEY is not configured', 'groq_api_key_missing', {
      provider: 'groq',
    });
  }
  return apiKey;
}

async function readGroqErrorDetail(res: { json?: () => Promise<unknown>; text?: () => Promise<string> }): Promise<string> {
  try {
    if (typeof res.json === 'function') {
      const body = (await res.json()) as GroqChatResponse;
      if (body?.error?.message) return clipDetail(body.error.message);
    }
  } catch {
    // Fall through to text when the body is not JSON.
  }
  try {
    if (typeof res.text === 'function') {
      const text = await res.text();
      if (text.trim()) return clipDetail(text);
    }
  } catch {
    return '';
  }
  return '';
}

export function groqJsonSchemaResponseFormat(schemaName: string, schema: unknown) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: schemaName,
      strict: CREATOR_NOTES_GROQ_JSON_SCHEMA_STRICT,
      schema,
    },
  };
}

export async function groqChatJson(
  config: CreatorNotesAiConfig,
  request: CreatorNotesChatJsonRequest,
): Promise<CreatorNotesChatJsonResult> {
  const apiKey = requireGroqApiKey();
  const url = `${groqBaseUrl(config)}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  const dispatcher = createGroqDispatcher(request.timeoutMs);
  try {
    const res = await groqRuntimeFetch()(url, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      dispatcher,
      body: JSON.stringify({
        model: request.model || config.model,
        messages: request.messages,
        temperature: 0,
        stream: false,
        response_format: groqJsonSchemaResponseFormat(request.schemaName, request.schema),
      }),
    });
    const rateLimit = readCreatorNotesRateLimitHeaders(responseHeaders(res.headers));
    if (res.status === 429) {
      throw new CreatorNotesRateLimitError('groq_http_429', {
        provider: 'groq',
        retryAfter: rateLimit?.retryAfter ?? null,
        rateLimit,
      });
    }
    if (res.status === 401 || res.status === 403) {
      const detail = await readGroqErrorDetail(res);
      throw new CreatorNotesInferenceError(
        detail ? `groq_auth_failed: ${detail}` : 'groq_auth_failed',
        'groq_auth_failed',
        { provider: 'groq', status: res.status },
      );
    }
    if (!res.ok) {
      const detail = await readGroqErrorDetail(res);
      throw new CreatorNotesInferenceError(
        detail ? `provider_http_${res.status}: ${detail}` : `provider_http_${res.status}`,
        `provider_http_${res.status}`,
        { provider: 'groq', status: res.status },
      );
    }
    const json = (await res.json()) as GroqChatResponse;
    const content = groqMessageContent(json.choices?.[0]?.message?.content);
    if (!content.trim()) {
      throw new CreatorNotesInferenceError('empty_model_output', 'empty_model_output', { provider: 'groq' });
    }
    const usage = parseCreatorNotesTokenUsage(json.usage);
    console.info(request.logLabel || '[creator-notes-ai]', 'groq ok', {
      model: json.model || request.model || config.model,
      chars: content.length,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    });
    return {
      content,
      model: json.model || request.model || config.model,
      usage,
      rateLimit,
    };
  } catch (error) {
    if (error instanceof CreatorNotesRateLimitError || error instanceof CreatorNotesInferenceError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'The operation was aborted')) {
      throw new CreatorNotesInferenceError('inference_timeout', 'inference_timeout', { provider: 'groq' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    try {
      await dispatcher.close();
    } catch {
      // ignore
    }
  }
}

export async function healthCheckCreatorNotesGroq(
  config: CreatorNotesAiConfig,
): Promise<CreatorNotesHealthCheckResult> {
  const apiKey = creatorNotesGroqApiKey();
  if (!apiKey) {
    return { ok: false, reachable: false, error: 'groq_api_key_missing' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs || GROQ_HEALTH_TIMEOUT_MS, GROQ_HEALTH_TIMEOUT_MS));
  const dispatcher = createGroqDispatcher(GROQ_HEALTH_TIMEOUT_MS);
  try {
    const res = await groqRuntimeFetch()(`${groqBaseUrl(config)}/models`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
      dispatcher,
    });
    if (res.status === 429) {
      return { ok: false, reachable: true, error: 'groq_http_429', rateLimited: true };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reachable: true, error: 'groq_auth_failed' };
    }
    if (!res.ok) {
      return { ok: false, reachable: true, error: `provider_http_${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
    const ids = Array.isArray(json.data) ? json.data.map((row) => String(row?.id || '').trim()).filter(Boolean) : [];
    if (ids.length > 0 && config.model && !ids.includes(config.model)) {
      return { ok: false, reachable: true, error: `configured model not available: ${config.model}` };
    }
    return { ok: true, reachable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reachable: false,
      error: message === 'The operation was aborted' ? 'inference_timeout' : message,
    };
  } finally {
    clearTimeout(timer);
    try {
      await dispatcher.close();
    } catch {
      // ignore
    }
  }
}

export function createGroqCreatorNotesProvider(config: CreatorNotesAiConfig): CreatorNotesTextProvider {
  return {
    name: 'groq',
    chatJson(request) {
      return groqChatJson(config, request);
    },
    healthCheck() {
      return healthCheckCreatorNotesGroq(config);
    },
  };
}
