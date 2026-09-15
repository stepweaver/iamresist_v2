import 'server-only';

import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { createDeterministicThemeAIProvider } from '@/lib/themeMemory/ai/deterministic';
import { createOllamaThemeAIProvider } from '@/lib/themeMemory/ai/ollama';
import type { ThemeAIProvider } from '@/lib/themeMemory/ai/types';
import { ThemeAIUnavailableError } from '@/lib/themeMemory/ai/types';

export function createThemeAIProvider(override?: ThemeAIProvider | null): ThemeAIProvider {
  if (override) return override;

  const name = String(themeMemoryEnv.THEME_AI_PROVIDER || 'none').toLowerCase();
  if (name === 'none' || name === 'deterministic' || name === '') {
    return createDeterministicThemeAIProvider();
  }
  if (name === 'ollama') {
    try {
      return createOllamaThemeAIProvider();
    } catch (error) {
      console.warn(
        '[theme-memory-ai] ollama provider unavailable, using deterministic fallback',
        error instanceof Error ? error.message : error,
      );
      return createDeterministicThemeAIProvider();
    }
  }

  console.warn(`[theme-memory-ai] unknown THEME_AI_PROVIDER=${name}, using deterministic fallback`);
  return createDeterministicThemeAIProvider();
}

export function describeThemeAIProvider(provider: ThemeAIProvider): { provider: string; model: string | null } {
  return { provider: provider.name, model: provider.model };
}

export { ThemeAIUnavailableError };
