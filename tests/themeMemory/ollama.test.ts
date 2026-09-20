import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env/themeMemory', () => ({
  themeMemoryEnv: {
    THEME_AI_PROVIDER: 'ollama',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'test-model',
    THEME_AI_TIMEOUT_MS: 1000,
    THEME_AI_STARTUP_TIMEOUT_MS: 180000,
    THEME_AI_MAX_RETRIES: 1,
  },
}));

import { themeMemoryEnv } from '@/lib/env/themeMemory';
import {
  createOllamaThemeAIProvider,
  ollamaChatJson,
  ollamaFetchTimeoutMs,
  probeOllama,
} from '@/lib/themeMemory/ai/ollama';
import { ThemeAIValidationError } from '@/lib/themeMemory/ai/types';
import type { ThemeMembershipClassifyInput } from '@/lib/themeMemory/ai/types';
import {
  THEME_AI_STRUCTURED_TEMPERATURE,
  THEME_LABEL_JSON_SCHEMA,
  THEME_MEMBERSHIP_JSON_SCHEMA,
} from '@/lib/themeMemory/ai/schemas';
import { THEME_MAX_REASON_CHARS, THEME_MAX_REASONS } from '@/lib/themeMemory/constants';
import { extractThemeFingerprint } from '@/lib/themeMemory/features';

function membershipInput(overrides: Partial<ThemeMembershipClassifyInput> = {}): ThemeMembershipClassifyInput {
  return {
    itemTitle: 'Tariff authority appeal',
    itemSummary: 'Court hears the case',
    itemRole: 'creator',
    itemSourceSystem: 'voice',
    itemSourceName: 'Pakman',
    themeLabel: 'tariff authority',
    themeHeadline: 'Tariff authority fight continues',
    themeMemberTitles: ['Tariff plan challenged'],
    fingerprintOverlap: { sharedDistinctive: ['tariff'], sharedPhrases: [], reasons: [] },
    itemFingerprint: extractThemeFingerprint({ title: 'Tariff authority appeal' }),
    ...overrides,
  };
}

function chatBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as { body?: string; dispatcher?: { close?: () => Promise<void> } };
  return JSON.parse(String(init?.body || '{}')) as {
    format?: unknown;
    options?: { temperature?: number };
    messages?: Array<{ role: string; content: string }>;
    keep_alive?: string;
  };
}

function chatInit(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return fetchMock.mock.calls[call]?.[1] as { body?: string; dispatcher?: { close?: () => Promise<void> } };
}

function abortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function waitForAbort(signal?: AbortSignal) {
  return new Promise<never>((_, reject) => {
    if (!signal) {
      reject(new Error('missing AbortSignal'));
      return;
    }
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener('abort', () => reject(abortError()));
  });
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(abortError());
      return;
    }
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    });
  });
}

function tagsOk() {
  return {
    ok: true,
    json: async () => ({ models: [{ name: 'test-model' }] }),
  };
}

function generateOk() {
  return {
    ok: true,
    json: async () => ({ response: '{"ok":true}' }),
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function generateBody(fetchMock: ReturnType<typeof vi.fn>) {
  const generateCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/generate'));
  const init = generateCall?.[1] as { body?: string } | undefined;
  return JSON.parse(String(init?.body || '{}')) as {
    prompt?: string;
    keep_alive?: string;
    format?: string;
    stream?: boolean;
    model?: string;
  };
}

describe('Ollama Theme AI provider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    themeMemoryEnv.THEME_AI_TIMEOUT_MS = 1000;
    themeMemoryEnv.THEME_AI_STARTUP_TIMEOUT_MS = 180000;
    themeMemoryEnv.THEME_AI_MAX_RETRIES = 1;
  });

  it('parses structured membership output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          model: 'test-model',
          message: {
            content: JSON.stringify({
              belongs: true,
              confidence: 0.8,
              reasons: ['same legal dispute'],
            }),
          },
        }),
      })),
    );

    const provider = createOllamaThemeAIProvider({
      model: 'test-model',
      timeoutMs: 1000,
      retries: 0,
    });
    const decision = await provider.classifyMembership(membershipInput());
    expect(decision.belongs).toBe(true);
    expect(decision.confidence).toBe(0.8);
  });

  it('sends membership JSON schema rather than format json', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'test-model',
        message: {
          content: JSON.stringify({ belongs: true, confidence: 0.8, reasons: [] }),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 0, timeoutMs: 1000 });
    await provider.classifyMembership(membershipInput());
    const body = chatBody(fetchMock);
    expect(body.format).not.toBe('json');
    expect(body.format).toEqual(THEME_MEMBERSHIP_JSON_SCHEMA);
    expect(body.options?.temperature).toBe(THEME_AI_STRUCTURED_TEMPERATURE);
    expect(body.options?.temperature).toBe(0);
    expect(body.messages?.some((row) => /topical association only|not factual corroboration/i.test(row.content))).toBe(
      true,
    );
    expect(body.messages?.some((row) => /THIS SPECIFIC story|same underlying event/i.test(row.content))).toBe(true);
    expect(body.messages?.some((row) => /Do not invent a bridge/i.test(row.content))).toBe(true);
    expect(body.messages?.some((row) => /untrusted evidence/i.test(row.content))).toBe(true);
  });

  it('sends a separate label JSON schema at temperature 0', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'test-model',
        message: {
          content: JSON.stringify({
            canonicalLabel: 'tariff authority',
            headline: 'Tariff authority fight continues',
            summary: 'Tracked creators continued covering the dispute.',
          }),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 0, timeoutMs: 1000 });
    await provider.generateThemeLabel({
      currentLabel: 'tariff',
      memberTitles: ['Tariff plan'],
      memberRoles: ['creator'],
      creatorNames: ['Pakman'],
    });
    const body = chatBody(fetchMock);
    expect(body.format).not.toBe('json');
    expect(body.format).toEqual(THEME_LABEL_JSON_SCHEMA);
    expect(body.format).not.toEqual(THEME_MEMBERSHIP_JSON_SCHEMA);
    expect(body.options?.temperature).toBe(0);
  });

  it('rejects malformed model JSON without retrying', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'test-model',
        message: { content: '{"belongs":"yes"}' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 1, timeoutMs: 1000 });
    await expect(provider.classifyMembership(membershipInput({ itemTitle: 'x', themeLabel: 'x' }))).rejects.toBeInstanceOf(
      ThemeAIValidationError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces unavailability without throwing past retries as a generic crash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 0, timeoutMs: 1000 });
    await expect(
      provider.generateThemeLabel({
        currentLabel: 'tariff',
        memberTitles: ['Tariff plan'],
        memberRoles: ['creator'],
        creatorNames: ['Pakman'],
      }),
    ).rejects.toThrow(/ECONNREFUSED|unavailable|ollama/i);
  });

  it('bounds timeout retries instead of looping', async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 1, timeoutMs: 20 });
    await expect(
      provider.classifyMembership(
        membershipInput({
          itemTitle: 'City transit authority approves downtown rail extension',
          itemSummary: null,
          itemRole: 'reporting',
          itemSourceSystem: 'newswire',
          itemSourceName: 'Gazette',
          themeLabel: 'Downtown rail expansion',
          themeHeadline: null,
          themeMemberTitles: [],
          fingerprintOverlap: { sharedDistinctive: ['rail'], sharedPhrases: [], reasons: [] },
          itemFingerprint: extractThemeFingerprint({
            title: 'City transit authority approves downtown rail extension',
          }),
        }),
      ),
    ).rejects.toThrow(/timeout|abort|unavailable|ollama/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps classification timeout at THEME_AI_TIMEOUT_MS when startup timeout is longer', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => waitForAbort(init?.signal));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 0 });
    const pending = provider.classifyMembership(membershipInput());
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(themeMemoryEnv.THEME_AI_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow(/timeout|abort|unavailable|ollama/i);
    expect(settled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Ollama readiness probe', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    themeMemoryEnv.THEME_AI_TIMEOUT_MS = 1000;
    themeMemoryEnv.THEME_AI_STARTUP_TIMEOUT_MS = 180000;
  });

  it('lets slow model startup succeed inside THEME_AI_STARTUP_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
      if (String(url).includes('/api/tags')) return tagsOk();
      await delay(themeMemoryEnv.THEME_AI_TIMEOUT_MS + 2000, init?.signal);
      return generateOk();
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = probeOllama();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(themeMemoryEnv.THEME_AI_TIMEOUT_MS + 2000);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(generateBody(fetchMock).keep_alive).toBe('30m');
    expect(generateBody(fetchMock).prompt).toBe('Reply with JSON: {"ok":true}');
  });

  it('reports ollama_timeout when warm-up exceeds the startup timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
      if (String(url).includes('/api/tags')) return Promise.resolve(tagsOk());
      return waitForAbort(init?.signal);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = probeOllama();
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(themeMemoryEnv.THEME_AI_STARTUP_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toMatchObject({
      ok: false,
      reachable: true,
      modelConfigured: true,
      error: 'ollama_timeout',
    });
  });

  it('honors a configured THEME_AI_STARTUP_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    themeMemoryEnv.THEME_AI_STARTUP_TIMEOUT_MS = 80;
    const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
      if (String(url).includes('/api/tags')) return Promise.resolve(tagsOk());
      return waitForAbort(init?.signal);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = probeOllama();
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(79);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.error).toBe('ollama_timeout');
    expect(result.ok).toBe(false);
  });

  it('does not generate when the configured model is not installed', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/tags')) {
        return {
          ok: true,
          json: async () => ({ models: [{ name: 'other-model' }] }),
        };
      }
      return generateOk();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeOllama();
    expect(result.ok).toBe(false);
    expect(result.reachable).toBe(true);
    expect(result.error).toMatch(/configured model not installed/);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/generate'))).toBe(false);
  });
});

describe('Theme Memory structured output schemas', () => {
  it('requires boolean belongs, bounded numeric confidence, and a reasons array', () => {
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.type).toBe('object');
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.properties.belongs).toEqual({ type: 'boolean' });
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.properties.confidence).toEqual({
      type: 'number',
      minimum: 0,
      maximum: 1,
    });
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.properties.reasons.type).toBe('array');
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.properties.reasons.maxItems).toBe(THEME_MAX_REASONS);
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.properties.reasons.items.maxLength).toBe(THEME_MAX_REASON_CHARS);
    expect([...THEME_MEMBERSHIP_JSON_SCHEMA.required]).toEqual(['belongs', 'confidence', 'reasons']);
    expect(THEME_MEMBERSHIP_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it('uses a distinct label schema with bounded strings', () => {
    expect(THEME_LABEL_JSON_SCHEMA.type).toBe('object');
    expect([...THEME_LABEL_JSON_SCHEMA.required]).toEqual(['canonicalLabel', 'headline', 'summary']);
    expect(THEME_LABEL_JSON_SCHEMA.properties.canonicalLabel.type).toBe('string');
    expect(THEME_LABEL_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(THEME_LABEL_JSON_SCHEMA).not.toEqual(THEME_MEMBERSHIP_JSON_SCHEMA);
  });

  it('does not send keep_alive on Theme Memory chat requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'test-model',
        message: {
          content: JSON.stringify({ belongs: true, confidence: 0.8, reasons: [] }),
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOllamaThemeAIProvider({
      model: 'test-model',
      timeoutMs: 1000,
      retries: 0,
    });
    await provider.classifyMembership(membershipInput());
    expect(chatBody(fetchMock).keep_alive).toBeUndefined();
  });
});

describe('Ollama chat transport timeouts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extends undici wait past the default 300s body timeout', () => {
    expect(ollamaFetchTimeoutMs(900_000)).toBe(905_000);
    expect(ollamaFetchTimeoutMs(300_000)).toBeGreaterThan(300_000);
  });

  it('attaches a dispatcher and optional keep_alive to long chat requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ model: 'test-model', message: { content: '{"notes":[]}' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await ollamaChatJson({
      messages: [{ role: 'user', content: 'extract' }],
      format: { type: 'object' },
      timeoutMs: 900_000,
      baseUrl: 'http://127.0.0.1:11434',
      model: 'test-model',
      retries: 0,
      keepAlive: '30m',
    });
    const init = chatInit(fetchMock);
    expect(init.dispatcher).toEqual(expect.objectContaining({ close: expect.any(Function) }));
    expect(chatBody(fetchMock).keep_alive).toBe('30m');
  });
});
