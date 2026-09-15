import { notionEnv } from '@/lib/env/notion';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { intelDbConfigured } from '@/lib/intel/db';
import { resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import { probeOllama } from '@/lib/themeMemory/ai/ollama';
import { pingThemeMemorySchema } from '@/lib/themeMemory/themesDb';

export type ThemeMemoryStartupCheck = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  provider: string;
  model: string | null;
  rankingMode: string;
  ollama?: {
    reachable: boolean;
    error?: string;
  };
};

export async function validateThemeMemoryRuntime(): Promise<ThemeMemoryStartupCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const provider = String(themeMemoryEnv.THEME_AI_PROVIDER || 'none').toLowerCase();
  const model = themeMemoryEnv.OLLAMA_MODEL || null;
  const rankingMode = resolveThemeRankingMode();

  if (!intelDbConfigured()) {
    errors.push('Supabase is not configured (SUPABASE_URL / POSTGRES_SUPABASE_URL and service role key)');
  } else {
    const ping = await pingThemeMemorySchema();
    if (!ping.ok) {
      errors.push(`Theme Memory schema is not reachable: ${ping.error || 'unknown error'}`);
    }
  }

  if (!notionEnv.NOTION_API_KEY || !notionEnv.NOTION_VOICES_DB_ID) {
    errors.push('Notion Voices configuration is missing (NOTION_API_KEY and NOTION_VOICES_DB_ID)');
  }

  let ollama: ThemeMemoryStartupCheck['ollama'];
  if (provider === 'ollama') {
    const probe = await probeOllama();
    ollama = { reachable: probe.reachable, error: probe.error };
    if (!probe.ok) {
      errors.push(`Ollama is not ready: ${probe.error || 'unknown error'}`);
    }
  } else if (provider !== 'none' && provider !== 'deterministic') {
    warnings.push(`Unknown THEME_AI_PROVIDER=${provider}; daily run will use the deterministic fallback`);
  }

  if (rankingMode === 'active') {
    warnings.push('THEME_RANKING_MODE=active; Theme Memory contribution can change live scores');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    provider,
    model: provider === 'ollama' ? model : provider === 'none' || provider === 'deterministic' ? null : model,
    rankingMode,
    ollama,
  };
}
