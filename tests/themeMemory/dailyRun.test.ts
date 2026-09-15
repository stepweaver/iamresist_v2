import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatThemeMemoryDailySummary,
  runThemeMemoryDaily,
  themeMemoryDailyExitCode,
} from '@/lib/themeMemory/dailyRun';
import type { ThemeMemoryIngestResult } from '@/lib/themeMemory/ingest';
import type { ThemeProcessResult } from '@/lib/themeMemory/process';
import type { ThemeMemoryDiagnostics } from '@/lib/themeMemory/diagnostics';
import { acquireThemeMemoryRunLock } from '@/lib/themeMemory/runLock';

function ingestOk(): ThemeMemoryIngestResult {
  return {
    ok: true,
    overallStatus: 'success',
    finishedAt: '2026-09-15T16:00:00.000Z',
    voices: {
      sourcesAttempted: 15,
      sourcesSucceeded: 15,
      sourcesFailed: 0,
      itemsSeen: 230,
      observationsTouched: 12,
    },
    newswire: {
      sourcesRepresented: 7,
      itemsSeen: 131,
      observationsTouched: 21,
    },
    perVoiceLimit: 25,
  };
}

function processOk(): ThemeProcessResult {
  return {
    ok: true,
    overallStatus: 'success',
    finishedAt: '2026-09-15T16:00:00.000Z',
    window: { start: '2026-09-01T00:00:00.000Z', end: '2026-09-15T16:00:00.000Z' },
    diagnostics: {
      creatorItemsConsidered: 37,
      creatorItemsSkippedUnchanged: 0,
      newswireItemsConsidered: 20,
      intelItemsConsidered: 10,
      themesCreated: 2,
      themesUpdated: 9,
      deterministicMemberships: 14,
      aiMembershipChecks: 18,
      aiMembershipsAccepted: 7,
      aiMembershipsRejected: 11,
      aiFailures: 0,
      aiUnavailable: false,
      incompleteClassification: false,
      newswireMembersAttached: 16,
      intelMembersAttached: 4,
      primaryMembersAttached: 0,
      specialistMembersAttached: 0,
      labelsGenerated: 4,
      dailySignalsWritten: 20,
      themesByLifecycle: { new: 10, developing: 4, persistent: 1, cooling: 3, resurging: 0, dormant: 2 },
    },
  };
}

function diagnosticsOk(): ThemeMemoryDiagnostics {
  return {
    observations: {
      total: 361,
      oldestObservedAt: '2026-03-04T00:00:00.000Z',
      newestObservedAt: '2026-09-15T00:00:00.000Z',
      bySourceSystem: { voice: 230, newswire: 131 },
      bySource: [],
    },
    windows: {
      1: { observations: 10, intel: 0, combined: 10 },
      3: { observations: 20, intel: 0, combined: 20 },
      7: { observations: 40, intel: 0, combined: 40 },
      14: { observations: 80, intel: 0, combined: 80 },
      30: { observations: 100, intel: 0, combined: 100 },
    },
    generatedAt: '2026-09-15T16:00:00.000Z',
  };
}

describe('Theme Memory daily runner', () => {
  it('prints a concise success summary and exits 0', async () => {
    const result = await runThemeMemoryDaily({
      skipLock: true,
      skipValidate: true,
      ingestFn: async () => ingestOk(),
      processFn: async () => processOk(),
      diagnosticsFn: async () => diagnosticsOk(),
      listThemesFn: async () => [],
      listMembershipsFn: async () => [],
    });
    expect(result.ok).toBe(true);
    expect(themeMemoryDailyExitCode(result)).toBe(0);
    const summary = formatThemeMemoryDailySummary(result);
    expect(summary).toContain('Theme Memory Daily');
    expect(summary).toContain('Voices: 15/15 feeds, 230 seen, 12 new');
    expect(summary).toContain('AI checks: 18');
    expect(summary).toContain('AI accepted: 7');
    expect(summary).toMatch(/mode: (off|shadow|active)/);
  });

  it('returns a non-zero status when startup validation fails', async () => {
    const result = await runThemeMemoryDaily({
      skipLock: true,
      validateFn: async () => ({
        ok: false,
        errors: ['Supabase is not configured'],
        warnings: [],
        provider: 'ollama',
        model: 'gemma3:4b',
        rankingMode: 'shadow',
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.overallStatus).toBe('failed');
    expect(themeMemoryDailyExitCode(result)).toBe(1);
    expect(result.skipped).toContain('Supabase is not configured');
  });

  it('refuses a second overlapping run while the lock is held', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'theme-memory-daily-'));
    const lockPath = path.join(dir, 'daily.lock');
    const previous = process.env.THEME_MEMORY_LOCK_FILE;
    process.env.THEME_MEMORY_LOCK_FILE = lockPath;
    const held = acquireThemeMemoryRunLock(lockPath);
    try {
      const result = await runThemeMemoryDaily({
        skipValidate: true,
        ingestFn: async () => ingestOk(),
        processFn: async () => processOk(),
        diagnosticsFn: async () => diagnosticsOk(),
        listThemesFn: async () => [],
        listMembershipsFn: async () => [],
      });
      expect(result.ok).toBe(false);
      expect(themeMemoryDailyExitCode(result)).toBe(1);
      expect(result.skipped).toMatch(/already in progress/i);
    } finally {
      held.release();
      if (previous == null) delete process.env.THEME_MEMORY_LOCK_FILE;
      else process.env.THEME_MEMORY_LOCK_FILE = previous;
    }
  });
});
