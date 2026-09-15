import 'server-only';

import { intelDbConfigured } from '@/lib/intel/db';
import { createThemeAIProvider } from '@/lib/themeMemory/ai/provider';
import type { ThemeAIProvider } from '@/lib/themeMemory/ai/types';
import { ingestThemeMemorySources } from '@/lib/themeMemory/ingest';
import { processThemeMemory, type ThemeProcessResult } from '@/lib/themeMemory/process';
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
      diagnostics: {
        creatorItemsConsidered: 0,
        creatorItemsSkippedUnchanged: 0,
        newswireItemsConsidered: 0,
        intelItemsConsidered: 0,
        themesCreated: 0,
        themesUpdated: 0,
        deterministicMemberships: 0,
        aiMembershipChecks: 0,
        aiMembershipsAccepted: 0,
        aiMembershipsRejected: 0,
        aiFailures: 0,
        aiUnavailable: false,
        incompleteClassification: false,
        newswireMembersAttached: 0,
        intelMembersAttached: 0,
        primaryMembersAttached: 0,
        specialistMembersAttached: 0,
        labelsGenerated: 0,
        dailySignalsWritten: 0,
        themesByLifecycle: { new: 0, developing: 0, persistent: 0, cooling: 0, resurging: 0, dormant: 0 },
      },
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
