import { randomUUID } from 'node:crypto';

import { buildEvidenceWindows, splitCreatorTranscriptChunk } from '@/lib/creatorNotes/chunk';
import {
  classifyTranscriptContent,
  contentRoleSegmentDiagnostics,
  isEditorialExtractionRole,
  persistableCreatorNotes,
  resolveNoteContentRole,
} from '@/lib/creatorNotes/contentRole';
import {
  CREATOR_NOTE_EXTRACTION_VERSION,
  CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION,
  CREATOR_NOTES_TRANSPORT_BACKOFF_MS,
  type CreatorNoteRunStatus,
} from '@/lib/creatorNotes/constants';
import { createSupabaseCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  assertCreatorNotesAiConfigured,
  creatorNotesRecoveryReason,
  extractCreatorNotesChunk,
  extractCreatorNotesWindowBatch,
  entailCreatorNotes,
  healthCheckCreatorNotesAi,
  isCreatorNotesRecoverableInferenceError,
  isCreatorNotesTransportFailure,
  resolveCreatorNotesAiConfig,
  type CreatorNotesAiConfig,
  type CreatorNotesHealthCheckResult,
} from '@/lib/creatorNotes/extract';
import {
  createFileCreatorNotesExtractionCache,
  type CreatorNotesExtractionCache,
} from '@/lib/creatorNotes/extractionCache';
import {
  applyKnownCreatorAttribution,
  hashCreatorTranscript,
  hashEvidenceWindow,
  hashRawTranscription,
  transcriptCharCount,
} from '@/lib/creatorNotes/identity';
import { countNoteKinds, dedupeRawCreatorNotes, emptyKindCounts, toAtomicNotes } from '@/lib/creatorNotes/postprocess';
import {
  acceptGroundedCreatorNotes,
  addEvidenceDiagnostics,
  attachEvidenceWindowToNotes,
  emptyEvidenceDiagnostics,
  quoteDiagnosticsFromEvidence,
} from '@/lib/creatorNotes/sourceEvidence';
import { assessSemanticFidelity, type SemanticFailureReason } from '@/lib/creatorNotes/semanticFidelity';
import { addKindDiagnostics, emptyKindDiagnostics, invalidRawKindValues } from '@/lib/creatorNotes/validate';
import {
  assessWindowBatchCoverage,
  packEvidenceWindowBatches,
  selectEvidenceWindows,
  windowBatchRepairIds,
} from '@/lib/creatorNotes/windowBatch';
import type {
  CreatorAtomicNote,
  CreatorNoteEvidenceDiagnostics,
  CreatorNoteKindDiagnostics,
  CreatorNoteRun,
  CreatorNotesChunkExtractResult,
  CreatorNotesExtractionPerformance,
  CreatorNotesRunResult,
  CreatorNotesStore,
  CreatorNotesWindowBatchDiagnostics,
  CreatorNotesWindowBatchExtractResult,
  CreatorNotesWindowFallbackReason,
  CreatorTranscriptChunk,
  CreatorTranscriptInput,
  CreatorTranscriptSegment,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';
import { intelDbConfigured } from '@/lib/intel/db';
import {
  AI_PROVIDER_UNAVAILABLE,
  CreatorNotesProviderUnavailableError,
  isCreatorNotesProviderUnavailableError,
  isCreatorNotesRateLimitError,
} from '@/lib/creatorNotes/errors';

export type CreatorNotesExtractChunkFn = (input: {
  transcript: CreatorTranscriptInput;
  chunk: CreatorTranscriptChunk;
  chunkCount: number;
  config?: CreatorNotesAiConfig;
  repair?: boolean;
  rejectedKinds?: string[];
}) => Promise<CreatorNotesChunkExtractResult>;

export type CreatorNotesExtractBatchFn = (input: {
  transcript: CreatorTranscriptInput;
  windows: CreatorTranscriptChunk[];
  chunkCount: number;
  config?: CreatorNotesAiConfig;
  repair?: boolean;
}) => Promise<CreatorNotesWindowBatchExtractResult>;

export type CreatorNotesRunDeps = {
  extractChunk?: CreatorNotesExtractChunkFn;
  extractBatch?: CreatorNotesExtractBatchFn | null;
  extractionCache?: CreatorNotesExtractionCache | null;
  store?: CreatorNotesStore;
  now?: () => Date;
  id?: () => string;
  aiConfig?: CreatorNotesAiConfig;
  log?: (prefix: string, event: string, extra?: Record<string, unknown>) => void;
  healthCheck?: (config: CreatorNotesAiConfig) => Promise<CreatorNotesHealthCheckResult>;
  semanticEntailment?: typeof entailCreatorNotes | null;
  sleep?: (ms: number) => Promise<void>;
  transportBackoffMs?: number;
};

type ChunkProcessResult = {
  notes: RawCreatorNote[];
  rejected: number;
  diagnostics: CreatorNoteEvidenceDiagnostics;
  kindDiagnostics: CreatorNoteKindDiagnostics;
  ok: boolean;
  error: string | null;
};

function logEvent(
  log: CreatorNotesRunDeps['log'],
  prefix: string,
  event: string,
  extra?: Record<string, unknown>,
) {
  if (log) {
    log(prefix, event, extra);
    return;
  }
  if (extra) console.info(prefix, event, extra);
  else console.info(prefix, event);
}

function clipError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function emptyExtractionPerformance(
  evidenceWindowsTotal = 0,
): CreatorNotesExtractionPerformance {
  return {
    evidenceWindowsTotal,
    cacheHits: 0,
    cacheMisses: 0,
    ollamaBatchRequests: 0,
    semanticValidationRequests: 0,
    individualFallbackRequests: 0,
    batchWindowsSubmitted: 0,
    batchWindowsAccepted: 0,
    batchWindowsRepaired: 0,
    individualFallbackWindows: 0,
    batches: [],
    totalAiMs: 0,
    averageAiMsPerUncachedWindow: null,
  };
}

function finalizeExtractionPerformance(
  performance: CreatorNotesExtractionPerformance,
): CreatorNotesExtractionPerformance {
  const uncached = performance.cacheMisses;
  return {
    ...performance,
    averageAiMsPerUncachedWindow: uncached > 0 ? performance.totalAiMs / uncached : null,
  };
}

export function prepareAtomicNoteEvidenceWindows(segments: CreatorTranscriptSegment[]) {
  const classified = classifyTranscriptContent(segments);
  const classifiedWindows = buildEvidenceWindows(classified.segments);
  const editorialWindows = classifiedWindows.filter((window) => isEditorialExtractionRole(window.contentRole));
  return { classified, classifiedWindows, editorialWindows };
}

export function creatorNotesRunStatus(input: {
  failedChunks: number;
  noteCount: number;
}): CreatorNoteRunStatus {
  if (input.failedChunks === 0) return 'success';
  if (input.noteCount > 0) return 'partial';
  return 'failed';
}

export async function runCreatorNoteExtraction(
  input: {
    transcript: CreatorTranscriptInput;
    dryRun?: boolean;
    force?: boolean;
    limitNotes?: number | null;
    maxWindows?: number | null;
    windowOffset?: number | null;
    bypassExtractionCache?: boolean;
    contentRoleDiagnostics?: boolean;
  },
  deps: CreatorNotesRunDeps = {},
): Promise<CreatorNotesRunResult> {
  const dryRun = Boolean(input.dryRun);
  const force = Boolean(input.force);
  const bypassExtractionCache = Boolean(input.bypassExtractionCache) || force;
  const transcript = input.transcript;
  const now = deps.now || (() => new Date());
  const nextId = deps.id || (() => randomUUID());
  const aiConfig = deps.aiConfig || resolveCreatorNotesAiConfig();
  const extractChunk = deps.extractChunk || extractCreatorNotesChunk;
  const extractBatch =
    deps.extractChunk && deps.extractBatch === undefined
      ? null
      : deps.extractBatch === null
        ? null
        : deps.extractBatch || extractCreatorNotesWindowBatch;
  const extractionCache =
    deps.extractionCache !== undefined
      ? deps.extractionCache
      : !deps.extractChunk && deps.extractBatch === undefined
        ? createFileCreatorNotesExtractionCache()
        : null;
  const log = deps.log;
  const healthCheck = deps.healthCheck || healthCheckCreatorNotesAi;
  const semanticEntailment =
    deps.semanticEntailment !== undefined ? deps.semanticEntailment : deps.extractChunk ? null : entailCreatorNotes;
  const sleep = deps.sleep || sleepMs;
  const backoffMs = deps.transportBackoffMs ?? CREATOR_NOTES_TRANSPORT_BACKOFF_MS;

  const rawSegments = transcript.rawSegments?.length ? transcript.rawSegments : transcript.segments;
  const normalizationVersion =
    transcript.normalizationVersion || CREATOR_NOTES_TRANSCRIPT_NORMALIZATION_VERSION;
  const transcriptHash = hashCreatorTranscript(transcript.segments, { normalizationVersion });
  const rawTranscriptHash = hashRawTranscription(rawSegments);
  const transcriptChars = transcriptCharCount(transcript.segments);
  const prepared = prepareAtomicNoteEvidenceWindows(transcript.segments);
  const editorialWindows = prepared.editorialWindows;
  const contentRoles = {
    ...prepared.classified.diagnostics,
    editorialWindows: editorialWindows.length,
    nonEditorialWindowsSkipped: prepared.classifiedWindows.length - editorialWindows.length,
    nonEditorialNotesDropped: 0,
    ...(input.contentRoleDiagnostics
      ? { segments: contentRoleSegmentDiagnostics(prepared.classified.segments) }
      : {}),
  };
  const chunks = selectEvidenceWindows(editorialWindows, {
    offset: input.windowOffset,
    maxWindows: input.maxWindows,
  });
  const performance = emptyExtractionPerformance(chunks.length);

  const source = {
    sourceItemId: transcript.sourceItemId,
    creatorId: transcript.creatorId,
    creatorName: transcript.creatorName,
    title: transcript.sourceTitle,
    url: transcript.sourceUrl,
    transcriptSegments: transcript.segments.length,
    transcriptChars,
    transcriptHash,
    rawTranscriptHash,
    normalizationVersion,
  };

  const ai = {
    provider: aiConfig.provider,
    model: aiConfig.model,
    extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
    chunks: chunks.length,
    successfulChunks: 0,
    failedChunks: 0,
  };

  logEvent(log, '[creator-notes]', 'run start', {
    sourceItemId: transcript.sourceItemId,
    chars: transcriptChars,
    chunks: chunks.length,
    dryRun,
    force,
    timeoutMs: aiConfig.timeoutMs,
  });

  if (!dryRun && !intelDbConfigured() && !deps.store) {
    throw new Error('Supabase not configured');
  }

  // Dry-run never touches creator-notes tables, including equivalent-run lookup.
  const store = dryRun ? deps.store || null : deps.store || createSupabaseCreatorNotesStore();

  let equivalent: CreatorNoteRun | null = null;
  if (!dryRun && store) {
    equivalent = await store.findEquivalentSuccessRun({
      sourceItemId: transcript.sourceItemId,
      transcriptHash,
      extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
      modelProvider: aiConfig.provider,
      modelName: aiConfig.model,
    });
  }

  if (equivalent && !force) {
    logEvent(log, '[creator-notes]', 'prior-run skip', { runId: equivalent.id });
    return {
      source,
      ai,
      notes: [],
      kindCounts: emptyKindCounts(),
      kindDiagnostics: emptyKindDiagnostics(),
      validationRejected: 0,
      duplicatesRemoved: 0,
      evidenceDiagnostics: emptyEvidenceDiagnostics(),
      quoteDiagnostics: quoteDiagnosticsFromEvidence(emptyEvidenceDiagnostics()),
      performance: emptyExtractionPerformance(chunks.length),
      persistence: {
        dryRun: false,
        priorEquivalentRunId: equivalent.id,
        runId: equivalent.id,
        notesWritten: 0,
        status: 'skipped',
      },
      contentRoles,
    };
  }

  if (!deps.extractChunk) {
    assertCreatorNotesAiConfigured(aiConfig);
  }

  const startedAt = now().toISOString();
  const runId = nextId();
  const runRow: CreatorNoteRun = {
    id: runId,
    sourceItemId: transcript.sourceItemId,
    sourceIdentityKey: transcript.sourceIdentityKey,
    creatorId: transcript.creatorId,
    modelProvider: aiConfig.provider,
    modelName: aiConfig.model,
    extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
    transcriptHash,
    status: 'running',
    inputChars: transcriptChars,
    notesCreated: 0,
    startedAt,
    completedAt: null,
    errorMessage: null,
    createdAt: startedAt,
  };

  if (!dryRun && store) {
    await store.insertRun(runRow);
  }

  const collected: RawCreatorNote[] = [];
  let validationRejected = 0;
  const evidenceDiagnostics = emptyEvidenceDiagnostics();
  const kindDiagnostics = emptyKindDiagnostics();
  const chunkErrors: string[] = [];

  function kindDiagnosticsFromExtracted(extracted: CreatorNotesChunkExtractResult): CreatorNoteKindDiagnostics {
    if (extracted.kindDiagnostics) return extracted.kindDiagnostics;
    const synthesized = emptyKindDiagnostics();
    for (const note of extracted.notes) {
      synthesized.rawCounts[note.kind] = (synthesized.rawCounts[note.kind] || 0) + 1;
      synthesized.validatedCounts[note.kind] += 1;
    }
    return synthesized;
  }

  function windowCacheKey(chunk: CreatorTranscriptChunk) {
    return {
      sourceItemId: transcript.sourceItemId,
      transcriptHash,
      normalizationVersion,
      windowHash: hashEvidenceWindow({
        windowId: chunk.windowId,
        segmentIndexes: chunk.segmentIndexes,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        text: chunk.verbatimTranscript || chunk.text,
      }),
      extractionVersion: CREATOR_NOTE_EXTRACTION_VERSION,
      provider: aiConfig.provider,
      model: aiConfig.model,
    };
  }

  function recordSemanticRejection(
    diagnostics: CreatorNoteEvidenceDiagnostics,
    reason: SemanticFailureReason | null,
  ) {
    diagnostics.groundingRejected += 1;
    diagnostics.semanticRejected += 1;
    if (reason === 'actor_mismatch') diagnostics.semanticActorMismatch += 1;
    else if (reason === 'relation_reversed') diagnostics.semanticRelationReversed += 1;
    else if (reason === 'attribution_mismatch') diagnostics.semanticAttributionMismatch += 1;
    else if (reason === 'modality_strengthened') diagnostics.semanticModalityStrengthened += 1;
    else if (reason === 'quantity_mismatch') diagnostics.semanticQuantityMismatch += 1;
    else if (reason === 'unsupported_inference') diagnostics.semanticUnsupportedInference += 1;
    else diagnostics.semanticOther += 1;
  }

  async function groundExtracted(
    chunk: CreatorTranscriptChunk,
    extracted: CreatorNotesChunkExtractResult,
  ): Promise<ChunkProcessResult> {
    const attached = attachEvidenceWindowToNotes(extracted.notes, {
      segmentIndexes: chunk.segmentIndexes,
      startSeconds: chunk.startSeconds,
      endSeconds: chunk.endSeconds,
    });
    const grounded = acceptGroundedCreatorNotes(attached, prepared.classified.segments, {
      allowedSegmentIndexes: chunk.segmentIndexes,
      sourceTitle: transcript.sourceTitle,
      sourceUrl: transcript.sourceUrl,
      knownCreatorName: transcript.creatorName,
    });
    let semanticRejected = 0;
    let fidelityNotes = grounded.notes;
    if (semanticEntailment && fidelityNotes.length) {
      const ready: RawCreatorNote[] = [];
      const review: RawCreatorNote[] = [];
      for (const note of fidelityNotes) {
        const decision = assessSemanticFidelity(note.sourceExcerpt || '', note.text, {
          quotedSpeaker: note.quotedSpeaker,
        });
        if (decision.decision === 'review') review.push(note);
        else ready.push(note);
      }
      const groups = new Map<string, RawCreatorNote[]>();
      for (const note of review) {
        const key = note.sourceExcerpt || '';
        const list = groups.get(key) || [];
        list.push(note);
        groups.set(key, list);
      }
      for (const [evidenceText, group] of groups) {
        performance.semanticValidationRequests += 1;
        const outcome = await semanticEntailment({
          evidenceText,
          notes: group,
          config: aiConfig,
        });
        ready.push(...outcome.notes);
        for (const reason of outcome.rejections) {
          semanticRejected += 1;
          recordSemanticRejection(grounded.diagnostics, reason);
        }
      }
      fidelityNotes = ready;
    }
    const notes: RawCreatorNote[] = [];
    if (!isEditorialExtractionRole(chunk.contentRole)) {
      contentRoles.nonEditorialNotesDropped += fidelityNotes.length;
      return {
        notes,
        rejected: extracted.rejected + grounded.rejected + semanticRejected,
        diagnostics: grounded.diagnostics,
        kindDiagnostics: kindDiagnosticsFromExtracted(extracted),
        ok: true,
        error: null,
      };
    }
    for (const note of fidelityNotes) {
      const role = resolveNoteContentRole({
        contentRole: chunk.contentRole,
        text: note.text,
        sourceQuote: note.sourceQuote,
        exactQuote: note.exactQuote,
        sourceExcerpt: note.sourceExcerpt,
      });
      if (role !== 'editorial') {
        contentRoles.nonEditorialNotesDropped += 1;
        continue;
      }
      notes.push({ ...note, contentRole: 'editorial' as const });
    }
    return {
      notes,
      rejected: extracted.rejected + grounded.rejected + semanticRejected,
      diagnostics: grounded.diagnostics,
      kindDiagnostics: kindDiagnosticsFromExtracted(extracted),
      ok: true,
      error: null,
    };
  }

  async function writeWindowCache(chunk: CreatorTranscriptChunk, extracted: CreatorNotesChunkExtractResult) {
    if (!extractionCache) return;
    await extractionCache.set(windowCacheKey(chunk), {
      windowId: chunk.windowId,
      notes: extracted.notes,
      rejected: extracted.rejected,
      kindDiagnostics: kindDiagnosticsFromExtracted(extracted),
      extractedAt: now().toISOString(),
    });
  }

  async function extractAndGround(
    chunk: CreatorTranscriptChunk,
    repair: boolean,
    rejectedKinds?: string[],
  ): Promise<{
    notes: RawCreatorNote[];
    rejected: number;
    diagnostics: CreatorNoteEvidenceDiagnostics;
    kindDiagnostics: CreatorNoteKindDiagnostics;
    proposed: number;
  }> {
    const extractStarted = Date.now();
    const extracted = await extractChunk({
      transcript,
      chunk,
      chunkCount: chunks.length,
      config: aiConfig,
      repair,
      rejectedKinds,
    });
    performance.totalAiMs += Date.now() - extractStarted;
    await writeWindowCache(chunk, extracted);
    const grounded = await groundExtracted(chunk, extracted);
    return {
      notes: grounded.notes,
      rejected: grounded.rejected,
      diagnostics: grounded.diagnostics,
      kindDiagnostics: grounded.kindDiagnostics,
      proposed: extracted.notes.length,
    };
  }

  async function recoverTransportOnce(chunk: CreatorTranscriptChunk): Promise<boolean> {
    logEvent(log, '[creator-notes]', 'transport failure', {
      index: chunk.index,
      windowId: chunk.windowId,
      chars: chunk.charCount,
    });
    const probe = await healthCheck(aiConfig);
    logEvent(log, '[creator-notes]', 'health check', {
      index: chunk.index,
      windowId: chunk.windowId,
      ok: probe.ok,
      reachable: probe.reachable,
      error: probe.error || null,
    });
    if (!probe.reachable) {
      logEvent(log, '[creator-notes]', 'provider unavailable abort', {
        index: chunk.index,
        windowId: chunk.windowId,
        error: probe.error || null,
      });
      throw new CreatorNotesProviderUnavailableError(
        `${AI_PROVIDER_UNAVAILABLE}: transport failure`,
      );
    }
    await sleep(backoffMs);
    return true;
  }

  async function processChunk(
    chunk: CreatorTranscriptChunk,
    flags: { inferenceRetry: boolean; transportRetry: boolean },
    childOffset: number | null,
  ): Promise<ChunkProcessResult> {
    const isRetry = flags.inferenceRetry;
    logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk started' : 'chunk started', {
      index: chunk.index,
      windowId: chunk.windowId,
      childOffset,
      chars: chunk.charCount,
      startSeconds: chunk.startSeconds,
      endSeconds: chunk.endSeconds,
      segmentIndexes: chunk.segmentIndexes,
    });
    try {
      let result = await extractAndGround(chunk, false);
      if (result.notes.length === 0 && (result.proposed > 0 || result.rejected > 0)) {
        const rejectedKinds = invalidRawKindValues(result.kindDiagnostics);
        logEvent(log, '[creator-notes]', 'chunk grounding repair started', {
          index: chunk.index,
          windowId: chunk.windowId,
          childOffset,
          proposed: result.proposed,
          rejected: result.rejected,
          rejectedKinds,
        });
        result = await extractAndGround(chunk, true, rejectedKinds);
        logEvent(
          log,
          '[creator-notes]',
          result.notes.length ? 'chunk grounding repair completed' : 'chunk grounding repair failed',
          { index: chunk.index, windowId: chunk.windowId, childOffset, notes: result.notes.length, rejected: result.rejected },
        );
      }
      if (result.rejected > 0) {
        logEvent(log, '[creator-notes]', 'validation rejected count', {
          index: chunk.index,
          windowId: chunk.windowId,
          childOffset,
          rejected: result.rejected,
        });
      }
      logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk completed' : 'chunk succeeded', {
        index: chunk.index,
        windowId: chunk.windowId,
        childOffset,
        notes: result.notes.length,
        rejected: result.rejected,
        ok: true,
      });
      return {
        notes: result.notes,
        rejected: result.rejected,
        diagnostics: result.diagnostics,
        kindDiagnostics: result.kindDiagnostics,
        ok: true,
        error: null,
      };
    } catch (error) {
      if (isCreatorNotesProviderUnavailableError(error) || isCreatorNotesRateLimitError(error)) throw error;
      const recovery = creatorNotesRecoveryReason(error);

      if (isCreatorNotesTransportFailure(error)) {
        const canRetry = await recoverTransportOnce(chunk);
        if (canRetry && !flags.transportRetry) {
          logEvent(log, '[creator-notes]', 'transport retry', {
            index: chunk.index,
            windowId: chunk.windowId,
            chars: chunk.charCount,
            error: clipError(error),
            sameWindow: true,
          });
          return processChunk(chunk, { inferenceRetry: flags.inferenceRetry, transportRetry: true }, childOffset);
        }
        const message = clipError(error);
        logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk failed' : 'chunk failed', {
          index: chunk.index,
          windowId: chunk.windowId,
          childOffset,
          error: message,
          ok: false,
          split: false,
        });
        return {
          notes: [],
          rejected: 0,
          diagnostics: emptyEvidenceDiagnostics(),
          kindDiagnostics: emptyKindDiagnostics(),
          ok: false,
          error: message,
        };
      }

      if (isCreatorNotesRecoverableInferenceError(error) && !flags.inferenceRetry) {
        logEvent(log, '[creator-notes]', 'recoverable failure', {
          index: chunk.index,
          windowId: chunk.windowId,
          reason: recovery,
          chars: chunk.charCount,
          error: clipError(error),
        });
        if (recovery === 'timeout') {
          logEvent(log, '[creator-notes]', 'chunk timeout', {
            index: chunk.index,
            windowId: chunk.windowId,
            chars: chunk.charCount,
            error: clipError(error),
          });
        }
        const children = splitCreatorTranscriptChunk(chunk);
        if (children.length <= 1) {
          const message = clipError(error);
          logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk failed' : 'chunk failed', {
            index: chunk.index,
            windowId: chunk.windowId,
            childOffset,
            error: message,
            ok: false,
          });
          return {
            notes: [],
            rejected: 0,
            diagnostics: emptyEvidenceDiagnostics(),
            kindDiagnostics: emptyKindDiagnostics(),
            ok: false,
            error: message,
          };
        }
        const childRanges = children.map((child) => ({
          startIndex: child.segmentIndexes[0] ?? null,
          endIndex: child.segmentIndexes[child.segmentIndexes.length - 1] ?? null,
          startSeconds: child.startSeconds,
          endSeconds: child.endSeconds,
          chars: child.charCount,
          windowId: child.windowId,
        }));
        logEvent(log, '[creator-notes]', 'chunk split', {
          index: chunk.index,
          windowId: chunk.windowId,
          splitReason: recovery,
          children: children.length,
          childChars: children.map((child) => child.charCount),
          childRanges,
        });
        const merged: ChunkProcessResult = {
          notes: [],
          rejected: 0,
          diagnostics: emptyEvidenceDiagnostics(),
          kindDiagnostics: emptyKindDiagnostics(),
          ok: true,
          error: null,
        };
        for (let i = 0; i < children.length; i += 1) {
          const childResult = await processChunk(
            children[i],
            { inferenceRetry: true, transportRetry: flags.transportRetry },
            i,
          );
          merged.notes.push(...childResult.notes);
          merged.rejected += childResult.rejected;
          addEvidenceDiagnostics(merged.diagnostics, childResult.diagnostics);
          addKindDiagnostics(merged.kindDiagnostics, childResult.kindDiagnostics);
          if (!childResult.ok) {
            merged.ok = false;
            merged.error = merged.error || childResult.error;
          }
        }
        return merged;
      }

      const message = clipError(error);
      logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk failed' : 'chunk failed', {
        index: chunk.index,
        windowId: chunk.windowId,
        childOffset,
        error: message,
        ok: false,
      });
      return {
        notes: [],
        rejected: 0,
        diagnostics: emptyEvidenceDiagnostics(),
        kindDiagnostics: emptyKindDiagnostics(),
        ok: false,
        error: message,
      };
    }
  }

  function recordProcessed(processed: ChunkProcessResult) {
    collected.push(...processed.notes);
    validationRejected += processed.rejected;
    addEvidenceDiagnostics(evidenceDiagnostics, processed.diagnostics);
    addKindDiagnostics(kindDiagnostics, processed.kindDiagnostics);
    if (processed.ok) ai.successfulChunks += 1;
    else {
      ai.failedChunks += 1;
      if (processed.error) chunkErrors.push(processed.error);
    }
  }

  async function readCachedWindow(chunk: CreatorTranscriptChunk): Promise<ChunkProcessResult | null> {
    if (!extractionCache || bypassExtractionCache) return null;
    const hit = await extractionCache.get(windowCacheKey(chunk));
    if (!hit) return null;
    performance.cacheHits += 1;
    logEvent(log, '[creator-notes]', 'extraction cache hit', {
      index: chunk.index,
      windowId: chunk.windowId,
    });
    return groundExtracted(chunk, hit);
  }

  function coverageFromBatchResult(
    submittedWindowIds: string[],
    result: CreatorNotesWindowBatchExtractResult,
  ): CreatorNotesWindowBatchDiagnostics {
    if (result.diagnostics) {
      return assessWindowBatchCoverage({
        submittedWindowIds,
        returnedWindowIds: result.diagnostics.returnedWindowIds,
        malformedWindowIds: result.diagnostics.malformedWindowIds,
        unexpectedWindowIds: result.diagnostics.unexpectedWindowIds,
        duplicateWindowIds: result.diagnostics.duplicateWindowIds,
        validationFailuresByWindow: result.diagnostics.validationFailuresByWindow,
      });
    }
    const validationFailuresByWindow: Record<string, string[]> = {};
    for (const row of result.windows) {
      if (row.rejected > 0) validationFailuresByWindow[row.windowId] = [`rejected:${row.rejected}`];
    }
    return assessWindowBatchCoverage({
      submittedWindowIds,
      returnedWindowIds: result.windows.map((row) => row.windowId),
      validationFailuresByWindow,
    });
  }

  async function acceptExtractedWindow(
    chunk: CreatorTranscriptChunk,
    extracted: CreatorNotesChunkExtractResult,
  ): Promise<void> {
    await writeWindowCache(chunk, extracted);
    const firstGround = await groundExtracted(chunk, extracted);
    let result = firstGround;
    if (firstGround.notes.length === 0 && (extracted.notes.length > 0 || extracted.rejected > 0)) {
      const rejectedKinds = invalidRawKindValues(extracted.kindDiagnostics || emptyKindDiagnostics());
      const repaired = await extractAndGround(chunk, true, rejectedKinds);
      const mergedDiagnostics = addEvidenceDiagnostics({ ...firstGround.diagnostics }, repaired.diagnostics);
      const mergedKinds = addKindDiagnostics(
        addKindDiagnostics(emptyKindDiagnostics(), firstGround.kindDiagnostics),
        repaired.kindDiagnostics,
      );
      result = {
        notes: repaired.notes,
        rejected: firstGround.rejected + repaired.rejected,
        diagnostics: mergedDiagnostics,
        kindDiagnostics: mergedKinds,
        ok: true,
        error: null,
      };
    }
    recordProcessed(result);
  }

  async function fallbackWindowIndividually(
    chunk: CreatorTranscriptChunk,
    reason: CreatorNotesWindowFallbackReason,
    diagnostics: CreatorNotesWindowBatchDiagnostics,
  ): Promise<void> {
    diagnostics.fallbackReasons[chunk.windowId] = reason;
    performance.individualFallbackRequests += 1;
    performance.individualFallbackWindows += 1;
    logEvent(log, '[creator-notes]', 'window individual fallback', {
      windowId: chunk.windowId,
      reason,
    });
    recordProcessed(await processChunk(chunk, { inferenceRetry: false, transportRetry: false }, null));
  }

  async function processPackedBatch(batch: CreatorTranscriptChunk[]): Promise<void> {
    if (!extractBatch || batch.length <= 1) {
      for (const chunk of batch) {
        recordProcessed(await processChunk(chunk, { inferenceRetry: false, transportRetry: false }, null));
      }
      return;
    }

    const submittedWindowIds = batch.map((chunk) => chunk.windowId);
    performance.batchWindowsSubmitted += batch.length;

    const runBatch = async (windows: CreatorTranscriptChunk[], repair: boolean) => {
      const started = Date.now();
      performance.ollamaBatchRequests += 1;
      try {
        return await extractBatch({
          transcript,
          windows,
          chunkCount: chunks.length,
          config: aiConfig,
          repair,
        });
      } finally {
        performance.totalAiMs += Date.now() - started;
      }
    };

    let batchResult: CreatorNotesWindowBatchExtractResult | null = null;
    let batchError: unknown = null;
    try {
      batchResult = await runBatch(batch, false);
    } catch (error) {
      batchError = error;
      if (isCreatorNotesProviderUnavailableError(error) || isCreatorNotesRateLimitError(error)) throw error;
      if (isCreatorNotesTransportFailure(error)) {
        const canRetry = await recoverTransportOnce(batch[0]);
        if (canRetry) {
          try {
            batchResult = await runBatch(batch, false);
            batchError = null;
          } catch (retryError) {
            if (isCreatorNotesProviderUnavailableError(retryError) || isCreatorNotesRateLimitError(retryError)) {
              throw retryError;
            }
            batchError = retryError;
          }
        }
      }
    }

    if (!batchResult) {
      const diagnostics = coverageFromBatchResult(submittedWindowIds, { windows: [] });
      logEvent(log, '[creator-notes]', 'window batch result', {
        submittedWindowIds: diagnostics.submittedWindowIds,
        returnedWindowIds: diagnostics.returnedWindowIds,
        missingWindowIds: diagnostics.missingWindowIds,
        malformedWindowIds: diagnostics.malformedWindowIds,
        validationFailuresByWindow: diagnostics.validationFailuresByWindow,
        error: clipError(batchError),
      });
      for (const chunk of batch) {
        await fallbackWindowIndividually(chunk, 'batch_request_failed', diagnostics);
      }
      performance.batches.push(diagnostics);
      return;
    }

    const diagnostics = coverageFromBatchResult(submittedWindowIds, batchResult);
    logEvent(log, '[creator-notes]', 'window batch result', {
      submittedWindowIds: diagnostics.submittedWindowIds,
      returnedWindowIds: diagnostics.returnedWindowIds,
      missingWindowIds: diagnostics.missingWindowIds,
      malformedWindowIds: diagnostics.malformedWindowIds,
      unexpectedWindowIds: diagnostics.unexpectedWindowIds,
      duplicateWindowIds: diagnostics.duplicateWindowIds,
      validationFailuresByWindow: diagnostics.validationFailuresByWindow,
    });

    const byId = new Map(batchResult.windows.map((row) => [row.windowId, row]));
    const malformedKnown = new Set(
      diagnostics.malformedWindowIds.filter((id) => submittedWindowIds.includes(id)),
    );
    const accepted: CreatorTranscriptChunk[] = [];
    const needsRepair: Array<{ chunk: CreatorTranscriptChunk; reason: CreatorNotesWindowFallbackReason }> = [];

    for (const chunk of batch) {
      const extracted = byId.get(chunk.windowId);
      if (!extracted || malformedKnown.has(chunk.windowId)) {
        needsRepair.push({
          chunk,
          reason: malformedKnown.has(chunk.windowId) ? 'window_malformed' : 'window_missing',
        });
        continue;
      }
      accepted.push(chunk);
    }

    for (const chunk of accepted) {
      const extracted = byId.get(chunk.windowId);
      if (!extracted) continue;
      performance.batchWindowsAccepted += 1;
      await acceptExtractedWindow(chunk, extracted);
    }
    diagnostics.acceptedWindowIds = accepted.map((chunk) => chunk.windowId);

    const repairIds = windowBatchRepairIds(diagnostics);
    const repairChunks = needsRepair.map((row) => row.chunk);
    const canRepair = accepted.length > 0 && repairChunks.length > 0;

    if (canRepair) {
      logEvent(log, '[creator-notes]', 'window batch repair started', {
        windowIds: repairIds,
      });
      let repairResult: CreatorNotesWindowBatchExtractResult | null = null;
      try {
        repairResult = await runBatch(repairChunks, true);
      } catch (error) {
        if (isCreatorNotesProviderUnavailableError(error) || isCreatorNotesRateLimitError(error)) throw error;
        logEvent(log, '[creator-notes]', 'window batch repair failed', {
          windowIds: repairIds,
          error: clipError(error),
        });
      }

      const repairedById = new Map((repairResult?.windows || []).map((row) => [row.windowId, row]));
      for (const row of needsRepair) {
        const extracted = repairedById.get(row.chunk.windowId);
        if (!extracted) {
          await fallbackWindowIndividually(
            row.chunk,
            repairResult ? 'repair_incomplete' : 'repair_failed',
            diagnostics,
          );
          continue;
        }
        diagnostics.repairedWindowIds.push(row.chunk.windowId);
        performance.batchWindowsRepaired += 1;
        await acceptExtractedWindow(row.chunk, extracted);
      }
    } else {
      for (const row of needsRepair) {
        await fallbackWindowIndividually(row.chunk, row.reason, diagnostics);
      }
    }

    performance.batches.push(diagnostics);
  }

  try {
    const pending: CreatorTranscriptChunk[] = [];
    for (const chunk of chunks) {
      const cached = await readCachedWindow(chunk);
      if (cached) {
        recordProcessed(cached);
        continue;
      }
      performance.cacheMisses += 1;
      if (!extractBatch) {
        recordProcessed(await processChunk(chunk, { inferenceRetry: false, transportRetry: false }, null));
      } else {
        pending.push(chunk);
      }
    }
    if (extractBatch && pending.length) {
      for (const batch of packEvidenceWindowBatches(pending)) {
        await processPackedBatch(batch);
      }
    }

    const deduped = dedupeRawCreatorNotes(collected);
    if (deduped.duplicatesRemoved > 0) {
      logEvent(log, '[creator-notes]', 'dedupe count', { removed: deduped.duplicatesRemoved });
    }

    let limited = applyKnownCreatorAttribution(deduped.notes, transcript.creatorName);
    if (input.limitNotes != null && Number.isFinite(input.limitNotes) && input.limitNotes >= 0) {
      limited = limited.slice(0, input.limitNotes);
    }

    const createdAt = now().toISOString();
    const atomicNotes = toAtomicNotes({
      notes: limited,
      sourceItemId: transcript.sourceItemId,
      creatorId: transcript.creatorId,
      extractionRunId: runId,
      createdAt,
      idFactory: nextId,
    });
    const notes = persistableCreatorNotes(atomicNotes);
    if (notes.length !== atomicNotes.length) {
      contentRoles.nonEditorialNotesDropped += atomicNotes.length - notes.length;
    }

    const finalEvidence = {
      notesWithSourceEvidence: notes.filter(
        (note) => Boolean(note.sourceExcerpt) && note.sourceSegmentIndexes.length > 0,
      ).length,
      notesWithoutSourceEvidence: notes.filter(
        (note) => !note.sourceExcerpt || note.sourceSegmentIndexes.length === 0,
      ).length,
      invalidSourceSegmentReferences: evidenceDiagnostics.invalidSourceSegmentReferences,
      exactQuotesRequested: evidenceDiagnostics.exactQuotesRequested,
      exactQuotesVerified: evidenceDiagnostics.exactQuotesVerified,
      exactQuotesRejected: evidenceDiagnostics.exactQuotesRejected,
      quoteVerificationRejected: evidenceDiagnostics.quoteVerificationRejected,
      groundingRejected: evidenceDiagnostics.groundingRejected,
      unsupportedNumberRejected: evidenceDiagnostics.unsupportedNumberRejected,
      compoundRejected: evidenceDiagnostics.compoundRejected,
      wideEvidenceWindows: evidenceDiagnostics.wideEvidenceWindows,
      semanticRejected: evidenceDiagnostics.semanticRejected,
      semanticActorMismatch: evidenceDiagnostics.semanticActorMismatch,
      semanticRelationReversed: evidenceDiagnostics.semanticRelationReversed,
      semanticAttributionMismatch: evidenceDiagnostics.semanticAttributionMismatch,
      semanticModalityStrengthened: evidenceDiagnostics.semanticModalityStrengthened,
      semanticQuantityMismatch: evidenceDiagnostics.semanticQuantityMismatch,
      semanticUnsupportedInference: evidenceDiagnostics.semanticUnsupportedInference,
      semanticOther: evidenceDiagnostics.semanticOther,
    };
    const status = creatorNotesRunStatus({ failedChunks: ai.failedChunks, noteCount: notes.length });

    const completedAt = now().toISOString();
    const errorMessage =
      status === 'failed'
        ? chunkErrors[0] || 'no_useful_extraction'
        : status === 'partial'
          ? chunkErrors[0] || 'partial_extraction'
          : null;

    let notesWritten = 0;
    if (!dryRun && store) {
      if (status === 'success') {
        const inserted = await store.insertNotes(notes);
        notesWritten = inserted.written;
      }
      await store.updateRun(runId, {
        status,
        notesCreated: notesWritten,
        completedAt,
        errorMessage,
      });
      logEvent(log, '[creator-notes]', status === 'success' ? 'persistence success' : 'persistence skipped', {
        runId,
        notesWritten,
        status,
      });
    }

    logEvent(log, '[creator-notes]', 'run complete', {
      runId: dryRun ? null : runId,
      status,
      notes: notes.length,
    });

    return {
      source,
      ai,
      performance: finalizeExtractionPerformance(performance),
      notes,
      kindCounts: countNoteKinds(notes),
      kindDiagnostics,
      validationRejected,
      duplicatesRemoved: deduped.duplicatesRemoved,
      evidenceDiagnostics: finalEvidence,
      quoteDiagnostics: quoteDiagnosticsFromEvidence(finalEvidence),
      persistence: {
        dryRun,
        priorEquivalentRunId: dryRun ? null : equivalent?.id ?? null,
        runId: dryRun ? null : runId,
        notesWritten: dryRun ? 0 : notesWritten,
        status,
      },
      contentRoles,
    };
  } catch (error) {
    if (!dryRun && store) {
      await store.updateRun(runId, {
        status: 'failed',
        notesCreated: 0,
        completedAt: now().toISOString(),
        errorMessage: clipError(error),
      });
    }
    throw error;
  }
}
