import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groqChatJson, healthCheckCreatorNotesGroq } from '@/lib/creatorNotes/ai/groq';
import { createCreatorNotesTextProvider } from '@/lib/creatorNotes/ai/provider';
import type { CreatorNotesAiConfig } from '@/lib/creatorNotes/ai/types';
import {
  CREATOR_NOTES_GROQ_BASE_URL,
  CREATOR_NOTES_GROQ_DEFAULT_MODEL,
  creatorNotesAiProvider,
  creatorNotesModelForProvider,
} from '@/lib/creatorNotes/constants';
import {
  CreatorNotesInferenceError,
  CreatorNotesRateLimitError,
  isCreatorNotesRateLimitError,
} from '@/lib/creatorNotes/errors';
import {
  assertCreatorNotesAiConfigured,
  creatorNotesRecoveryReason,
  entailCreatorNotes,
  extractCreatorNotesChunk,
  extractCreatorNotesWindowBatch,
  healthCheckCreatorNotesAi,
  isCreatorNotesRecoverableInferenceError,
  isCreatorNotesTransportFailure,
  resolveCreatorNotesAiConfig,
} from '@/lib/creatorNotes/extract';
import { CREATOR_NOTES_ENTAILMENT_JSON_SCHEMA, CREATOR_NOTES_JSON_SCHEMA } from '@/lib/creatorNotes/schema';
import { runCreatorNoteExtraction } from '@/lib/creatorNotes/run';
import type { CreatorTranscriptChunk, CreatorTranscriptInput, RawCreatorNote } from '@/lib/creatorNotes/types';
import { loadSyntheticTranscript } from './helpers';

const ENV_KEYS = [
  'CREATOR_NOTES_AI_PROVIDER',
  'CREATOR_NOTES_MODEL',
  'THEME_AI_PROVIDER',
  'GROQ_API_KEY',
] as const;

const previousEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (value == null || value === '') delete process.env[key];
  else process.env[key] = value;
}

function groqConfig(overrides: Partial<CreatorNotesAiConfig> = {}): CreatorNotesAiConfig {
  return {
    provider: 'groq',
    model: CREATOR_NOTES_GROQ_DEFAULT_MODEL,
    baseUrl: CREATOR_NOTES_GROQ_BASE_URL,
    timeoutMs: 1000,
    retries: 0,
    ...overrides,
  };
}

function ollamaConfig(overrides: Partial<CreatorNotesAiConfig> = {}): CreatorNotesAiConfig {
  return {
    provider: 'ollama',
    model: 'gemma3:4b',
    baseUrl: 'http://127.0.0.1:11434',
    timeoutMs: 1000,
    retries: 0,
    keepAlive: '5m',
    ...overrides,
  };
}

function transcript(): CreatorTranscriptInput {
  return {
    sourceItemId: 'source-provider',
    creatorId: 'riley-quinn',
    creatorName: 'Riley Quinn',
    sourceTitle: 'Westmere filing',
    sourceUrl: 'https://example.test/westmere',
    publishedAt: '2026-09-17T00:00:00.000Z',
    sourceIdentityKey: 'https://example.test/westmere',
    segments: [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 30,
        text: 'A federal appeals court issued a stay blocking the deployment order.',
      },
    ],
  };
}

function chunk(windowId = 'w0'): CreatorTranscriptChunk {
  const text = 'A federal appeals court issued a stay blocking the deployment order.';
  return {
    index: 0,
    windowId,
    startSeconds: 0,
    endSeconds: 30,
    segments: [{ index: 0, startSeconds: 0, endSeconds: 30, text }],
    segmentIndexes: [0],
    text,
    verbatimTranscript: text,
    charCount: text.length,
  };
}

function note(): RawCreatorNote {
  const text = 'A federal appeals court issued a stay blocking the deployment order.';
  return {
    kind: 'event',
    startSeconds: 0,
    endSeconds: 30,
    text,
    attribution: null,
    eventFeatures: null,
    sourceExcerpt: text,
    exactQuote: text,
    sourceSegmentIndexes: [0],
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function fetchCalls(fetchMock: { mock: { calls: readonly unknown[] } }): Array<[string, FetchInit | undefined]> {
  return fetchMock.mock.calls as unknown as Array<[string, FetchInit | undefined]>;
}

function requestBody(fetchMock: { mock: { calls: readonly unknown[] } }): Record<string, unknown> {
  return JSON.parse(String(fetchCalls(fetchMock)[0]?.[1]?.body || '{}')) as Record<string, unknown>;
}

function requestUrl(fetchMock: { mock: { calls: readonly unknown[] } }): string {
  return String(fetchCalls(fetchMock)[0]?.[0] || '');
}

describe('Creator Notes text inference providers', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) previousEnv[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('selects groq from CREATOR_NOTES_AI_PROVIDER without using Theme Memory', () => {
    setEnv('CREATOR_NOTES_AI_PROVIDER', 'Groq');
    setEnv('THEME_AI_PROVIDER', 'ollama');
    setEnv('CREATOR_NOTES_MODEL', '');
    setEnv('GROQ_API_KEY', 'test-groq-key');

    expect(creatorNotesAiProvider('none')).toBe('groq');
    const config = resolveCreatorNotesAiConfig();
    expect(config.provider).toBe('groq');
    expect(config.model).toBe(CREATOR_NOTES_GROQ_DEFAULT_MODEL);
    expect(config.model).toBe('openai/gpt-oss-20b');
    expect(config.baseUrl).toBe(CREATOR_NOTES_GROQ_BASE_URL);
    expect(creatorNotesModelForProvider('groq', 'llama3:latest')).toBe('openai/gpt-oss-20b');
    expect(JSON.stringify(config)).not.toContain('test-groq-key');
    expect(config).not.toHaveProperty('apiKey');
  });

  it('selects ollama and keeps the existing model fallback', () => {
    setEnv('CREATOR_NOTES_AI_PROVIDER', 'ollama');
    setEnv('THEME_AI_PROVIDER', 'none');
    setEnv('CREATOR_NOTES_MODEL', '');

    expect(creatorNotesAiProvider('none')).toBe('ollama');
    const config = resolveCreatorNotesAiConfig();
    expect(config.provider).toBe('ollama');
    expect(config.baseUrl).toContain('11434');
    expect(creatorNotesModelForProvider('ollama', 'llama3:latest')).toBe('llama3:latest');
    expect(config.keepAlive).toBe('5m');
  });

  it('keeps Ollama when CREATOR_NOTES_AI_PROVIDER is unset and THEME_AI_PROVIDER=ollama', () => {
    setEnv('CREATOR_NOTES_AI_PROVIDER', '');
    setEnv('THEME_AI_PROVIDER', 'ollama');
    setEnv('CREATOR_NOTES_MODEL', 'gemma3:4b');

    expect(resolveCreatorNotesAiConfig().provider).toBe('ollama');
    expect(resolveCreatorNotesAiConfig().model).toBe('gemma3:4b');
  });

  it('rejects an unknown provider and does not call the network', () => {
    setEnv('CREATOR_NOTES_AI_PROVIDER', 'anthropic');
    setEnv('GROQ_API_KEY', 'test-groq-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(creatorNotesAiProvider('ollama')).toBe('anthropic');
    expect(() => assertCreatorNotesAiConfigured()).toThrow(CreatorNotesInferenceError);
    expect(() => assertCreatorNotesAiConfigured()).toThrow(/Unknown CREATOR_NOTES_AI_PROVIDER=anthropic/);
    try {
      assertCreatorNotesAiConfigured();
    } catch (error) {
      expect(error).toMatchObject({ code: 'provider_unknown', provider: 'anthropic' });
    }
    expect(() => createCreatorNotesTextProvider(resolveCreatorNotesAiConfig())).toThrow(CreatorNotesInferenceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a missing provider as not configured', () => {
    setEnv('CREATOR_NOTES_AI_PROVIDER', '');
    setEnv('THEME_AI_PROVIDER', 'none');
    expect(creatorNotesAiProvider('none')).toBe('');
    expect(() => assertCreatorNotesAiConfigured()).toThrow(/CREATOR_NOTES_AI_PROVIDER is not configured/);
    try {
      assertCreatorNotesAiConfigured();
    } catch (error) {
      expect(error).toMatchObject({ code: 'provider_not_configured' });
    }
  });

  it('sends Creator Notes JSON schema to Groq and parses usage and rate-limit headers', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          model: 'openai/gpt-oss-20b',
          choices: [{ message: { content: '{"notes":[]}' } }],
          usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
        },
        {
          headers: {
            'x-ratelimit-limit-requests': '100',
            'x-ratelimit-remaining-requests': '99',
            'x-ratelimit-limit-tokens': '1000',
            'x-ratelimit-remaining-tokens': '800',
            'x-ratelimit-reset-requests': '1s',
            'x-ratelimit-reset-tokens': '2s',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await groqChatJson(groqConfig(), {
      messages: [{ role: 'user', content: 'extract' }],
      schema: CREATOR_NOTES_JSON_SCHEMA,
      schemaName: 'creator_notes',
      timeoutMs: 1000,
      model: 'openai/gpt-oss-20b',
    });

    expect(requestUrl(fetchMock)).toBe('https://api.groq.com/openai/v1/chat/completions');
    const init = fetchCalls(fetchMock)[0]?.[1];
    expect(init?.headers?.Authorization).toBe('Bearer test-groq-key');
    const body = requestBody(fetchMock);
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'creator_notes',
        strict: false,
        schema: CREATOR_NOTES_JSON_SCHEMA,
      },
    });
    expect(result.content).toBe('{"notes":[]}');
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 4, totalTokens: 15 });
    expect(result.rateLimit).toMatchObject({
      limitRequests: '100',
      remainingRequests: '99',
      limitTokens: '1000',
      remainingTokens: '800',
      resetRequests: '1s',
      resetTokens: '2s',
      retryAfter: null,
    });
  });

  it('parses partial Groq usage and omits rate-limit metadata when headers are absent', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          model: 'openai/gpt-oss-20b',
          choices: [{ message: { content: '{"notes":[]}' } }],
          usage: { prompt_tokens: 8 },
        }),
      ),
    );

    const result = await groqChatJson(groqConfig(), {
      messages: [{ role: 'user', content: 'extract' }],
      schema: CREATOR_NOTES_JSON_SCHEMA,
      schemaName: 'creator_notes',
      timeoutMs: 1000,
      model: 'openai/gpt-oss-20b',
    });

    expect(result.usage).toEqual({ promptTokens: 8, completionTokens: null, totalTokens: null });
    expect(result.rateLimit).toBeNull();
  });

  it('routes single-window, batch, and entailment calls through Groq without trusting JSON alone', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body || '{}')) as {
        response_format?: { json_schema?: { name?: string } };
      };
      const name = body.response_format?.json_schema?.name;
      const content =
        name === 'creator_notes_batch'
          ? '{"windows":[]}'
          : name === 'creator_notes_entailment'
            ? '{"results":[{"id":"0","entailed":true,"confidence":"high"}]}'
            : JSON.stringify({
                notes: [
                  {
                    kind: 'not_a_kind',
                    text: 'This sentence is long enough to pass the minimum length.',
                    sourceQuote: 'not in the window',
                  },
                ],
              });
      return jsonResponse({
        model: 'openai/gpt-oss-20b',
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const config = groqConfig();

    const extracted = await extractCreatorNotesChunk({
      transcript: transcript(),
      chunk: chunk(),
      chunkCount: 1,
      config,
    });
    expect(extracted.notes).toHaveLength(0);
    expect(extracted.rejected).toBeGreaterThan(0);
    expect(requestUrl(fetchMock)).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(requestBody(fetchMock).response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'creator_notes', strict: false },
    });

    const batched = await extractCreatorNotesWindowBatch({
      transcript: transcript(),
      windows: [chunk('w0'), chunk('w1')],
      chunkCount: 2,
      config,
    });
    expect(batched.windows).toEqual([]);
    const batchBody = JSON.parse(String(fetchCalls(fetchMock)[1]?.[1]?.body || '{}')) as {
      response_format?: { json_schema?: { name?: string } };
    };
    expect(batchBody.response_format?.json_schema?.name).toBe('creator_notes_batch');

    const entailed = await entailCreatorNotes({
      evidenceText: note().text,
      notes: [note()],
      config,
    });
    expect(entailed.notes).toHaveLength(1);
    const entailBody = JSON.parse(String(fetchCalls(fetchMock)[2]?.[1]?.body || '{}')) as {
      response_format?: { json_schema?: { schema?: unknown; name?: string } };
    };
    expect(entailBody.response_format?.json_schema?.name).toBe('creator_notes_entailment');
    expect(entailBody.response_format?.json_schema?.schema).toEqual(CREATOR_NOTES_ENTAILMENT_JSON_SCHEMA);
    expect(fetchCalls(fetchMock).every((call) => call[0].startsWith('https://api.groq.com/'))).toBe(true);
  });

  it('fails Groq calls when the API key is missing and does not send a request', async () => {
    setEnv('GROQ_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      groqChatJson(groqConfig(), {
        messages: [{ role: 'user', content: 'extract' }],
        schema: CREATOR_NOTES_JSON_SCHEMA,
        schemaName: 'creator_notes',
        timeoutMs: 1000,
        model: 'openai/gpt-oss-20b',
      }),
    ).rejects.toMatchObject({ name: 'CreatorNotesInferenceError', code: 'groq_api_key_missing' });
    expect(() => assertCreatorNotesAiConfigured(groqConfig())).toThrow(/GROQ_API_KEY is not configured/);
    const health = await healthCheckCreatorNotesGroq(groqConfig());
    expect(health).toMatchObject({ ok: false, reachable: false, error: 'groq_api_key_missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('represents Groq authentication failure separately from rate limiting', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'invalid api key' } }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      groqChatJson(groqConfig(), {
        messages: [{ role: 'user', content: 'extract' }],
        schema: CREATOR_NOTES_JSON_SCHEMA,
        schemaName: 'creator_notes',
        timeoutMs: 1000,
        model: 'openai/gpt-oss-20b',
      }),
    ).rejects.toMatchObject({ code: 'groq_auth_failed', status: 401, provider: 'groq' });

    const health = await healthCheckCreatorNotesAi(groqConfig());
    expect(health).toMatchObject({ ok: false, reachable: true, error: 'groq_auth_failed' });
    expect(fetchCalls(fetchMock)[1]?.[0]).toBe('https://api.groq.com/openai/v1/models');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('represents other Groq HTTP failures as provider failures', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'upstream blew up' } }, { status: 500 })),
    );

    const error = await groqChatJson(groqConfig(), {
      messages: [{ role: 'user', content: 'extract' }],
      schema: CREATOR_NOTES_JSON_SCHEMA,
      schemaName: 'creator_notes',
      timeoutMs: 1000,
      model: 'openai/gpt-oss-20b',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CreatorNotesInferenceError);
    expect(error).toMatchObject({ code: 'provider_http_500', status: 500, provider: 'groq' });
    expect(isCreatorNotesRateLimitError(error)).toBe(false);
    expect(creatorNotesRecoveryReason(error)).toBeNull();
  });

  it('makes Groq HTTP 429 distinguishable and does not fall back to Ollama', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    setEnv('CREATOR_NOTES_AI_PROVIDER', 'groq');
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { message: 'rate limit reached' } },
        { status: 429, headers: { 'retry-after': '7', 'x-ratelimit-remaining-requests': '0' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await groqChatJson(groqConfig(), {
      messages: [{ role: 'user', content: 'extract' }],
      schema: CREATOR_NOTES_JSON_SCHEMA,
      schemaName: 'creator_notes',
      timeoutMs: 1000,
      model: 'openai/gpt-oss-20b',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CreatorNotesRateLimitError);
    expect(isCreatorNotesRateLimitError(error)).toBe(true);
    expect(error).toMatchObject({
      code: 'CREATOR_NOTES_RATE_LIMITED',
      status: 429,
      provider: 'groq',
      retryAfter: '7',
    });
    expect((error as CreatorNotesRateLimitError).rateLimit).toMatchObject({
      retryAfter: '7',
      remainingRequests: '0',
    });
    expect(creatorNotesRecoveryReason(error)).toBeNull();
    expect(isCreatorNotesTransportFailure(error)).toBe(false);
    expect(isCreatorNotesRecoverableInferenceError(error)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl(fetchMock)).toBe('https://api.groq.com/openai/v1/chat/completions');

    await expect(
      runCreatorNoteExtraction(
        { transcript: loadSyntheticTranscript('source-groq-429'), dryRun: true, maxWindows: 1 },
        { aiConfig: groqConfig(), extractionCache: null, log: () => {} },
      ),
    ).rejects.toBeInstanceOf(CreatorNotesRateLimitError);
    const calls = fetchCalls(fetchMock);
    expect(calls.every((call) => call[0].includes('api.groq.com'))).toBe(true);
    expect(calls.some((call) => call[0].includes('11434'))).toBe(false);
  });

  it('keeps the Ollama chat request on the existing transport', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/tags')) return jsonResponse({ models: [{ name: 'gemma3:4b' }] });
      return jsonResponse({
        model: 'gemma3:4b',
        message: { content: '{"notes":[]}' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const extracted = await extractCreatorNotesChunk({
      transcript: transcript(),
      chunk: chunk(),
      chunkCount: 1,
      config: ollamaConfig(),
    });
    expect(extracted.notes).toEqual([]);
    expect(requestUrl(fetchMock)).toBe('http://127.0.0.1:11434/api/chat');
    const body = requestBody(fetchMock);
    expect(body.format).toEqual(CREATOR_NOTES_JSON_SCHEMA);
    expect(body.format).not.toBe('json');
    expect(body.keep_alive).toBe('5m');
    expect(body.model).toBe('gemma3:4b');
    expect(body).not.toHaveProperty('response_format');

    const health = await healthCheckCreatorNotesAi(ollamaConfig());
    expect(health).toEqual({ ok: true, reachable: true });
    expect(fetchCalls(fetchMock).at(-1)?.[0]).toBe('http://127.0.0.1:11434/api/tags');
  });

  it('health-checks Groq with an authenticated models request and no generation', async () => {
    setEnv('GROQ_API_KEY', 'test-groq-key');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ id: 'openai/gpt-oss-20b' }, { id: 'openai/gpt-oss-120b' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const health = await healthCheckCreatorNotesAi(groqConfig());
    expect(health).toEqual({ ok: true, reachable: true });
    expect(requestUrl(fetchMock)).toBe('https://api.groq.com/openai/v1/models');
    const init = fetchCalls(fetchMock)[0]?.[1];
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(init?.headers?.Authorization).toBe('Bearer test-groq-key');
  });
});
