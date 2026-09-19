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
  audioUrl?: string | null;
  transcriptSource?: PodcastTranscriptSourceName | 'youtube-captions' | 'file' | null;
  transcriptUrl?: string | null;
  transcriptMimeType?: string | null;
  transcriptLanguage?: string | null;
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
  sourceExcerpt: string | null;
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
  sourceExcerpt: string | null;
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

export interface CreatorNoteEvidenceDiagnostics {
  notesWithSourceEvidence: number;
  notesWithoutSourceEvidence: number;
  invalidSourceSegmentReferences: number;
  exactQuotesRequested: number;
  exactQuotesVerified: number;
  exactQuotesRejected: number;
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
  evidenceDiagnostics: CreatorNoteEvidenceDiagnostics;
  quoteDiagnostics: CreatorNoteQuoteDiagnostics;
  persistence: {
    dryRun: boolean;
    priorEquivalentRunId: string | null;
    runId: string | null;
    notesWritten: number;
    status: CreatorNoteRunStatus | 'skipped';
  };
  transcriptAcquisition?: TranscriptAcquisitionDiagnostics | null;
}

export type CreatorTranscriptProviderName = 'youtube' | 'podcast' | 'unknown';

export type PodcastTranscriptCandidateSource = 'podcast_namespace' | 'rss_explicit' | 'official_page';

export type PodcastTranscriptCandidate = {
  url: string;
  mimeType: string | null;
  language: string | null;
  rel: string | null;
  source: PodcastTranscriptCandidateSource;
};

export interface PodcastEpisodeSource {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  feedUrl: string;
  guid: string | null;
  title: string;
  episodeUrl: string | null;
  audioUrl: string | null;
  publishedAt: string | null;
  transcriptCandidates: PodcastTranscriptCandidate[];
}

export type PodcastTranscriptStatus =
  | 'TRANSCRIPT_AVAILABLE'
  | 'TRANSCRIPT_UNAVAILABLE'
  | 'TRANSCRIPT_FETCH_FAILED'
  | 'TRANSCRIPT_FORMAT_UNSUPPORTED'
  | 'TRANSCRIPT_PARSE_FAILED'
  | 'TRANSCRIPT_EMPTY';

export type PodcastTranscriptSourceName = 'podcast_namespace' | 'official_creator_page';

export interface ResolvedCreatorSource {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  title: string | null;
  url: string;
  publishedAt: string | null;
  provider: CreatorTranscriptProviderName;
  externalId: string | null;
}

export type TranscriptGeneratedFlag = 'yes' | 'no' | 'unknown';

export interface TranscriptAcquisitionDiagnostics {
  source: 'file' | 'youtube-captions' | 'podcast_namespace' | 'official_creator_page';
  language: string | null;
  generated: TranscriptGeneratedFlag;
  rawSegments: number;
  normalizedSegments: number;
  durationCoveredSeconds: number | null;
  characters: number;
  transcriptUrl?: string | null;
  transcriptMimeType?: string | null;
  transcriptLanguage?: string | null;
}

export interface CreatorNotesExtractArgs {
  sourceItemId: string;
  transcriptFile: string | null;
  dryRun: boolean;
  force: boolean;
  limitNotes: number | null;
  json: boolean;
  creatorName: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

export interface CreatorNotesSourcesArgs {
  limit: number;
}

export interface CreatorNotesPodcastSourcesArgs {
  limit: number;
}

export interface CreatorNotesPodcastExtractArgs {
  sourceItemId: string;
  dryRun: boolean;
  force: boolean;
  limitNotes: number | null;
  json: boolean;
  creatorName: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

export interface CreatorNotesBatchArgs {
  limit: number;
  dryRun: boolean;
  force: boolean;
  creator: string | null;
  sinceHours: number;
  json: boolean;
}

export interface CreatorNotesReviewArgs {
  limit: number;
  creator: string | null;
  kind: CreatorNoteKind | null;
  sinceHours: number | null;
  sourceItemId: string | null;
  json: boolean;
}

export type CreatorNotesCaptionFailureReason =
  | 'no_captions'
  | 'fetch_error'
  | 'malformed_captions'
  | 'empty_transcript';

export type CreatorNotesBatchItemOutcome =
  | 'processed'
  | 'already_processed'
  | 'no_captions'
  | 'failed';

export interface CreatorNotesBatchItemResult {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  outcome: CreatorNotesBatchItemOutcome;
  captionFailure: CreatorNotesCaptionFailureReason | null;
  error: string | null;
  notes: number;
  notesWritten: number;
  runId: string | null;
  transcriptChars: number;
  chunks: number;
  captionTracksFetched: number;
  evidenceDiagnostics: CreatorNoteEvidenceDiagnostics | null;
  quoteDiagnostics: CreatorNoteQuoteDiagnostics | null;
  sequential: true;
}

export interface CreatorNotesCreatorDistributionRow {
  creatorId: string | null;
  creatorName: string | null;
  items: number;
  notes: number;
}

export interface CreatorNotesBatchSummary {
  candidateVoiceItems: number;
  processed: number;
  alreadyProcessed: number;
  noCaptions: number;
  failed: number;
  captionFailures: Record<CreatorNotesCaptionFailureReason, number>;
  transcripts: {
    captionTracksFetched: number;
    charactersProcessed: number;
    chunks: number;
  };
  notes: CreatorNoteKindCounts & { total: number };
  evidence: {
    notesWithSourceEvidence: number;
    notesWithoutSourceEvidence: number;
    exactQuotesVerified: number;
    exactQuotesRejected: number;
  };
  persistence: {
    dryRun: boolean;
    runsCreated: number;
    notesWritten: number;
  };
  creators: CreatorNotesCreatorDistributionRow[];
  duration: {
    totalMs: number;
    averagePerItemMs: number | null;
  };
}

export interface CreatorNotesBatchResult {
  ok: boolean;
  overallStatus: 'success' | 'partial' | 'failed' | 'skipped';
  lockBusy: boolean;
  skipReason: string | null;
  summary: CreatorNotesBatchSummary;
  items: CreatorNotesBatchItemResult[];
}

export type CreatorNotesPodcastBatchItemOutcome =
  | 'processed'
  | 'already_processed'
  | 'transcript_unavailable'
  | 'failed';

export interface CreatorNotesPodcastBatchItemResult {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  title: string | null;
  episodeUrl: string | null;
  audioUrl: string | null;
  publishedAt: string | null;
  outcome: CreatorNotesPodcastBatchItemOutcome;
  transcriptStatus: PodcastTranscriptStatus | null;
  transcriptSource: PodcastTranscriptSourceName | null;
  transcriptUrl: string | null;
  error: string | null;
  notes: number;
  notesWritten: number;
  runId: string | null;
  transcriptChars: number;
  chunks: number;
  evidenceDiagnostics: CreatorNoteEvidenceDiagnostics | null;
  quoteDiagnostics: CreatorNoteQuoteDiagnostics | null;
  sequential: true;
}

export interface CreatorNotesPodcastBatchSummary {
  candidateEpisodes: number;
  processed: number;
  alreadyProcessed: number;
  transcriptUnavailable: number;
  failed: number;
  transcriptStatuses: Record<PodcastTranscriptStatus, number>;
  transcripts: {
    charactersProcessed: number;
    chunks: number;
  };
  notes: CreatorNoteKindCounts & { total: number };
  evidence: {
    notesWithSourceEvidence: number;
    notesWithoutSourceEvidence: number;
    exactQuotesVerified: number;
    exactQuotesRejected: number;
  };
  persistence: {
    dryRun: boolean;
    runsCreated: number;
    notesWritten: number;
  };
  creators: CreatorNotesCreatorDistributionRow[];
  duration: {
    totalMs: number;
    averagePerItemMs: number | null;
  };
}

export interface CreatorNotesPodcastBatchResult {
  ok: boolean;
  overallStatus: 'success' | 'partial' | 'failed' | 'skipped';
  lockBusy: boolean;
  skipReason: string | null;
  summary: CreatorNotesPodcastBatchSummary;
  items: CreatorNotesPodcastBatchItemResult[];
}

export interface PodcastSourceListRow {
  sourceItemId: string;
  creatorName: string | null;
  creatorId: string | null;
  title: string;
  publishedAt: string | null;
  transcriptDiscovered: boolean;
  transcriptSource: PodcastTranscriptCandidateSource | PodcastTranscriptSourceName | null;
  audioUrlPresent: boolean;
  episodeUrl: string | null;
  audioUrl: string | null;
}

export interface CreatorNotesReviewGroup {
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  title: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  runId: string | null;
  notes: CreatorAtomicNote[];
}

export interface CreatorNotesReviewResult {
  groups: CreatorNotesReviewGroup[];
  noteCount: number;
  readOnly: true;
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
