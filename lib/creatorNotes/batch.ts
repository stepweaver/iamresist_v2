import {
  CREATOR_NOTE_KINDS,
  CREATOR_NOTES_BATCH_DEFAULT_LIMIT,
  CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS,
} from '@/lib/creatorNotes/constants';
import { createSupabaseCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  assertCreatorNotesAiConfigured,
  resolveCreatorNotesAiConfig,
  warmupCreatorNotesAi,
  type CreatorNotesAiConfig,
} from '@/lib/creatorNotes/extract';
import { emptyKindCounts } from '@/lib/creatorNotes/postprocess';
import { resolvedCreatorSourceFromVoiceItem, type CreatorVoiceCatalogItem } from '@/lib/creatorNotes/resolveSource';
import { acquireCreatorNotesRunLock, CreatorNotesLockBusyError } from '@/lib/creatorNotes/runLock';
import {
  runCreatorNoteExtraction,
  type CreatorNotesExtractChunkFn,
  type CreatorNotesRunDeps,
} from '@/lib/creatorNotes/run';
import { loadCreatorNotesBatchCandidates } from '@/lib/creatorNotes/select';
import { fetchCreatorTranscript, type FetchedCreatorTranscript } from '@/lib/creatorNotes/transcriptProvider';
import type {
  CreatorNotesCaptionFailureReason,
  CreatorNotesBatchArgs,
  CreatorNotesBatchItemResult,
  CreatorNotesBatchResult,
  CreatorNotesBatchSummary,
  CreatorNotesCreatorDistributionRow,
  CreatorNotesRunResult,
  CreatorNotesStore,
} from '@/lib/creatorNotes/types';
import { intelDbConfigured } from '@/lib/intel/db';

export type CreatorNotesBatchDeps = {
  listVoiceItems?: () => Promise<CreatorVoiceCatalogItem[]>;
  fetchTranscript?: (
    source: ReturnType<typeof resolvedCreatorSourceFromVoiceItem>,
  ) => Promise<FetchedCreatorTranscript>;
  extractChunk?: CreatorNotesExtractChunkFn;
  store?: CreatorNotesStore;
  now?: () => Date;
  id?: () => string;
  aiConfig?: CreatorNotesAiConfig;
  log?: CreatorNotesRunDeps['log'];
  lockPath?: string;
  skipLock?: boolean;
  skipWarmup?: boolean;
  warmup?: () => Promise<void>;
  youtubeBatchEnabled?: boolean;
};

function clipError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

export function classifyCaptionFailure(error: unknown): CreatorNotesCaptionFailureReason | null {
  const message = clipError(error).toLowerCase();
  if (message.includes('no caption tracks')) return 'no_captions';
  if (message.includes('malformed captions')) return 'malformed_captions';
  if (message.includes('empty transcript') || message.includes('normalization produced no usable')) {
    return 'empty_transcript';
  }
  if (
    message.includes('caption request failed') ||
    message.includes('malformed youtube url')
  ) {
    return 'fetch_error';
  }
  return null;
}

function emptyCaptionFailures(): Record<CreatorNotesCaptionFailureReason, number> {
  return {
    no_captions: 0,
    fetch_error: 0,
    malformed_captions: 0,
    empty_transcript: 0,
  };
}

function emptySummary(dryRun: boolean): CreatorNotesBatchSummary {
  return {
    candidateVoiceItems: 0,
    processed: 0,
    alreadyProcessed: 0,
    noCaptions: 0,
    failed: 0,
    captionFailures: emptyCaptionFailures(),
    transcripts: {
      captionTracksFetched: 0,
      charactersProcessed: 0,
      chunks: 0,
    },
    notes: { total: 0, ...emptyKindCounts() },
    evidence: {
      notesWithSourceEvidence: 0,
      notesWithoutSourceEvidence: 0,
      exactQuotesVerified: 0,
      exactQuotesRejected: 0,
    },
    persistence: {
      dryRun,
      runsCreated: 0,
      notesWritten: 0,
    },
    creators: [],
    duration: {
      totalMs: 0,
      averagePerItemMs: null,
    },
  };
}

function creatorKey(item: { creatorId?: string | null; creatorName?: string | null }): string {
  return String(item.creatorId || item.creatorName || 'unknown').trim().toLowerCase() || 'unknown';
}

function buildCreatorDistribution(items: CreatorNotesBatchItemResult[]): CreatorNotesCreatorDistributionRow[] {
  const byKey = new Map<string, CreatorNotesCreatorDistributionRow>();
  for (const item of items) {
    const key = creatorKey(item);
    const existing = byKey.get(key) || {
      creatorId: item.creatorId,
      creatorName: item.creatorName,
      items: 0,
      notes: 0,
    };
    existing.items += 1;
    existing.notes += item.notes;
    if (!existing.creatorName && item.creatorName) existing.creatorName = item.creatorName;
    if (!existing.creatorId && item.creatorId) existing.creatorId = item.creatorId;
    byKey.set(key, existing);
  }
  return [...byKey.values()].sort((a, b) => {
    const byNotes = b.notes - a.notes;
    if (byNotes !== 0) return byNotes;
    return String(a.creatorName || a.creatorId || '').localeCompare(String(b.creatorName || b.creatorId || ''));
  });
}

function summarize(
  items: CreatorNotesBatchItemResult[],
  dryRun: boolean,
  durationMs: number,
): CreatorNotesBatchSummary {
  const summary = emptySummary(dryRun);
  summary.candidateVoiceItems = items.length;
  let timedItems = 0;
  for (const item of items) {
    if (item.outcome === 'processed') {
      summary.processed += 1;
      timedItems += 1;
    } else if (item.outcome === 'already_processed') {
      summary.alreadyProcessed += 1;
    } else if (item.outcome === 'no_captions') {
      summary.noCaptions += 1;
      timedItems += 1;
      if (item.captionFailure) summary.captionFailures[item.captionFailure] += 1;
    } else {
      summary.failed += 1;
      timedItems += 1;
      if (item.captionFailure) {
        summary.noCaptions += 1;
        summary.failed -= 1;
        summary.captionFailures[item.captionFailure] += 1;
      }
    }
    summary.transcripts.captionTracksFetched += item.captionTracksFetched;
    summary.transcripts.charactersProcessed += item.transcriptChars;
    summary.transcripts.chunks += item.chunks;
    summary.notes.total += item.notes;
    summary.persistence.notesWritten += item.notesWritten;
    if (item.runId && item.outcome === 'processed') summary.persistence.runsCreated += 1;
    if (item.evidenceDiagnostics) {
      summary.evidence.notesWithSourceEvidence += item.evidenceDiagnostics.notesWithSourceEvidence;
      summary.evidence.notesWithoutSourceEvidence += item.evidenceDiagnostics.notesWithoutSourceEvidence;
    }
    if (item.quoteDiagnostics) {
      summary.evidence.exactQuotesVerified += item.quoteDiagnostics.verified;
      summary.evidence.exactQuotesRejected += item.quoteDiagnostics.rejected;
    }
  }
  summary.creators = buildCreatorDistribution(items);
  summary.duration.totalMs = durationMs;
  summary.duration.averagePerItemMs = timedItems > 0 ? durationMs / timedItems : null;
  return summary;
}

function attachKindCounts(summary: CreatorNotesBatchSummary, results: CreatorNotesRunResult[]) {
  const counts = emptyKindCounts();
  for (const result of results) {
    for (const kind of CREATOR_NOTE_KINDS) counts[kind] += result.kindCounts[kind];
  }
  summary.notes = { total: summary.notes.total, ...counts };
}

function skippedResult(input: {
  dryRun: boolean;
  lockBusy: boolean;
  skipReason: string;
  overallStatus: CreatorNotesBatchResult['overallStatus'];
  ok: boolean;
}): CreatorNotesBatchResult {
  return {
    ok: input.ok,
    overallStatus: input.overallStatus,
    lockBusy: input.lockBusy,
    skipReason: input.skipReason,
    summary: emptySummary(input.dryRun),
    items: [],
  };
}

function itemBase(item: CreatorVoiceCatalogItem): Omit<
  CreatorNotesBatchItemResult,
  'outcome' | 'captionFailure' | 'error' | 'notes' | 'notesWritten' | 'runId' | 'transcriptChars' | 'chunks' | 'captionTracksFetched' | 'evidenceDiagnostics' | 'quoteDiagnostics' | 'sequential'
> {
  return {
    sourceItemId: item.sourceItemId,
    creatorId: item.creatorId,
    creatorName: item.creatorName,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
  };
}

async function processOneItem(
  item: CreatorVoiceCatalogItem,
  args: CreatorNotesBatchArgs,
  deps: CreatorNotesBatchDeps,
  extractionGate: { active: number; maxActive: number },
): Promise<{ item: CreatorNotesBatchItemResult; result: CreatorNotesRunResult | null }> {
  const source = resolvedCreatorSourceFromVoiceItem(item);
  const fetchTranscript = deps.fetchTranscript || fetchCreatorTranscript;
  let fetched: FetchedCreatorTranscript;
  try {
    fetched = await fetchTranscript(source);
  } catch (error) {
    const captionFailure = classifyCaptionFailure(error);
    return {
      item: {
        ...itemBase(item),
        outcome: captionFailure ? 'no_captions' : 'failed',
        captionFailure,
        error: clipError(error),
        notes: 0,
        notesWritten: 0,
        runId: null,
        transcriptChars: 0,
        chunks: 0,
        captionTracksFetched: 0,
        evidenceDiagnostics: null,
        quoteDiagnostics: null,
        sequential: true,
      },
      result: null,
    };
  }

  try {
    extractionGate.active += 1;
    extractionGate.maxActive = Math.max(extractionGate.maxActive, extractionGate.active);
    const result = await runCreatorNoteExtraction(
      {
        transcript: fetched.transcript,
        dryRun: args.dryRun,
        force: args.force,
      },
      {
        extractChunk: deps.extractChunk,
        store: args.dryRun ? undefined : deps.store,
        now: deps.now,
        id: deps.id,
        aiConfig: deps.aiConfig,
        log: deps.log,
      },
    );
    const alreadyProcessed = result.persistence.status === 'skipped';
    return {
      item: {
        ...itemBase(item),
        outcome: alreadyProcessed ? 'already_processed' : result.persistence.status === 'failed' ? 'failed' : 'processed',
        captionFailure: null,
        error: result.persistence.status === 'failed' ? 'extraction_failed' : null,
        notes: result.notes.length,
        notesWritten: result.persistence.notesWritten,
        runId: result.persistence.runId,
        transcriptChars: result.source.transcriptChars,
        chunks: result.ai.chunks,
        captionTracksFetched: fetched.acquisition.source === 'youtube-captions' ? 1 : 0,
        evidenceDiagnostics: result.evidenceDiagnostics,
        quoteDiagnostics: result.quoteDiagnostics,
        sequential: true,
      },
      result: alreadyProcessed ? null : result,
    };
  } catch (error) {
    return {
      item: {
        ...itemBase(item),
        outcome: 'failed',
        captionFailure: null,
        error: clipError(error),
        notes: 0,
        notesWritten: 0,
        runId: null,
        transcriptChars: fetched.transcript.segments.length ? fetched.acquisition.characters : 0,
        chunks: 0,
        captionTracksFetched: fetched.acquisition.source === 'youtube-captions' ? 1 : 0,
        evidenceDiagnostics: null,
        quoteDiagnostics: null,
        sequential: true,
      },
      result: null,
    };
  } finally {
    extractionGate.active = Math.max(0, extractionGate.active - 1);
  }
}

export function creatorNotesBatchExitCode(result: CreatorNotesBatchResult): number {
  if (result.lockBusy) return 0;
  return result.ok ? 0 : 1;
}

export async function runCreatorNotesBatch(
  args: CreatorNotesBatchArgs,
  deps: CreatorNotesBatchDeps = {},
): Promise<CreatorNotesBatchResult> {
  const dryRun = Boolean(args.dryRun);
  const started = deps.now ? deps.now().getTime() : Date.now();
  let lock: { release: () => void } | null = null;

  try {
    if (!deps.skipLock) {
      lock = acquireCreatorNotesRunLock(deps.lockPath);
    }

    if (!dryRun && !intelDbConfigured() && !deps.store) {
      return skippedResult({
        dryRun,
        lockBusy: false,
        skipReason: 'Supabase not configured',
        overallStatus: 'failed',
        ok: false,
      });
    }

    const aiConfig = deps.aiConfig || resolveCreatorNotesAiConfig();
    if (!deps.extractChunk) {
      assertCreatorNotesAiConfigured(aiConfig);
      if (!deps.skipWarmup) {
        const warmup = deps.warmup || (() => warmupCreatorNotesAi(aiConfig));
        await warmup();
      }
    }

    const candidates = await loadCreatorNotesBatchCandidates(
      {
        limit: args.limit ?? CREATOR_NOTES_BATCH_DEFAULT_LIMIT,
        creator: args.creator,
        sinceHours: args.sinceHours ?? CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS,
        now: deps.now ? deps.now() : undefined,
        youtubeBatchEnabled: deps.youtubeBatchEnabled,
      },
      { listVoiceItems: deps.listVoiceItems },
    );

    const store = dryRun ? undefined : deps.store || createSupabaseCreatorNotesStore();
    const extractionGate = { active: 0, maxActive: 0 };
    const items: CreatorNotesBatchItemResult[] = [];
    const extractionResults: CreatorNotesRunResult[] = [];

    for (const candidate of candidates) {
      const processed = await processOneItem(
        candidate,
        args,
        { ...deps, store, aiConfig },
        extractionGate,
      );
      items.push(processed.item);
      if (processed.result) extractionResults.push(processed.result);
    }

    if (extractionGate.maxActive > 1) {
      throw new Error('creator-notes batch started concurrent extractions');
    }

    const finished = deps.now ? deps.now().getTime() : Date.now();
    const summary = summarize(items, dryRun, Math.max(0, finished - started));
    attachKindCounts(summary, extractionResults);

    const overallStatus =
      summary.failed > 0 && summary.processed === 0 && summary.alreadyProcessed === 0
        ? 'failed'
        : summary.failed > 0 || summary.noCaptions > 0
          ? 'partial'
          : 'success';

    return {
      ok: overallStatus !== 'failed',
      overallStatus,
      lockBusy: false,
      skipReason: null,
      summary,
      items,
    };
  } catch (error) {
    if (error instanceof CreatorNotesLockBusyError) {
      return skippedResult({
        dryRun,
        lockBusy: true,
        skipReason: error.message,
        overallStatus: 'skipped',
        ok: true,
      });
    }
    return skippedResult({
      dryRun,
      lockBusy: false,
      skipReason: clipError(error),
      overallStatus: 'failed',
      ok: false,
    });
  } finally {
    lock?.release();
  }
}
