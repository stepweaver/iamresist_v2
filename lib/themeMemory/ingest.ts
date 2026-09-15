import 'server-only';

import { intelDbConfigured } from '@/lib/intel/db';
import {
  collectNewswireThemeCandidates,
  collectVoiceThemeCandidates,
} from '@/lib/themeMemory/collect';
import { upsertThemeObservations } from '@/lib/themeMemory/db';
import { getThemeMemoryDiagnostics, type ThemeMemoryDiagnostics } from '@/lib/themeMemory/diagnostics';
import { THEME_MEMORY_ITEMS_PER_VOICE } from '@/lib/themeMemory/types';

export type ThemeMemoryIngestChannelSummary = {
  sourcesAttempted?: number;
  sourcesSucceeded?: number;
  sourcesFailed?: number;
  sourcesEmpty?: number;
  sourcesRepresented?: number;
  itemsSeen: number;
  observationsTouched: number;
  failures?: Array<{ slug: string; reason: string }>;
  error?: string;
};

export type ThemeMemoryIngestResult = {
  ok: boolean;
  overallStatus: 'success' | 'partial' | 'failed';
  finishedAt: string;
  skipped?: string;
  voices: ThemeMemoryIngestChannelSummary;
  newswire: ThemeMemoryIngestChannelSummary;
  perVoiceLimit: number;
  diagnostics?: ThemeMemoryDiagnostics;
};

function emptyChannel(error?: string): ThemeMemoryIngestChannelSummary {
  return {
    sourcesAttempted: 0,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    itemsSeen: 0,
    observationsTouched: 0,
    ...(error ? { error } : {}),
  };
}

function overallStatus(voicesFailed: boolean, newswireFailed: boolean, anyTouched: boolean, anySeen: boolean): ThemeMemoryIngestResult['overallStatus'] {
  if (voicesFailed && newswireFailed) return 'failed';
  if (voicesFailed || newswireFailed) return 'partial';
  if (!anyTouched && anySeen) return 'partial';
  return 'success';
}

/**
 * Persist favorite Voices + current Newswire into intel.theme_observations.
 * Intel source_items are not copied; they are queried through the candidate adapter.
 *
 * Safe to rerun. One failing creator feed does not discard the others.
 */
export async function ingestThemeMemorySources(opts: {
  includeDiagnostics?: boolean;
  perVoiceLimit?: number;
  now?: Date | string;
} = {}): Promise<ThemeMemoryIngestResult> {
  const finishedAt = new Date().toISOString();
  const perVoiceLimit = Math.max(
    1,
    Math.min(50, Number(opts.perVoiceLimit) || THEME_MEMORY_ITEMS_PER_VOICE),
  );

  if (!intelDbConfigured()) {
    return {
      ok: false,
      overallStatus: 'failed',
      finishedAt,
      skipped: 'Supabase not configured',
      voices: emptyChannel('Supabase not configured'),
      newswire: emptyChannel('Supabase not configured'),
      perVoiceLimit,
    };
  }

  let voices = emptyChannel();
  let voicesFailed = false;
  try {
    const collected = await collectVoiceThemeCandidates({
      perVoiceLimit,
      now: opts.now,
    });
    const observationsTouched = await upsertThemeObservations(collected.candidates);
    voices = {
      sourcesAttempted: collected.sourcesAttempted,
      sourcesSucceeded: collected.sourcesSucceeded,
      sourcesFailed: collected.sourcesFailed,
      sourcesEmpty: collected.sourcesEmpty,
      itemsSeen: collected.itemsSeen,
      observationsTouched,
      failures: collected.failures,
    };
    if (collected.sourcesAttempted > 0 && collected.sourcesSucceeded === 0) {
      voicesFailed = true;
    }
  } catch (error) {
    voicesFailed = true;
    voices = emptyChannel(error instanceof Error ? error.message : String(error));
  }

  let newswire = emptyChannel();
  let newswireFailed = false;
  try {
    const collected = await collectNewswireThemeCandidates({ now: opts.now });
    const observationsTouched = await upsertThemeObservations(collected.candidates);
    newswire = {
      sourcesRepresented: collected.sourcesRepresented,
      itemsSeen: collected.itemsSeen,
      observationsTouched,
    };
  } catch (error) {
    newswireFailed = true;
    newswire = emptyChannel(error instanceof Error ? error.message : String(error));
  }

  const anyTouched = (voices.observationsTouched || 0) + (newswire.observationsTouched || 0) > 0;
  const anySeen = (voices.itemsSeen || 0) + (newswire.itemsSeen || 0) > 0;
  const status = overallStatus(voicesFailed, newswireFailed, anyTouched, anySeen);

  const result: ThemeMemoryIngestResult = {
    ok: status !== 'failed',
    overallStatus: status,
    finishedAt,
    voices,
    newswire,
    perVoiceLimit,
  };

  if (opts.includeDiagnostics !== false) {
    try {
      result.diagnostics = await getThemeMemoryDiagnostics({ now: opts.now });
    } catch (error) {
      result.diagnostics = undefined;
      console.warn('[theme-memory] diagnostics failed:', error);
    }
  }

  return result;
}
