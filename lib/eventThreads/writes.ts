import type { EventThreadsWriteCounts } from '@/lib/eventThreads/types';

export function emptyEventThreadsWrites(): EventThreadsWriteCounts {
  return {
    eventThreads: 0,
    eventThreadEntries: 0,
    eventThreadSourceLinks: 0,
    eventThreadEditorNotes: 0,
    creatorAtomicNotes: 0,
    themeMemory: 0,
    ranking: 0,
  };
}

export function totalWrites(writes: EventThreadsWriteCounts): number {
  return (
    writes.eventThreads +
    writes.eventThreadEntries +
    writes.eventThreadSourceLinks +
    writes.eventThreadEditorNotes +
    writes.creatorAtomicNotes +
    writes.themeMemory +
    writes.ranking
  );
}
