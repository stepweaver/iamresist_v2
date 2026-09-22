import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { EVENT_THREADS_NEIGHBOR_NOTE_LIMIT } from '@/lib/eventThreads/constants';
import type { EventThreadNoteContext, EventThreadSourceMeta, NeighborAtomicNote } from '@/lib/eventThreads/types';

function timestampRank(value: number | null | undefined): number {
  return value == null || !Number.isFinite(value) ? Number.POSITIVE_INFINITY : value;
}

export function sortNotesChronologically(notes: CreatorAtomicNote[]): CreatorAtomicNote[] {
  return [...notes].sort((a, b) => {
    const byStart = timestampRank(a.startSeconds) - timestampRank(b.startSeconds);
    if (byStart !== 0) return byStart;
    return String(a.id).localeCompare(String(b.id));
  });
}

function asNeighbor(note: CreatorAtomicNote): NeighborAtomicNote {
  return {
    id: note.id,
    kind: note.kind,
    text: note.text,
    attribution: note.attribution,
    startSeconds: note.startSeconds,
    sourceExcerpt: note.sourceExcerpt,
    eventFeatures: note.eventFeatures,
  };
}

export function evidenceWindowForNote(note: CreatorAtomicNote): string {
  return String(note.sourceExcerpt || note.sourceQuote || note.exactQuote || note.text || '').trim();
}

export function buildNoteContexts(input: {
  notes: CreatorAtomicNote[];
  source: EventThreadSourceMeta;
}): EventThreadNoteContext[] {
  const ordered = sortNotesChronologically(input.notes);
  const allowedNoteIds = new Set(ordered.map((note) => note.id));

  return ordered.map((note, index) => {
    const preceding = ordered
      .slice(0, index)
      .reverse()
      .find((candidate) => evidenceWindowForNote(candidate) && candidate.id !== note.id);
    const following = ordered
      .slice(index + 1)
      .find((candidate) => evidenceWindowForNote(candidate) && candidate.id !== note.id);

    const before = ordered
      .slice(Math.max(0, index - EVENT_THREADS_NEIGHBOR_NOTE_LIMIT), index)
      .map(asNeighbor);
    const after = ordered
      .slice(index + 1, index + 1 + EVENT_THREADS_NEIGHBOR_NOTE_LIMIT)
      .map(asNeighbor);

    return {
      note,
      evidenceWindow: evidenceWindowForNote(note),
      precedingWindow: preceding ? evidenceWindowForNote(preceding) : null,
      followingWindow: following ? evidenceWindowForNote(following) : null,
      neighboringNotes: [...before, ...after],
      source: input.source,
      allowedNoteIds,
    };
  });
}

export function suppliedContextText(context: EventThreadNoteContext): string {
  const parts = [
    context.note.text,
    context.evidenceWindow,
    context.precedingWindow,
    context.followingWindow,
    ...context.neighboringNotes.map((note) => `${note.text}\n${note.sourceExcerpt || ''}`),
    context.source.creatorName,
    context.note.attribution,
    ...(context.note.eventFeatures?.actors || []),
    context.note.eventFeatures?.action,
    context.note.eventFeatures?.object,
    ...(context.note.eventFeatures?.institutions || []),
    ...(context.note.eventFeatures?.locations || []),
    ...(context.note.eventFeatures?.referencedDocuments || []),
  ];
  return parts.filter(Boolean).join('\n');
}
