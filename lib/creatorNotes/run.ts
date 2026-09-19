import { randomUUID } from 'node:crypto';

import { chunkCreatorTranscript, splitCreatorTranscriptChunk } from '@/lib/creatorNotes/chunk';
import { CREATOR_NOTE_EXTRACTION_VERSION, type CreatorNoteRunStatus } from '@/lib/creatorNotes/constants';
import { createSupabaseCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  assertCreatorNotesAiConfigured,
  extractCreatorNotesChunk,
  isCreatorNotesOllamaTimeout,
  resolveCreatorNotesAiConfig,
  type CreatorNotesAiConfig,
} from '@/lib/creatorNotes/extract';
import { applyKnownCreatorAttribution, hashCreatorTranscript, transcriptCharCount } from '@/lib/creatorNotes/identity';
import { countNoteKinds, dedupeRawCreatorNotes, emptyKindCounts, toAtomicNotes } from '@/lib/creatorNotes/postprocess';
import {
  acceptGroundedCreatorNotes,
  addEvidenceDiagnostics,
  emptyEvidenceDiagnostics,
  quoteDiagnosticsFromEvidence,
} from '@/lib/creatorNotes/sourceEvidence';
import type {
  CreatorAtomicNote,
  CreatorNoteEvidenceDiagnostics,
  CreatorNoteRun,
  CreatorNotesChunkExtractResult,
  CreatorNotesRunResult,
  CreatorNotesStore,
  CreatorTranscriptChunk,
  CreatorTranscriptInput,
  RawCreatorNote,
} from '@/lib/creatorNotes/types';
import { intelDbConfigured } from '@/lib/intel/db';

export type CreatorNotesExtractChunkFn = (input: {
  transcript: CreatorTranscriptInput;
  chunk: CreatorTranscriptChunk;
  chunkCount: number;
  config?: CreatorNotesAiConfig;
  repair?: boolean;
}) => Promise<CreatorNotesChunkExtractResult>;

export type CreatorNotesRunDeps = {
  extractChunk?: CreatorNotesExtractChunkFn;
  store?: CreatorNotesStore;
  now?: () => Date;
  id?: () => string;
  aiConfig?: CreatorNotesAiConfig;
  log?: (prefix: string, event: string, extra?: Record<string, unknown>) => void;
};

type ChunkProcessResult = {
  notes: RawCreatorNote[];
  rejected: number;
  diagnostics: CreatorNoteEvidenceDiagnostics;
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

export function creatorNotesRunStatus(input: {
  failedChunks: number;
  noteCount: number;
}): CreatorNoteRunStatus {
  if (input.failedChunks > 0 && input.noteCount > 0) return 'partial';
  if (input.failedChunks === 0 && input.noteCount > 0) return 'success';
  return 'failed';
}

export async function runCreatorNoteExtraction(
  input: {
    transcript: CreatorTranscriptInput;
    dryRun?: boolean;
    force?: boolean;
    limitNotes?: number | null;
  },
  deps: CreatorNotesRunDeps = {},
): Promise<CreatorNotesRunResult> {
  const dryRun = Boolean(input.dryRun);
  const force = Boolean(input.force);
  const transcript = input.transcript;
  const now = deps.now || (() => new Date());
  const nextId = deps.id || (() => randomUUID());
  const aiConfig = deps.aiConfig || resolveCreatorNotesAiConfig();
  const extractChunk = deps.extractChunk || extractCreatorNotesChunk;
  const log = deps.log;

  const transcriptHash = hashCreatorTranscript(transcript.segments);
  const transcriptChars = transcriptCharCount(transcript.segments);
  const chunks = chunkCreatorTranscript(transcript.segments);

  const source = {
    sourceItemId: transcript.sourceItemId,
    creatorId: transcript.creatorId,
    creatorName: transcript.creatorName,
    title: transcript.sourceTitle,
    url: transcript.sourceUrl,
    transcriptSegments: transcript.segments.length,
    transcriptChars,
    transcriptHash,
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
      validationRejected: 0,
      duplicatesRemoved: 0,
      evidenceDiagnostics: emptyEvidenceDiagnostics(),
      quoteDiagnostics: quoteDiagnosticsFromEvidence(emptyEvidenceDiagnostics()),
      persistence: {
        dryRun: false,
        priorEquivalentRunId: equivalent.id,
        runId: equivalent.id,
        notesWritten: 0,
        status: 'skipped',
      },
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
  const chunkErrors: string[] = [];

  async function extractAndGround(
    chunk: CreatorTranscriptChunk,
    repair: boolean,
  ): Promise<{ notes: RawCreatorNote[]; rejected: number; diagnostics: CreatorNoteEvidenceDiagnostics; proposed: number }> {
    const extracted = await extractChunk({
      transcript,
      chunk,
      chunkCount: chunks.length,
      config: aiConfig,
      repair,
    });
    const grounded = acceptGroundedCreatorNotes(extracted.notes, transcript.segments, {
      allowedSegmentIndexes: chunk.segmentIndexes,
    });
    return {
      notes: grounded.notes,
      rejected: extracted.rejected + grounded.rejected,
      diagnostics: grounded.diagnostics,
      proposed: extracted.notes.length,
    };
  }

  async function processChunk(
    chunk: CreatorTranscriptChunk,
    isRetry: boolean,
    childOffset: number | null,
  ): Promise<ChunkProcessResult> {
    logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk started' : 'chunk started', {
      index: chunk.index,
      childOffset,
      chars: chunk.charCount,
      startSeconds: chunk.startSeconds,
      endSeconds: chunk.endSeconds,
    });
    try {
      let result = await extractAndGround(chunk, false);
      if (result.proposed > 0 && result.notes.length === 0) {
        logEvent(log, '[creator-notes]', 'chunk grounding repair started', {
          index: chunk.index,
          childOffset,
          proposed: result.proposed,
        });
        result = await extractAndGround(chunk, true);
        logEvent(
          log,
          '[creator-notes]',
          result.notes.length ? 'chunk grounding repair completed' : 'chunk grounding repair failed',
          { index: chunk.index, childOffset, notes: result.notes.length, rejected: result.rejected },
        );
      }
      if (result.rejected > 0) {
        logEvent(log, '[creator-notes]', 'validation rejected count', {
          index: chunk.index,
          childOffset,
          rejected: result.rejected,
        });
      }
      logEvent(log, '[creator-notes]', isRetry ? 'retry child chunk completed' : 'chunk succeeded', {
        index: chunk.index,
        childOffset,
        notes: result.notes.length,
        rejected: result.rejected,
      });
      return {
        notes: result.notes,
        rejected: result.rejected,
        diagnostics: result.diagnostics,
        ok: true,
        error: null,
      };
    } catch (error) {
      if (isCreatorNotesOllamaTimeout(error) && !isRetry) {
        logEvent(log, '[creator-notes]', 'chunk timeout', {
          index: chunk.index,
          chars: chunk.charCount,
          error: clipError(error),
        });
        const children = splitCreatorTranscriptChunk(chunk);
        logEvent(log, '[creator-notes]', 'chunk split', {
          index: chunk.index,
          children: children.length,
          childChars: children.map((child) => child.charCount),
        });
        const merged: ChunkProcessResult = {
          notes: [],
          rejected: 0,
          diagnostics: emptyEvidenceDiagnostics(),
          ok: true,
          error: null,
        };
        for (let i = 0; i < children.length; i += 1) {
          const childResult = await processChunk(children[i], true, i);
          merged.notes.push(...childResult.notes);
          merged.rejected += childResult.rejected;
          addEvidenceDiagnostics(merged.diagnostics, childResult.diagnostics);
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
        childOffset,
        error: message,
      });
      return {
        notes: [],
        rejected: 0,
        diagnostics: emptyEvidenceDiagnostics(),
        ok: false,
        error: message,
      };
    }
  }

  try {
    for (const chunk of chunks) {
      const processed = await processChunk(chunk, false, null);
      collected.push(...processed.notes);
      validationRejected += processed.rejected;
      addEvidenceDiagnostics(evidenceDiagnostics, processed.diagnostics);
      if (processed.ok) ai.successfulChunks += 1;
      else {
        ai.failedChunks += 1;
        if (processed.error) chunkErrors.push(processed.error);
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
    const notes: CreatorAtomicNote[] = toAtomicNotes({
      notes: limited,
      sourceItemId: transcript.sourceItemId,
      creatorId: transcript.creatorId,
      extractionRunId: runId,
      createdAt,
      idFactory: nextId,
    });

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
      notes,
      kindCounts: countNoteKinds(notes),
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
