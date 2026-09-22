import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { emptyEventThreadsWrites } from '@/lib/eventThreads/writes';
import type {
  EventThreadsNoteReader,
  EventThreadsWriter,
  ProposedEventThread,
  ProposedEventThreadSourceLink,
  ResolvedThreadEntry,
} from '@/lib/eventThreads/types';

function assertNeverWrite(table: string): never {
  throw new Error(`Event Threads V1 dry-run forbids writes to ${table}`);
}

export function createMemoryAtomicNotesReader(notes: CreatorAtomicNote[]): EventThreadsNoteReader {
  const frozen = notes.map((note) => structuredClone(note));
  return {
    async loadNotesBySourceItemId(sourceItemId: string) {
      return frozen.filter((note) => note.sourceItemId === sourceItemId).map((note) => structuredClone(note));
    },
  };
}

export function createDryRunEventThreadsWriter(): EventThreadsWriter {
  const writes = emptyEventThreadsWrites();
  return {
    writes,
    async insertThreads() {
      return assertNeverWrite('intel.event_threads');
    },
    async insertEntries() {
      return assertNeverWrite('intel.event_thread_entries');
    },
    async insertSourceLinks() {
      return assertNeverWrite('intel.event_thread_source_links');
    },
    async insertEditorNotes() {
      return assertNeverWrite('intel.event_thread_editor_notes');
    },
  };
}

export function createMemoryEventThreadsWriter(): EventThreadsWriter & {
  threads: ProposedEventThread[];
  entries: Array<ResolvedThreadEntry & { threadId: string }>;
  links: Array<ProposedEventThreadSourceLink & { threadId: string }>;
} {
  const writes = emptyEventThreadsWrites();
  const threads: ProposedEventThread[] = [];
  const entries: Array<ResolvedThreadEntry & { threadId: string }> = [];
  const links: Array<ProposedEventThreadSourceLink & { threadId: string }> = [];
  return {
    writes,
    threads,
    entries,
    links,
    async insertThreads(incoming) {
      writes.eventThreads += incoming.length;
      threads.push(...incoming.map((thread) => structuredClone(thread)));
      return { written: incoming.length };
    },
    async insertEntries(incoming) {
      writes.eventThreadEntries += incoming.length;
      entries.push(...incoming.map((entry) => structuredClone(entry)));
      return { written: incoming.length };
    },
    async insertSourceLinks(incoming) {
      writes.eventThreadSourceLinks += incoming.length;
      links.push(...incoming.map((link) => structuredClone(link)));
      return { written: incoming.length };
    },
    async insertEditorNotes(incoming) {
      writes.eventThreadEditorNotes += incoming.length;
      return { written: incoming.length };
    },
  };
}
