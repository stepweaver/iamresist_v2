import { randomUUID } from 'node:crypto';

import { chunkCreatorTranscript } from '@/lib/creatorNotes/chunk';
import { CREATOR_NOTE_EXTRACTION_VERSION } from '@/lib/creatorNotes/constants';
import { createSupabaseCreatorNotesStore } from '@/lib/creatorNotes/db';
import {
  assertCreatorNotesAiConfigured,
  extractCreatorNotesChunk,
  resolveCreatorNotesAiConfig,
  type CreatorNotesAiConfig,
} from '@/lib/creatorNotes/extract';
import { hashCreatorTranscript, transcriptCharCount } from '@/lib/creatorNotes/identity';
import { countNoteKinds, dedupeRawCreatorNotes, emptyKindCounts, toAtomicNotes } from '@/lib/creatorNotes/postprocess';
import type {
  CreatorAtomicNote,
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
}) => Promise<CreatorNotesChunkExtractResult>;

export type CreatorNotesRunDeps = {
  extractChunk?: CreatorNotesExtractChunkFn;
  store?: CreatorNotesStore;
  now?: () => Date;
  id?: () => string;
  aiConfig?: CreatorNotesAiConfig;
  log?: (prefix: string, event: string, extra?: Record<string, unknown>) => void;
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
  const chunkErrors: string[] = [];

  try {
    for (const chunk of chunks) {
      logEvent(log, '[creator-notes]', 'chunk started', {
        index: chunk.index,
        chars: chunk.charCount,
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
      });
      try {
        const extracted = await extractChunk({
          transcript,
          chunk,
          chunkCount: chunks.length,
          config: aiConfig,
        });
        collected.push(...extracted.notes);
        validationRejected += extracted.rejected;
        ai.successfulChunks += 1;
        logEvent(log, '[creator-notes]', 'chunk succeeded', {
          index: chunk.index,
          notes: extracted.notes.length,
          rejected: extracted.rejected,
        });
        if (extracted.rejected > 0) {
          logEvent(log, '[creator-notes]', 'validation rejected count', {
            index: chunk.index,
            rejected: extracted.rejected,
          });
        }
      } catch (error) {
        ai.failedChunks += 1;
        chunkErrors.push(clipError(error));
        logEvent(log, '[creator-notes]', 'chunk failed', {
          index: chunk.index,
          error: clipError(error),
        });
      }
    }

    const deduped = dedupeRawCreatorNotes(collected);
    if (deduped.duplicatesRemoved > 0) {
      logEvent(log, '[creator-notes]', 'dedupe count', { removed: deduped.duplicatesRemoved });
    }

    let limited = deduped.notes;
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

    let notesWritten = 0;
    let status: CreatorNotesRunResult['persistence']['status'] = 'success';
    if (ai.failedChunks > 0 && notes.length === 0) status = 'failed';
    else if (ai.failedChunks > 0 || validationRejected > 0) status = 'partial';
    else if (notes.length === 0) status = 'failed';

    const completedAt = now().toISOString();
    const errorMessage =
      status === 'failed'
        ? chunkErrors[0] || 'no_useful_extraction'
        : status === 'partial'
          ? chunkErrors[0] || 'partial_validation'
          : null;

    if (!dryRun && store) {
      const inserted = await store.insertNotes(notes);
      notesWritten = inserted.written;
      await store.updateRun(runId, {
        status,
        notesCreated: notesWritten,
        completedAt,
        errorMessage,
      });
      logEvent(log, '[creator-notes]', 'persistence success', {
        runId,
        notesWritten,
        status,
      });
    }

    logEvent(log, '[creator-notes]', 'run complete', {
      runId: dryRun ? null : runId,
      status: dryRun ? 'success' : status,
      notes: notes.length,
    });

    return {
      source,
      ai,
      notes,
      kindCounts: countNoteKinds(notes),
      validationRejected,
      duplicatesRemoved: deduped.duplicatesRemoved,
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
