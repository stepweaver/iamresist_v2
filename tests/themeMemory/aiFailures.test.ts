import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyThemeAIFailure, emptyThemeAIFailureCategories, recordThemeAIFailure } from '@/lib/themeMemory/ai/failures';
import { ThemeAIUnavailableError, ThemeAIValidationError } from '@/lib/themeMemory/ai/types';

describe('Theme Memory AI failure diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('categorizes validation failures using ThemeAIValidationError codes', () => {
    const classified = classifyThemeAIFailure(new ThemeAIValidationError('confidence_not_number'));
    expect(classified).toEqual({ category: 'validation', reason: 'confidence_not_number' });
  });

  it('categorizes timeout and unavailable failures separately from validation', () => {
    expect(classifyThemeAIFailure(new ThemeAIUnavailableError('ollama_timeout', 'ollama_timeout'))).toEqual({
      category: 'unavailable',
      reason: 'ollama_timeout',
    });
    expect(classifyThemeAIFailure(new ThemeAIUnavailableError('ollama_http_503:busy', 'ollama_http_503'))).toEqual({
      category: 'unavailable',
      reason: 'ollama_http_503',
    });
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    expect(classifyThemeAIFailure(abort)).toEqual({ category: 'unavailable', reason: 'ollama_timeout' });
  });

  it('does not put source text or secrets into failure diagnostics', () => {
    const secretError = new Error(
      'API_KEY=sk-secret-123 title: City transit authority approves downtown rail extension',
    );
    const classified = classifyThemeAIFailure(secretError);
    expect(classified).toEqual({ category: 'unexpected', reason: 'unexpected_error' });
    const serialized = JSON.stringify(classified);
    expect(serialized).not.toMatch(/sk-secret-123|API_KEY|City transit|downtown rail/i);
  });

  it('records bounded reason counts without logging content bodies', () => {
    const warns: unknown[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warns.push(args);
    });
    const diagnostics = {
      aiFailures: 0,
      aiFailureReasons: {} as Record<string, number>,
      aiFailureCategories: emptyThemeAIFailureCategories(),
    };
    recordThemeAIFailure(
      diagnostics,
      new ThemeAIValidationError('reasons_too_many'),
      '[theme-memory] AI membership check failed',
    );
    recordThemeAIFailure(
      diagnostics,
      new ThemeAIUnavailableError('ollama_timeout', 'ollama_timeout'),
      '[theme-memory] AI membership check failed',
    );
    expect(diagnostics.aiFailures).toBe(2);
    expect(diagnostics.aiFailureReasons).toEqual({
      reasons_too_many: 1,
      ollama_timeout: 1,
    });
    expect(diagnostics.aiFailureCategories).toEqual({
      validation: 1,
      unavailable: 1,
      unexpected: 0,
    });
    const serialized = JSON.stringify(warns);
    expect(serialized).toContain('validation');
    expect(serialized).toContain('reasons_too_many');
    expect(serialized).toContain('unavailable');
    expect(serialized).toContain('ollama_timeout');
    expect(serialized).not.toMatch(/<source>|prompt|sk-|itemTitle|summary:/i);
    expect(warns).toEqual([
      ['[theme-memory] AI membership check failed', { category: 'validation', reason: 'reasons_too_many' }],
      ['[theme-memory] AI membership check failed', { category: 'unavailable', reason: 'ollama_timeout' }],
    ]);
  });
});
