import type { CreatorAtomicNote, CreatorNoteEventFeatures } from '@/lib/creatorNotes/types';
import type {
  EventThreadConfidence,
  EventThreadEntryKind,
  EventThreadLinkKind,
  EventThreadResolutionType,
  EventThreadStatus,
  EventThreadTimeProvenance,
} from '@/lib/eventThreads/constants';

export type {
  EventThreadConfidence,
  EventThreadEntryKind,
  EventThreadLinkKind,
  EventThreadResolutionType,
  EventThreadStatus,
  EventThreadTimeProvenance,
};

export interface EventThreadSourceMeta {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
}

export interface NeighborAtomicNote {
  id: string;
  kind: CreatorAtomicNote['kind'];
  text: string;
  attribution: string | null;
  startSeconds: number | null;
  sourceExcerpt: string | null;
  eventFeatures: CreatorNoteEventFeatures | null;
}

export interface EventThreadNoteContext {
  note: CreatorAtomicNote;
  evidenceWindow: string;
  precedingWindow: string | null;
  followingWindow: string | null;
  neighboringNotes: NeighborAtomicNote[];
  source: EventThreadSourceMeta;
  allowedNoteIds: Set<string>;
}

export interface ResolvedThreadEntry {
  id: string;
  atomicNoteId: string | null;
  entryKind: EventThreadEntryKind;
  resolvedText: string;
  resolutionType: EventThreadResolutionType;
  occurredAt: string | null;
  timeProvenance: EventThreadTimeProvenance;
  sortOrder: number;
  creatorName: string | null;
  sourceUrl: string | null;
  listenAnchorSeconds: number | null;
  confidence: EventThreadConfidence;
  identityTerms: string[];
  identityPhrases: string[];
}

export interface ProposedEventThread {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: EventThreadStatus;
  startedAt: string | null;
  lastActivityAt: string | null;
  identityKey: string;
  identityFeatures: {
    distinctiveTerms: string[];
    distinctivePhrases: string[];
    genericEntities: string[];
  };
  creatorConvergenceCount: number;
  sourceCorroborationCount: number;
  creatorIds: string[];
  entries: ResolvedThreadEntry[];
  intelLinks: ProposedEventThreadSourceLink[];
}

export interface ProposedEventThreadSourceLink {
  id: string;
  sourceItemId: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  deskLane: string | null;
  linkKind: EventThreadLinkKind;
  matchSignals: string[];
  confidence: EventThreadConfidence;
  title: string | null;
  publishedAt: string | null;
}

export interface EventThreadsWriteCounts {
  eventThreads: number;
  eventThreadEntries: number;
  eventThreadSourceLinks: number;
  eventThreadEditorNotes: number;
  creatorAtomicNotes: number;
  themeMemory: number;
  ranking: number;
}

export interface EventThreadsBuildResult {
  sourceItemId: string;
  atomicNotesConsidered: number;
  threadsProposed: number;
  threadEntriesProposed: number;
  resolutionTypeCounts: Record<EventThreadResolutionType, number>;
  uncertainResolutions: number;
  intelOsintCandidateLinks: number;
  writes: EventThreadsWriteCounts;
  threads: ProposedEventThread[];
  rejectedInvalidAtomicNoteIds: string[];
  persistence: {
    dryRun: boolean;
    enabled: boolean;
    notesMutated: number;
  };
}

export interface EventThreadsBuildArgs {
  sourceItemId: string;
  dryRun: boolean;
  json: boolean;
}

export interface EventThreadsAiConfig {
  provider: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  keepAlive?: string;
}

export interface IntelOsintCandidate {
  id: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
  deskLane: string | null;
  sourceName: string | null;
}

export interface EventThreadsNoteReader {
  loadNotesBySourceItemId(sourceItemId: string): Promise<CreatorAtomicNote[]>;
}

export interface EventThreadsWriter {
  insertThreads(threads: ProposedEventThread[]): Promise<{ written: number }>;
  insertEntries(entries: Array<ResolvedThreadEntry & { threadId: string }>): Promise<{ written: number }>;
  insertSourceLinks(
    links: Array<ProposedEventThreadSourceLink & { threadId: string }>,
  ): Promise<{ written: number }>;
  insertEditorNotes(_notes: never[]): Promise<{ written: number }>;
  writes: EventThreadsWriteCounts;
}

export type ResolveNoteFn = (context: EventThreadNoteContext) => Promise<ResolvedThreadEntry> | ResolvedThreadEntry;

export type SearchIntelOsintFn = (input: {
  terms: string[];
  phrases: string[];
  publishedFrom: string | null;
  publishedTo: string | null;
  limit: number;
}) => Promise<IntelOsintCandidate[]>;

export type LoadSourceMetaFn = (sourceItemId: string) => Promise<EventThreadSourceMeta | null>;
