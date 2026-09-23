import { randomUUID } from 'node:crypto';

import { noteContentEligibility } from '@/lib/creatorNotes/contentRole';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { ollamaChatJson } from '@/lib/themeMemory/ai/ollama';
import { applyChronology, assignEntryTime } from '@/lib/eventThreads/chronology';
import {
  eventThreadsAiTimeoutMs,
  eventThreadsModel,
  eventThreadsOllamaKeepAlive,
} from '@/lib/eventThreads/constants';
import { applyCorroborationSemantics } from '@/lib/eventThreads/corroboration';
import { buildNoteContexts } from '@/lib/eventThreads/context';
import { createDryRunEventThreadsWriter } from '@/lib/eventThreads/store';
import { emptyEventThreadsWrites, totalWrites } from '@/lib/eventThreads/writes';
import { countResolutionTypes } from '@/lib/eventThreads/format';
import { clusterEntriesIntoThreads } from '@/lib/eventThreads/identity';
import { attachIntelOsintLinks } from '@/lib/eventThreads/intelLinks';
import { rejectInvalidAtomicNoteId, resolveNoteDeterministically, resolveNoteWithOptionalAi } from '@/lib/eventThreads/resolve';
import type {
  EventThreadSourceMeta,
  EventThreadsAiConfig,
  EventThreadsBuildResult,
  EventThreadsNoteReader,
  EventThreadsWriter,
  LoadSourceMetaFn,
  ResolveNoteFn,
  SearchIntelOsintFn,
} from '@/lib/eventThreads/types';

export const EVENT_THREADS_PERSISTENCE_DISABLED =
  'Event Threads V1 persistence is disabled. Pass --dry-run.';

export function resolveEventThreadsAiConfig(): EventThreadsAiConfig {
  const provider = String(themeMemoryEnv.THEME_AI_PROVIDER || 'none').toLowerCase();
  return {
    provider,
    model: eventThreadsModel(themeMemoryEnv.OLLAMA_MODEL),
    baseUrl: themeMemoryEnv.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    timeoutMs: eventThreadsAiTimeoutMs(),
    retries: 0,
    keepAlive: eventThreadsOllamaKeepAlive(),
  };
}

function snapshotNotes(notes: CreatorAtomicNote[]): string {
  return JSON.stringify(
    notes.map((note) => ({
      id: note.id,
      text: note.text,
      kind: note.kind,
      sourceExcerpt: note.sourceExcerpt,
      exactQuote: note.exactQuote,
      sourceQuote: note.sourceQuote,
      sourceSegmentIndexes: note.sourceSegmentIndexes,
      verificationStatus: note.verificationStatus,
      noteFingerprint: note.noteFingerprint,
    })),
  );
}

function sourceMetaFromNotes(sourceItemId: string, notes: CreatorAtomicNote[]): EventThreadSourceMeta {
  const first = notes[0];
  return {
    sourceItemId,
    creatorId: first?.creatorId || null,
    creatorName: first?.attribution || null,
    title: null,
    url: null,
    publishedAt: first?.createdAt || null,
  };
}

export async function buildEventThreads(input: {
  sourceItemId: string;
  dryRun: boolean;
  reader: EventThreadsNoteReader;
  writer?: EventThreadsWriter;
  resolveNote?: ResolveNoteFn;
  searchIntel?: SearchIntelOsintFn | null;
  loadSourceMeta?: LoadSourceMetaFn;
  aiConfig?: EventThreadsAiConfig | null;
  now?: () => Date;
  id?: () => string;
}): Promise<EventThreadsBuildResult> {
  if (!input.dryRun) {
    throw new Error(EVENT_THREADS_PERSISTENCE_DISABLED);
  }

  const writer = input.writer || createDryRunEventThreadsWriter();
  const loaded = await input.reader.loadNotesBySourceItemId(input.sourceItemId);
  if (!loaded.length) {
    throw new Error(`No persisted Atomic Creator Notes for source-item ${input.sourceItemId}`);
  }
  const notes = loaded.filter((note) => noteContentEligibility(note).eligibleForEventThreads);
  if (!notes.length) {
    throw new Error(`No editorial Atomic Creator Notes for source-item ${input.sourceItemId}`);
  }

  const beforeSnapshot = snapshotNotes(notes);
  const source = (await input.loadSourceMeta?.(input.sourceItemId)) || sourceMetaFromNotes(input.sourceItemId, notes);
  source.sourceItemId = input.sourceItemId;

  const contexts = buildNoteContexts({ notes, source });
  const rejectedInvalidAtomicNoteIds: string[] = [];
  const resolved = [];
  for (const context of contexts) {
    const invalid = rejectInvalidAtomicNoteId(context, context.note.id);
    if (invalid) {
      rejectedInvalidAtomicNoteIds.push(context.note.id);
      continue;
    }
    const entry = input.resolveNote
      ? await input.resolveNote(context)
      : await resolveNoteWithOptionalAi(context, {
          aiConfig: input.aiConfig === undefined ? resolveEventThreadsAiConfig() : input.aiConfig,
          chatJson: input.aiConfig === null ? undefined : ollamaChatJson,
        });
    const timed = assignEntryTime({ context, entry, source });
    resolved.push({
      ...entry,
      occurredAt: timed.occurredAt,
      timeProvenance: timed.timeProvenance,
      identityTerms: entry.identityTerms,
      identityPhrases: entry.identityPhrases,
    });
  }

  const nextId = input.id || (() => randomUUID());
  let threads = clusterEntriesIntoThreads(resolved, nextId);
  threads = applyChronology(threads, source);
  threads = await attachIntelOsintLinks(threads, input.searchIntel ?? null, nextId);
  threads = applyCorroborationSemantics(threads);

  const afterSnapshot = snapshotNotes(notes);
  const notesMutated = beforeSnapshot === afterSnapshot ? 0 : notes.length;

  const resolutionTypeCounts = countResolutionTypes(threads);
  const uncertainResolutions = resolutionTypeCounts.uncertain;
  const intelOsintCandidateLinks = threads.reduce((sum, thread) => sum + thread.intelLinks.length, 0);

  return {
    sourceItemId: input.sourceItemId,
    atomicNotesConsidered: notes.length,
    threadsProposed: threads.length,
    threadEntriesProposed: threads.reduce((sum, thread) => sum + thread.entries.length, 0),
    resolutionTypeCounts,
    uncertainResolutions,
    intelOsintCandidateLinks,
    writes: { ...emptyEventThreadsWrites(), ...writer.writes },
    threads,
    rejectedInvalidAtomicNoteIds,
    persistence: {
      dryRun: true,
      enabled: false,
      notesMutated,
    },
  };
}

export function assertZeroWrites(result: EventThreadsBuildResult): void {
  if (totalWrites(result.writes) !== 0 || result.persistence.notesMutated !== 0) {
    throw new Error('Event Threads dry-run produced writes');
  }
}

export { resolveNoteDeterministically };
