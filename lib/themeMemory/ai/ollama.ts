import 'server-only';

import { Agent, fetch as undiciFetch } from 'undici';

import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { ThemeAIUnavailableError, ThemeAIValidationError } from '@/lib/themeMemory/ai/types';
import type { ThemeAIProvider, ThemeLabelGenerateInput, ThemeMembershipClassifyInput } from '@/lib/themeMemory/ai/types';
import { buildLabelMessages, buildMembershipMessages } from '@/lib/themeMemory/ai/prompts';
import {
  THEME_AI_STRUCTURED_TEMPERATURE,
  THEME_LABEL_JSON_SCHEMA,
  THEME_MEMBERSHIP_JSON_SCHEMA,
} from '@/lib/themeMemory/ai/schemas';
import { parseMembershipOutput, parseThemeLabelOutput } from '@/lib/themeMemory/ai/validate';

type OllamaChatResponse = {
  model?: string;
  message?: { content?: string };
  response?: string;
  error?: string;
};

function isRetryable(error: unknown): boolean {
  if (error instanceof ThemeAIValidationError) return false;
  if (error instanceof ThemeAIUnavailableError) {
    return /timeout|abort|502|503|529|network/i.test(error.message);
  }
  if (error instanceof Error) {
    return /timeout|abort|fetch|network|ECONNREFUSED|ETIMEDOUT/i.test(error.message);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OLLAMA_TAGS_PROBE_TIMEOUT_MS = 25000;
const OLLAMA_WARMUP_KEEP_ALIVE = '30m';
const OLLAMA_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_THEME_AI_STARTUP_TIMEOUT_MS = 180000;

export const OLLAMA_CHAT_KEEP_ALIVE = OLLAMA_WARMUP_KEEP_ALIVE;

/**
 * Undici's default headersTimeout/bodyTimeout is 300s. Long Ollama generations
 * then surface as generic `fetch failed` even though AbortController is still waiting.
 */
export function ollamaFetchTimeoutMs(timeoutMs: number): number {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : 60_000;
  return timeout + 5_000;
}

function createOllamaDispatcher(timeoutMs: number): Agent {
  const wait = ollamaFetchTimeoutMs(timeoutMs);
  return new Agent({
    headersTimeout: wait,
    bodyTimeout: wait,
    connectTimeout: OLLAMA_CONNECT_TIMEOUT_MS,
  });
}

function ollamaRuntimeFetch(): typeof undiciFetch {
  if (process.env.NODE_ENV === 'test' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch as unknown as typeof undiciFetch;
  }
  return undiciFetch;
}

function probeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'ollama_timeout';
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function ollamaChatJson(input: {
  messages: Array<{ role: string; content: string }>;
  format: unknown;
  timeoutMs: number;
  baseUrl: string;
  model: string;
  retries: number;
  logLabel?: string;
  options?: Record<string, unknown>;
  keepAlive?: string | null;
}): Promise<{ content: string; model: string }> {
  const url = `${input.baseUrl.replace(/\/$/, '')}/api/chat`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= input.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    const dispatcher = createOllamaDispatcher(input.timeoutMs);
    try {
      const res = await ollamaRuntimeFetch()(url, {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        dispatcher,
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          stream: false,
          format: input.format,
          keep_alive: input.keepAlive || undefined,
          options: { temperature: THEME_AI_STRUCTURED_TEMPERATURE, ...(input.options || {}) },
        }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const failed = (await res.json()) as OllamaChatResponse;
          if (failed.error) detail = `:${failed.error}`;
        } catch {
          detail = '';
        }
        const retryableStatus = res.status === 502 || res.status === 503 || res.status === 529;
        const err = new ThemeAIUnavailableError(
          `ollama_http_${res.status}${detail}`.slice(0, 240),
          `ollama_http_${res.status}`,
        );
        if (!retryableStatus || attempt === input.retries) throw err;
        lastError = err;
        await sleep(250 * (attempt + 1));
        continue;
      }

      const json = (await res.json()) as OllamaChatResponse;
      if (json.error) {
        throw new ThemeAIUnavailableError('ollama_error', 'ollama_error');
      }
      const content = json.message?.content || json.response || '';
      if (!String(content).trim()) {
        throw new ThemeAIValidationError('empty_model_output');
      }
      console.info(input.logLabel || '[theme-memory-ai]', 'ollama ok', {
        model: json.model || input.model,
        chars: String(content).length,
        attempt,
      });
      return { content: String(content), model: json.model || input.model };
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ThemeAIUnavailableError('ollama_timeout', 'ollama_timeout');
      }
      if (attempt === input.retries || !isRetryable(lastError)) {
        throw lastError;
      }
      await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      try {
        await dispatcher.close();
      } catch {
        // ignore
      }
    }
  }

  throw lastError instanceof Error ? lastError : new ThemeAIUnavailableError('ollama_failed', 'ollama_failed');
}

export type OllamaProbeResult = {
  ok: boolean;
  reachable: boolean;
  modelConfigured: boolean;
  model: string | null;
  baseUrl: string;
  error?: string;
};

export async function probeOllama(opts: {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  startupTimeoutMs?: number;
} = {}): Promise<OllamaProbeResult> {
  const baseUrl = (opts.baseUrl || themeMemoryEnv.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = opts.model || themeMemoryEnv.OLLAMA_MODEL || '';
  const tagsTimeoutMs = opts.timeoutMs ?? Math.min(themeMemoryEnv.THEME_AI_TIMEOUT_MS || 45000, OLLAMA_TAGS_PROBE_TIMEOUT_MS);
  const startupTimeoutMs =
    opts.startupTimeoutMs ?? themeMemoryEnv.THEME_AI_STARTUP_TIMEOUT_MS ?? DEFAULT_THEME_AI_STARTUP_TIMEOUT_MS;
  if (!model) {
    return { ok: false, reachable: false, modelConfigured: false, model: null, baseUrl, error: 'OLLAMA_MODEL is not configured' };
  }

  const tagsController = new AbortController();
  const tagsTimer = setTimeout(() => tagsController.abort(), tagsTimeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET', cache: 'no-store', signal: tagsController.signal });
    if (!res.ok) {
      return { ok: false, reachable: true, modelConfigured: true, model, baseUrl, error: `ollama_http_${res.status}` };
    }
    const json = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = (json.models || []).map((row) => row.name || row.model || '').filter(Boolean);
    const found = names.some((name) => name === model || name.startsWith(`${model}:`) || name.split(':')[0] === model);
    if (!found) {
      return {
        ok: false,
        reachable: true,
        modelConfigured: true,
        model,
        baseUrl,
        error: `configured model not installed: ${model}`,
      };
    }
  } catch (error) {
    return { ok: false, reachable: false, modelConfigured: true, model, baseUrl, error: probeErrorMessage(error) };
  } finally {
    clearTimeout(tagsTimer);
  }

  const pingController = new AbortController();
  const pingTimer = setTimeout(() => pingController.abort(), startupTimeoutMs);
  try {
    const ping = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      cache: 'no-store',
      signal: pingController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Reply with JSON: {"ok":true}',
        stream: false,
        format: 'json',
        keep_alive: OLLAMA_WARMUP_KEEP_ALIVE,
      }),
    });
    const pingJson = (await ping.json().catch(() => ({}))) as { error?: string; response?: string };
    if (!ping.ok || pingJson.error) {
      return {
        ok: false,
        reachable: true,
        modelConfigured: true,
        model,
        baseUrl,
        error: pingJson.error || `ollama_http_${ping.status}`,
      };
    }
  } catch (error) {
    return { ok: false, reachable: true, modelConfigured: true, model, baseUrl, error: probeErrorMessage(error) };
  } finally {
    clearTimeout(pingTimer);
  }

  return { ok: true, reachable: true, modelConfigured: true, model, baseUrl };
}

export async function smokeTestOllamaMembership(opts: {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
} = {}) {
  const provider = createOllamaThemeAIProvider({
    baseUrl: opts.baseUrl,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
    retries: 0,
  });
  const decision = await provider.classifyMembership({
    itemTitle: 'City transit authority approves downtown rail extension',
    itemSummary: 'The municipal transit board voted to fund a downtown rail extension.',
    itemRole: 'reporting',
    itemSourceSystem: 'newswire',
    itemSourceName: 'Municipal Gazette',
    themeLabel: 'Downtown rail expansion',
    themeHeadline: 'Downtown rail expansion',
    themeMemberTitles: ['Downtown rail expansion remains under review'],
    fingerprintOverlap: {
      sharedDistinctive: ['downtown', 'rail'],
      sharedPhrases: ['downtown rail'],
      reasons: ['test_overlap'],
    },
    itemFingerprint: {
      distinctiveTokens: ['downtown', 'rail', 'extension'],
      supportingTokens: ['city'],
      phrases: ['downtown rail'],
      weakEntities: [],
      clusterKeys: {},
      actionHints: [],
      eventType: null,
      entitySpans: [],
    },
  });
  return { provider: provider.name, model: provider.model, decision };
}

export function createOllamaThemeAIProvider(opts: {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  retries?: number;
} = {}): ThemeAIProvider {
  const baseUrl = opts.baseUrl || themeMemoryEnv.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = opts.model || themeMemoryEnv.OLLAMA_MODEL;
  const timeoutMs = opts.timeoutMs ?? themeMemoryEnv.THEME_AI_TIMEOUT_MS ?? 45000;
  const retries = opts.retries ?? themeMemoryEnv.THEME_AI_MAX_RETRIES ?? 2;

  if (!model) {
    throw new ThemeAIUnavailableError('OLLAMA_MODEL is not configured', 'model_not_configured');
  }

  return {
    name: 'ollama',
    model,
    async classifyMembership(input: ThemeMembershipClassifyInput) {
      const { content } = await ollamaChatJson({
        messages: buildMembershipMessages(input),
        format: THEME_MEMBERSHIP_JSON_SCHEMA,
        timeoutMs,
        baseUrl,
        model,
        retries,
      });
      return parseMembershipOutput(content);
    },
    async generateThemeLabel(input: ThemeLabelGenerateInput) {
      const { content } = await ollamaChatJson({
        messages: buildLabelMessages(input),
        format: THEME_LABEL_JSON_SCHEMA,
        timeoutMs,
        baseUrl,
        model,
        retries,
      });
      return parseThemeLabelOutput(content);
    },
  };
}
