import type {
  CreatorNoteKind,
  CreatorNoteRunStatus,
  VerificationStatus,
} from '@/lib/creatorNotes/constants';

export type { CreatorNoteKind, CreatorNoteRunStatus, VerificationStatus };

export interface CreatorNoteEventFeatures {
  actors: string[];
  action: string | null;
  object: string | null;
  institutions: string[];
  locations: string[];
  referencedDocuments: string[];
}

export interface CreatorTranscriptSegment {
  index: number;
  startSeconds: number | null;
  endSeconds: number | null;
  text: string;
}

export interface CreatorTranscriptInput {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  sourceIdentityKey: string | null;
  segments: CreatorTranscriptSegment[];
}

export interface CreatorTranscriptChunk {
  index: number;
  startSeconds: number | null;
  endSeconds: number | null;
  segments: CreatorTranscriptSegment[];
  segmentIndexes: number[];
  text: string;
  charCount: number;
}

/**
 * Model output after schema validation.
 * Not a persisted CreatorAtomicNote — no ids, fingerprints, or verification.
 */
export interface RawCreatorNote {
  kind: CreatorNoteKind;
  startSeconds: number | null;
  endSeconds: number | null;
  text: string;
  attribution: string | null;
  eventFeatures: CreatorNoteEventFeatures | null;
  exactQuote: string | null;
  sourceSegmentIndexes: number[];
}

export interface CreatorAtomicNote {
  id: string;
  sourceItemId: string;
  creatorId: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  kind: CreatorNoteKind;
  text: string;
  attribution: string | null;
  eventFeatures: CreatorNoteEventFeatures | null;
  exactQuote: string | null;
  sourceSegmentIndexes: number[];
  verificationStatus: VerificationStatus;
  extractionRunId: string;
  noteFingerprint: string;
  createdAt: string;
}

export interface CreatorNoteRun {
  id: string;
  sourceItemId: string;
  sourceIdentityKey: string | null;
  creatorId: string | null;
  modelProvider: string;
  modelName: string;
  extractionVersion: string;
  transcriptHash: string;
  status: CreatorNoteRunStatus;
  inputChars: number;
  notesCreated: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export type CreatorNoteKindCounts = Record<CreatorNoteKind, number>;

export interface CreatorNoteQuoteDiagnostics {
  requested: number;
  verified: number;
  rejected: number;
}

export interface CreatorNotesRunResult {
  source: {
    sourceItemId: string;
    creatorId: string | null;
    creatorName: string | null;
    title: string | null;
    url: string | null;
    transcriptSegments: number;
    transcriptChars: number;
    transcriptHash: string;
  };
  ai: {
    provider: string;
    model: string;
    extractionVersion: string;
    chunks: number;
    successfulChunks: number;
    failedChunks: number;
  };
  notes: CreatorAtomicNote[];
  kindCounts: CreatorNoteKindCounts;
  validationRejected: number;
  duplicatesRemoved: number;
  quoteDiagnostics: CreatorNoteQuoteDiagnostics;
  persistence: {
    dryRun: boolean;
    priorEquivalentRunId: string | null;
    runId: string | null;
    notesWritten: number;
    status: CreatorNoteRunStatus | 'skipped';
  };
}

export interface CreatorNotesExtractArgs {
  sourceItemId: string;
  transcriptFile: string;
  dryRun: boolean;
  force: boolean;
  limitNotes: number | null;
  json: boolean;
}

export interface CreatorNotesChunkExtractResult {
  notes: RawCreatorNote[];
  rejected: number;
}

export interface CreatorNotesStore {
  findEquivalentSuccessRun(input: {
    sourceItemId: string;
    transcriptHash: string;
    extractionVersion: string;
    modelProvider: string;
    modelName: string;
  }): Promise<CreatorNoteRun | null>;
  insertRun(run: CreatorNoteRun): Promise<void>;
  updateRun(
    id: string,
    patch: {
      status: CreatorNoteRunStatus;
      notesCreated: number;
      completedAt: string;
      errorMessage: string | null;
    },
  ): Promise<void>;
  insertNotes(notes: CreatorAtomicNote[]): Promise<{ written: number }>;
}
