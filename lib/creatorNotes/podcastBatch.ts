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
import { PodcastTranscriptError } from '@/lib/creatorNotes/errors';
import { emptyKindCounts } from '@/lib/creatorNotes/postprocess';
import {
  loadPodcastCatalog,
  type PodcastCatalogDeps,
} from '@/lib/creatorNotes/podcastCatalog';
import { resolvePodcastTranscript, type PodcastHttpGet } from '@/lib/creatorNotes/podcastTranscript';
import type { OfficialTranscriptAdapter } from '@/lib/creatorNotes/podcastAdapters';
import { acquireCreatorNotesRunLock, CreatorNotesLockBusyError } from '@/lib/creatorNotes/runLock';
import {
  runCreatorNoteExtraction,
  type CreatorNotesExtractChunkFn,
  type CreatorNotesRunDeps,
} from '@/lib/creatorNotes/run';
import {
  clampCreatorNotesBatchLimit,
  clampCreatorNotesSinceHours,
  matchesCreatorSlug,
  voiceItemInRecencyWindow,
} from '@/lib/creatorNotes/select';
import {
  sortPodcastEpisodesNewestFirst,
} from '@/lib/creatorNotes/podcastIdentity';
import type {
  CreatorNotesBatchArgs,
  CreatorNotesPodcastBatchItemResult,
  CreatorNotesPodcastBatchResult,
  CreatorNotesPodcastBatchSummary,
  CreatorNotesRunResult,
  CreatorNotesStore,
  PodcastEpisodeSource,
  PodcastTranscriptStatus,
} from '@/lib/creatorNotes/types';
import { intelDbConfigured } from '@/lib/intel/db';

export type CreatorNotesPodcastBatchDeps = PodcastCatalogDeps & {
  resolveTranscript?: typeof resolvePodcastTranscript;
  adapters?: OfficialTranscriptAdapter[];
  get?: PodcastHttpGet;
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
};

function clipError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

function emptyStatuses(): Record<PodcastTranscriptStatus, number> {
  return {
    TRANSCRIPT_AVAILABLE: 0,
    TRANSCRIPT_UNAVAILABLE: 0,
    TRANSCRIPT_FETCH_FAILED: 0,
    TRANSCRIPT_FORMAT_UNSUPPORTED: 0,
    TRANSCRIPT_PARSE_FAILED: 0,
    TRANSCRIPT_EMPTY: 0,
    AUDIO_DOWNLOAD_FAILED: 0,
    AUDIO_TOO_LARGE: 0,
    AUDIO_TRANSCODE_FAILED: 0,
    TRANSCRIPTION_FAILED: 0,
    TRANSCRIPTION_EMPTY: 0,
  };
}

function emptySummary(dryRun: boolean): CreatorNotesPodcastBatchSummary {
  return {
    candidateEpisodes: 0,
    processed: 0,
    alreadyProcessed: 0,
    transcriptUnavailable: 0,
    failed: 0,
    transcriptStatuses: emptyStatuses(),
    transcripts: { charactersProcessed: 0, chunks: 0 },
    notes: { total: 0, ...emptyKindCounts() },
    evidence: {
      notesWithSourceEvidence: 0,
      notesWithoutSourceEvidence: 0,
      exactQuotesVerified: 0,
      exactQuotesRejected: 0,
    },
    persistence: { dryRun, runsCreated: 0, notesWritten: 0 },
    creators: [],
    duration: { totalMs: 0, averagePerItemMs: null },
  };
}

function skippedResult(input: {
  dryRun: boolean;
  lockBusy: boolean;
  skipReason: string;
  overallStatus: CreatorNotesPodcastBatchResult['overallStatus'];
  ok: boolean;
}): CreatorNotesPodcastBatchResult {
  return {
    ok: input.ok,
    overallStatus: input.overallStatus,
    lockBusy: input.lockBusy,
    skipReason: input.skipReason,
    summary: emptySummary(input.dryRun),
    items: [],
  };
}

export function selectEligiblePodcastEpisodes(
  episodes: PodcastEpisodeSource[],
  opts: { limit?: number; creator?: string | null; sinceHours?: number; now?: Date | string } = {},
): PodcastEpisodeSource[] {
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const sinceHours = clampCreatorNotesSinceHours(
    opts.sinceHours == null ? CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS : Number(opts.sinceHours),
  );
  const limit = clampCreatorNotesBatchLimit(
    opts.limit == null ? CREATOR_NOTES_BATCH_DEFAULT_LIMIT : Number(opts.limit),
  );
  return sortPodcastEpisodesNewestFirst(
    episodes.filter(
      (episode) =>
        matchesCreatorSlug({ creatorId: episode.creatorId }, opts.creator) &&
        voiceItemInRecencyWindow({ publishedAt: episode.publishedAt }, sinceHours, now),
    ),
  ).slice(0, limit);
}

function itemBase(episode: PodcastEpisodeSource): Pick<
  CreatorNotesPodcastBatchItemResult,
  'sourceItemId' | 'creatorId' | 'creatorName' | 'title' | 'episodeUrl' | 'audioUrl' | 'publishedAt'
> {
  return {
    sourceItemId: episode.sourceItemId,
    creatorId: episode.creatorId,
    creatorName: episode.creatorName,
    title: episode.title,
    episodeUrl: episode.episodeUrl,
    audioUrl: episode.audioUrl,
    publishedAt: episode.publishedAt,
  };
}

async function processOne(
  episode: PodcastEpisodeSource,
  args: CreatorNotesBatchArgs,
  deps: CreatorNotesPodcastBatchDeps,
): Promise<{ item: CreatorNotesPodcastBatchItemResult; result: CreatorNotesRunResult | null }> {
  const resolveTranscript = deps.resolveTranscript || resolvePodcastTranscript;
  let resolved;
  try {
    resolved = await resolveTranscript(episode, { get: deps.get, adapters: deps.adapters });
  } catch (error) {
    const status =
      error instanceof PodcastTranscriptError ? error.status : 'TRANSCRIPT_FETCH_FAILED';
    return {
      item: {
        ...itemBase(episode),
        outcome: status === 'TRANSCRIPT_UNAVAILABLE' ? 'transcript_unavailable' : 'failed',
        transcriptStatus: status,
        transcriptSource: null,
        transcriptUrl: null,
        error: clipError(error),
        notes: 0,
        notesWritten: 0,
        runId: null,
        transcriptChars: 0,
        chunks: 0,
        evidenceDiagnostics: null,
        quoteDiagnostics: null,
        sequential: true,
      },
      result: null,
    };
  }

  if (resolved.status !== 'TRANSCRIPT_AVAILABLE' || !resolved.transcript) {
    return {
      item: {
        ...itemBase(episode),
        outcome: resolved.status === 'TRANSCRIPT_UNAVAILABLE' ? 'transcript_unavailable' : 'failed',
        transcriptStatus: resolved.status,
        transcriptSource: resolved.transcript?.transcriptSource === 'official_creator_page' || resolved.transcript?.transcriptSource === 'podcast_namespace'
          ? resolved.transcript.transcriptSource
          : null,
        transcriptUrl: resolved.candidate?.url || null,
        error: resolved.error,
        notes: 0,
        notesWritten: 0,
        runId: null,
        transcriptChars: 0,
        chunks: 0,
        evidenceDiagnostics: null,
        quoteDiagnostics: null,
        sequential: true,
      },
      result: null,
    };
  }

  try {
    const result = await runCreatorNoteExtraction(
      {
        transcript: resolved.transcript,
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
        ...itemBase(episode),
        outcome: alreadyProcessed ? 'already_processed' : result.persistence.status === 'failed' ? 'failed' : 'processed',
        transcriptStatus: 'TRANSCRIPT_AVAILABLE',
        transcriptSource:
          resolved.transcript.transcriptSource === 'official_creator_page' ||
          resolved.transcript.transcriptSource === 'podcast_namespace'
            ? resolved.transcript.transcriptSource
            : 'podcast_namespace',
        transcriptUrl: resolved.transcript.transcriptUrl || resolved.candidate?.url || null,
        error: result.persistence.status === 'failed' ? 'extraction_failed' : null,
        notes: result.notes.length,
        notesWritten: result.persistence.notesWritten,
        runId: result.persistence.runId,
        transcriptChars: result.source.transcriptChars,
        chunks: result.ai.chunks,
        evidenceDiagnostics: result.evidenceDiagnostics,
        quoteDiagnostics: result.quoteDiagnostics,
        sequential: true,
      },
      result: alreadyProcessed ? null : result,
    };
  } catch (error) {
    return {
      item: {
        ...itemBase(episode),
        outcome: 'failed',
        transcriptStatus: 'TRANSCRIPT_AVAILABLE',
        transcriptSource:
          resolved.transcript.transcriptSource === 'official_creator_page'
            ? 'official_creator_page'
            : 'podcast_namespace',
        transcriptUrl: resolved.transcript.transcriptUrl || null,
        error: clipError(error),
        notes: 0,
        notesWritten: 0,
        runId: null,
        transcriptChars: resolved.acquisition?.characters || 0,
        chunks: 0,
        evidenceDiagnostics: null,
        quoteDiagnostics: null,
        sequential: true,
      },
      result: null,
    };
  }
}

function summarize(
  items: CreatorNotesPodcastBatchItemResult[],
  dryRun: boolean,
  durationMs: number,
): CreatorNotesPodcastBatchSummary {
  const summary = emptySummary(dryRun);
  summary.candidateEpisodes = items.length;
  let timed = 0;
  const creators = new Map<string, { creatorId: string | null; creatorName: string | null; items: number; notes: number }>();
  for (const item of items) {
    if (item.outcome === 'processed') {
      summary.processed += 1;
      timed += 1;
    } else if (item.outcome === 'already_processed') {
      summary.alreadyProcessed += 1;
    } else if (item.outcome === 'transcript_unavailable') {
      summary.transcriptUnavailable += 1;
      timed += 1;
    } else {
      summary.failed += 1;
      timed += 1;
    }
    if (item.transcriptStatus) summary.transcriptStatuses[item.transcriptStatus] += 1;
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
    const key = String(item.creatorId || item.creatorName || 'unknown').toLowerCase();
    const row = creators.get(key) || { creatorId: item.creatorId, creatorName: item.creatorName, items: 0, notes: 0 };
    row.items += 1;
    row.notes += item.notes;
    creators.set(key, row);
  }
  summary.creators = [...creators.values()].sort((a, b) => b.notes - a.notes);
  summary.duration.totalMs = durationMs;
  summary.duration.averagePerItemMs = timed > 0 ? durationMs / timed : null;
  return summary;
}

export function creatorNotesPodcastBatchExitCode(result: CreatorNotesPodcastBatchResult): number {
  if (result.lockBusy) return 0;
  return result.ok ? 0 : 1;
}

export async function runCreatorNotesPodcastBatch(
  args: CreatorNotesBatchArgs,
  deps: CreatorNotesPodcastBatchDeps = {},
): Promise<CreatorNotesPodcastBatchResult> {
  const dryRun = Boolean(args.dryRun);
  const started = deps.now ? deps.now().getTime() : Date.now();
  let lock: { release: () => void } | null = null;

  try {
    if (!deps.skipLock) lock = acquireCreatorNotesRunLock(deps.lockPath);

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

    const catalog = await loadPodcastCatalog(deps);
    const candidates = selectEligiblePodcastEpisodes(catalog, {
      limit: args.limit ?? CREATOR_NOTES_BATCH_DEFAULT_LIMIT,
      creator: args.creator,
      sinceHours: args.sinceHours ?? CREATOR_NOTES_BATCH_DEFAULT_SINCE_HOURS,
      now: deps.now ? deps.now() : undefined,
    });

    const store = dryRun ? undefined : deps.store || createSupabaseCreatorNotesStore();
    const items: CreatorNotesPodcastBatchItemResult[] = [];
    const extractionResults: CreatorNotesRunResult[] = [];

    for (const episode of candidates) {
      const processed = await processOne(episode, args, { ...deps, store, aiConfig });
      items.push(processed.item);
      if (processed.result) extractionResults.push(processed.result);
    }

    const finished = deps.now ? deps.now().getTime() : Date.now();
    const summary = summarize(items, dryRun, Math.max(0, finished - started));
    const counts = emptyKindCounts();
    for (const result of extractionResults) {
      for (const kind of CREATOR_NOTE_KINDS) counts[kind] += result.kindCounts[kind];
    }
    summary.notes = { total: summary.notes.total, ...counts };

    const overallStatus =
      summary.failed > 0 && summary.processed === 0 && summary.alreadyProcessed === 0
        ? 'failed'
        : summary.failed > 0 || summary.transcriptUnavailable > 0
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
