import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import { ingestThemeMemorySources, type ThemeMemoryIngestResult } from '@/lib/themeMemory/ingest';
import { getThemeMemoryDiagnostics, type ThemeMemoryDiagnostics } from '@/lib/themeMemory/diagnostics';
import { findLikelyDuplicateThemes, type LikelyDuplicateTheme } from '@/lib/themeMemory/duplicates';
import { runThemeMemoryProcess } from '@/lib/themeMemory/processRunner';
import type { ThemeProcessDiagnostics, ThemeProcessResult } from '@/lib/themeMemory/process';
import { emptyThemeProcessDiagnostics } from '@/lib/themeMemory/process';
import { acquireThemeMemoryRunLock, ThemeMemoryLockBusyError } from '@/lib/themeMemory/runLock';
import { validateThemeMemoryRuntime, type ThemeMemoryStartupCheck } from '@/lib/themeMemory/startup';
import { createSupabaseThemeStore } from '@/lib/themeMemory/themesDb';
import type { ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

export type ThemeMemoryDailyResult = {
  ok: boolean;
  overallStatus: 'success' | 'partial' | 'failed';
  finishedAt: string;
  skipped?: string;
  startup: ThemeMemoryStartupCheck | null;
  ingest: ThemeMemoryIngestResult | null;
  process: ThemeProcessResult | null;
  diagnostics: ThemeMemoryDiagnostics | null;
  duplicateThemeCandidates: LikelyDuplicateTheme[];
  rankingMode: string;
  aiProvider: string;
  aiModel: string | null;
};

export type ThemeMemoryDailyDeps = {
  ingestFn?: typeof ingestThemeMemorySources;
  processFn?: typeof runThemeMemoryProcess;
  validateFn?: typeof validateThemeMemoryRuntime;
  diagnosticsFn?: typeof getThemeMemoryDiagnostics;
  listThemesFn?: () => Promise<ThemeRecord[]>;
  listMembershipsFn?: () => Promise<ThemeMembershipRecord[]>;
};

function formatFailureReasons(reasons: Record<string, number>): string {
  return Object.entries(reasons)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ');
}

function formatFailureCategories(categories: ThemeProcessDiagnostics['aiFailureCategories']): string {
  return (['validation', 'unavailable', 'unexpected'] as const)
    .filter((key) => categories[key] > 0)
    .map((key) => `${key}=${categories[key]}`)
    .join(', ');
}

function failedResult(input: {
  finishedAt: string;
  skipped: string;
  startup?: ThemeMemoryStartupCheck | null;
}): ThemeMemoryDailyResult {
  return {
    ok: false,
    overallStatus: 'failed',
    finishedAt: input.finishedAt,
    skipped: input.skipped,
    startup: input.startup ?? null,
    ingest: null,
    process: null,
    diagnostics: null,
    duplicateThemeCandidates: [],
    rankingMode: resolveThemeRankingMode(),
    aiProvider: themeMemoryEnv.THEME_AI_PROVIDER || 'none',
    aiModel: themeMemoryEnv.OLLAMA_MODEL || null,
  };
}

export function themeMemoryDailyExitCode(result: ThemeMemoryDailyResult): number {
  return result.ok && result.overallStatus !== 'failed' ? 0 : 1;
}

export function formatThemeMemoryDailySummary(result: ThemeMemoryDailyResult): string {
  const ingest = result.ingest;
  const d = result.process?.diagnostics ?? emptyThemeProcessDiagnostics();
  const lifecycle = d.themesByLifecycle;
  const voicesAttempted = ingest?.voices.sourcesAttempted ?? 0;
  const voicesOk = ingest?.voices.sourcesSucceeded ?? 0;
  const failureCategories = d.aiFailures > 0 ? formatFailureCategories(d.aiFailureCategories) : '';
  const failureReasons = d.aiFailures > 0 ? formatFailureReasons(d.aiFailureReasons) : '';
  const lines = [
    'Theme Memory Daily',
    '------------------',
    'Ingest:',
    `  Voices: ${voicesOk}/${voicesAttempted} feeds, ${ingest?.voices.itemsSeen ?? 0} seen, ${ingest?.voices.observationsTouched ?? 0} new`,
    `  Newswire: ${ingest?.newswire.sourcesRepresented ?? 0} sources, ${ingest?.newswire.itemsSeen ?? 0} seen, ${ingest?.newswire.observationsTouched ?? 0} new`,
    '',
    'Process:',
    `  Creator observations considered: ${d.creatorItemsConsidered}`,
    `  Newswire candidates considered: ${d.newswireItemsConsidered}`,
    `  Intel candidates considered: ${d.intelItemsConsidered}`,
    `  Intel available in process window: ${d.intelAvailableInWindow}`,
    `  Intel candidate limit hit: ${d.intelCandidateLimitHit ? 'yes' : 'no'}`,
    `  Stale analyses re-evaluated: ${d.staleAnalysesReevaluated}`,
    `  Prior no_match re-evaluated: ${d.noMatchAnalysesReevaluated}`,
    `  Themes created: ${d.themesCreated}`,
    `  Themes updated: ${d.themesUpdated}`,
    `  Deterministic memberships: ${d.deterministicMemberships}`,
    `  AI checks: ${d.aiMembershipChecks}`,
    `  AI accepted: ${d.aiMembershipsAccepted}`,
    `  AI rejected: ${d.aiMembershipsRejected}`,
    `  AI failures: ${d.aiFailures}`,
    ...(failureCategories ? [`  AI failure categories: ${failureCategories}`] : []),
    ...(failureReasons ? [`  AI failure reasons: ${failureReasons}`] : []),
    `  Newswire attached: ${d.newswireMembersAttached}`,
    `  Intel attached: ${d.intelMembersAttached}`,
    '',
    'Lifecycle:',
    `  new: ${lifecycle.new}`,
    `  developing: ${lifecycle.developing}`,
    `  persistent: ${lifecycle.persistent}`,
    `  cooling: ${lifecycle.cooling}`,
    `  resurging: ${lifecycle.resurging}`,
    `  dormant: ${lifecycle.dormant}`,
    '',
    'Ranking:',
    `  mode: ${result.rankingMode}`,
    `  provider: ${result.aiProvider}`,
    `  model: ${result.aiModel || 'none'}`,
    `  duplicate-theme candidates: ${result.duplicateThemeCandidates.length}`,
  ];
  if (result.skipped) {
    lines.push('', `Status: ${result.overallStatus} (${result.skipped})`);
  } else {
    lines.push('', `Status: ${result.overallStatus}`);
  }
  return lines.join('\n');
}

export async function runThemeMemoryDaily(
  opts: {
    now?: Date | string;
    refreshLabels?: boolean;
    skipLock?: boolean;
    skipValidate?: boolean;
  } & ThemeMemoryDailyDeps = {},
): Promise<ThemeMemoryDailyResult> {
  const finishedAt = new Date().toISOString();
  let lock: { release: () => void } | null = null;
  try {
    if (!opts.skipLock) {
      lock = acquireThemeMemoryRunLock();
    }

    const validateFn = opts.validateFn || validateThemeMemoryRuntime;
    const startup = opts.skipValidate ? null : await validateFn();
    if (startup && !startup.ok) {
      return failedResult({
        finishedAt,
        skipped: startup.errors.join('; '),
        startup,
      });
    }

    const ingestFn = opts.ingestFn || ingestThemeMemorySources;
    const processFn = opts.processFn || runThemeMemoryProcess;
    const ingest = await ingestFn({ includeDiagnostics: true, now: opts.now });
    const processed = await processFn({
      now: opts.now,
      ingestFirst: false,
      refreshLabels: opts.refreshLabels,
    });
    const diagnosticsFn = opts.diagnosticsFn || getThemeMemoryDiagnostics;
    const diagnostics = await diagnosticsFn({ now: opts.now });

    let duplicateThemeCandidates: LikelyDuplicateTheme[] = [];
    try {
      const listThemes = opts.listThemesFn || (async () => createSupabaseThemeStore({ now: opts.now }).listThemes());
      const listMemberships =
        opts.listMembershipsFn || (async () => createSupabaseThemeStore({ now: opts.now }).listMemberships());
      const [themes, memberships] = await Promise.all([listThemes(), listMemberships()]);
      duplicateThemeCandidates = findLikelyDuplicateThemes(themes, memberships);
    } catch {
      duplicateThemeCandidates = [];
    }

    const overallStatus =
      processed.overallStatus === 'failed' || ingest.overallStatus === 'failed'
        ? 'failed'
        : processed.overallStatus === 'partial' || ingest.overallStatus === 'partial'
          ? 'partial'
          : 'success';

    return {
      ok: overallStatus !== 'failed',
      overallStatus,
      finishedAt: processed.finishedAt || finishedAt,
      startup,
      ingest,
      process: processed,
      diagnostics,
      duplicateThemeCandidates,
      rankingMode: resolveThemeRankingMode(),
      aiProvider: themeMemoryEnv.THEME_AI_PROVIDER || 'none',
      aiModel: themeMemoryEnv.OLLAMA_MODEL || null,
    };
  } catch (error) {
    if (error instanceof ThemeMemoryLockBusyError) {
      return failedResult({ finishedAt, skipped: error.message });
    }
    return failedResult({
      finishedAt,
      skipped: error instanceof Error ? error.message : String(error),
    });
  } finally {
    lock?.release();
  }
}
