import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env/themeMemory', () => ({
  themeMemoryEnv: {
    THEME_AI_PROVIDER: 'ollama',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'test-model',
    THEME_AI_TIMEOUT_MS: 1000,
    THEME_AI_MAX_RETRIES: 1,
  },
}));

import { createOllamaThemeAIProvider } from '@/lib/themeMemory/ai/ollama';
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
  const init = fetchMock.mock.calls[call]?.[1] as { body?: string };
  return JSON.parse(String(init?.body || '{}')) as {
    format?: unknown;
    options?: { temperature?: number };
    messages?: Array<{ role: string; content: string }>;
  };
}

describe('Ollama Theme AI provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
