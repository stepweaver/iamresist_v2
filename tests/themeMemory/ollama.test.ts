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
import { extractThemeFingerprint } from '@/lib/themeMemory/features';

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
    const decision = await provider.classifyMembership({
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
    });
    expect(decision.belongs).toBe(true);
    expect(decision.confidence).toBe(0.8);
  });

  it('rejects malformed model JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          model: 'test-model',
          message: { content: '{"belongs":"yes"}' },
        }),
      })),
    );
    const provider = createOllamaThemeAIProvider({ model: 'test-model', retries: 0, timeoutMs: 1000 });
    await expect(
      provider.classifyMembership({
        itemTitle: 'x',
        itemSummary: null,
        itemRole: 'creator',
        itemSourceSystem: 'voice',
        itemSourceName: 'Pakman',
        themeLabel: 'x',
        themeHeadline: null,
        themeMemberTitles: [],
        fingerprintOverlap: { sharedDistinctive: [], sharedPhrases: [], reasons: [] },
        itemFingerprint: extractThemeFingerprint({ title: 'x' }),
      }),
    ).rejects.toBeInstanceOf(ThemeAIValidationError);
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
      provider.classifyMembership({
        itemTitle: 'City transit authority approves downtown rail extension',
        itemSummary: null,
        itemRole: 'reporting',
        itemSourceSystem: 'newswire',
        itemSourceName: 'Gazette',
        themeLabel: 'Downtown rail expansion',
        themeHeadline: null,
        themeMemberTitles: [],
        fingerprintOverlap: { sharedDistinctive: ['rail'], sharedPhrases: [], reasons: [] },
        itemFingerprint: extractThemeFingerprint({ title: 'City transit authority approves downtown rail extension' }),
      }),
    ).rejects.toThrow(/timeout|abort|unavailable|ollama/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
