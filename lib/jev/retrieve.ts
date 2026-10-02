import { noteContentEligibility } from '@/lib/creatorNotes/contentRole';
import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { buildNoteContexts } from '@/lib/eventThreads/context';
import {
  clusterEntriesIntoThreads,
  identityFromEntry,
  rankIdentityCandidates,
  type ThreadIdentity,
} from '@/lib/eventThreads/identity';
import { resolveNoteDeterministically } from '@/lib/eventThreads/resolve';
import type { EventThreadSourceMeta, ResolvedThreadEntry } from '@/lib/eventThreads/types';
import { JEV_DECISION_CANDIDATE_LIMIT, JEV_RETRIEVED_CANDIDATE_LIMIT } from '@/lib/jev/constants';

export type PreparedShadowNote = {
  note: CreatorAtomicNote;
  entry: ResolvedThreadEntry;
  identity: ThreadIdentity;
};

export type RankedShadowCandidate = {
  id: string;
  note: CreatorAtomicNote;
  identity: ThreadIdentity;
  score: number;
  rank: number;
};

export type NoteCandidateSets = {
  noteId: string;
  retrieved: RankedShadowCandidate[];
  jev: RankedShadowCandidate[];
};

export function sourceMetaForNotes(sourceItemId: string, notes: CreatorAtomicNote[]): EventThreadSourceMeta {
  const first = notes[0];
  return {
    sourceItemId,
    creatorId: first?.creatorId ?? null,
    creatorName: first?.attribution ?? null,
    title: null,
    url: null,
    publishedAt: first?.createdAt ?? null,
  };
}

export function prepareEditorialNotes(
  notes: readonly CreatorAtomicNote[],
  source: EventThreadSourceMeta,
): PreparedShadowNote[] {
  const editorial = notes.filter((note) => noteContentEligibility(note).eligibleForEventThreads);
  const contexts = buildNoteContexts({ notes: editorial, source });
  const prepared: PreparedShadowNote[] = [];
  for (const context of contexts) {
    const entry = resolveNoteDeterministically(context);
    if (!entry.atomicNoteId) continue;
    prepared.push({
      note: context.note,
      entry,
      identity: identityFromEntry(entry),
    });
  }
  return prepared;
}

export function prepareCorpus(
  groups: Array<{ sourceItemId: string; notes: readonly CreatorAtomicNote[] }>,
): PreparedShadowNote[] {
  const prepared: PreparedShadowNote[] = [];
  for (const group of groups) {
    const notes = [...group.notes];
    prepared.push(...prepareEditorialNotes(notes, sourceMetaForNotes(group.sourceItemId, notes)));
  }
  return prepared;
}

export function candidateSetsForNote(prepared: readonly PreparedShadowNote[], noteId: string): NoteCandidateSets {
  const query = prepared.find((item) => item.note.id === noteId);
  if (!query) {
    return { noteId, retrieved: [], jev: [] };
  }
  const pool = prepared
    .filter((item) => item.note.id !== noteId)
    .map((item) => ({
      id: item.note.id,
      note: item.note,
      identity: item.identity,
    }));
  const retrieved = rankIdentityCandidates(query.identity, pool, JEV_RETRIEVED_CANDIDATE_LIMIT);
  return {
    noteId,
    retrieved,
    jev: retrieved.slice(0, JEV_DECISION_CANDIDATE_LIMIT),
  };
}

export function v1ThreadIdByNote(prepared: readonly PreparedShadowNote[]): Map<string, string> {
  const threads = clusterEntriesIntoThreads(prepared.map((item) => item.entry));
  const threadByNote = new Map<string, string>();
  for (const thread of threads) {
    for (const entry of thread.entries) {
      if (entry.atomicNoteId) threadByNote.set(entry.atomicNoteId, thread.id);
    }
  }
  return threadByNote;
}
