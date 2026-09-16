import 'server-only';

import { intelDbConfigured } from '@/lib/intel/db';
import { createThemeAIProvider } from '@/lib/themeMemory/ai/provider';
import type { ThemeAIProvider } from '@/lib/themeMemory/ai/types';
import { ingestThemeMemorySources } from '@/lib/themeMemory/ingest';
import { processThemeMemory, emptyThemeProcessDiagnostics, type ThemeProcessResult } from '@/lib/themeMemory/process';
import { getThemeCandidateItems } from '@/lib/themeMemory/query';
import { createSupabaseThemeStore } from '@/lib/themeMemory/themesDb';
import { THEME_PROCESS_WINDOW_DAYS } from '@/lib/themeMemory/constants';
import { resolveThemeMemoryWindow } from '@/lib/themeMemory/windows';

export async function runThemeMemoryProcess(opts: {
  now?: Date | string;
  days?: number;
  ingestFirst?: boolean;
  refreshLabels?: boolean;
  ai?: ThemeAIProvider | null;
} = {}): Promise<ThemeProcessResult & { skipped?: string; ingest?: unknown }> {
  const finishedAt = new Date().toISOString();
  if (!intelDbConfigured()) {
    return {
      ok: false,
      overallStatus: 'failed',
      finishedAt,
      skipped: 'Supabase not configured',
      window: { start: null, end: null },
      diagnostics: emptyThemeProcessDiagnostics(),
    };
  }

  let ingest: unknown;
  if (opts.ingestFirst) {
    ingest = await ingestThemeMemorySources({ includeDiagnostics: false, now: opts.now });
  }

  const window = resolveThemeMemoryWindow({
    days: opts.days ?? THEME_PROCESS_WINDOW_DAYS,
    now: opts.now,
  });
  const items = await getThemeCandidateItems({
    start: window.start,
    end: window.end,
    now: opts.now,
  });
  const store = createSupabaseThemeStore({ now: opts.now });
  const ai = createThemeAIProvider(opts.ai);
  const result = await processThemeMemory({
    items,
    store,
    ai,
    now: opts.now ?? finishedAt,
    refreshLabels: opts.refreshLabels,
    windowStart: window.start,
    windowEnd: window.end,
  });

  return ingest ? { ...result, ingest } : result;
}
