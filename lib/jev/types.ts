import type {
  JEV_EVENT_IDENTITY_RELATIONS,
  JEV_SPEECH_MODES,
  JEV_UPSTREAM_NOTE_STATUSES,
} from '@/lib/jev/constants';

export type JevEventIdentityRelation = (typeof JEV_EVENT_IDENTITY_RELATIONS)[number];
export type JevUpstreamNoteStatus = (typeof JEV_UPSTREAM_NOTE_STATUSES)[number];
export type JevSpeechMode = (typeof JEV_SPEECH_MODES)[number];
export type AtomicNoteQualityStatus = Exclude<JevUpstreamNoteStatus, 'usable'>;

export type JevNoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria: {
    true: string;
    false: string;
  };
};

export type JevChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};

export type JevQuestion = JevNoulQuestion | JevChoiceQuestion;

export type JevNoulAnswer = {
  type: 'noul';
  noul: number;
};

export type JevChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer;

export type JevUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type JevDecisionResult = {
  requestedModel: string;
  returnedModel: string;
  vendorRequestId: string | null;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
};

export type JevModelListing = {
  name: string;
  description: string | null;
  releaseDate: string | null;
};

/** Catalog row for the requested alias, captured from GET /v1/models before any decision. */
export type JevModelCatalogSnapshot = {
  requestedModel: string;
  modelCatalogName: string;
  modelCatalogReleaseDate: string;
  modelCatalogDescription: string | null;
};

export type JevModelValidation = JevModelCatalogSnapshot & {
  listedModels: string[];
};

export interface JevDecisionProvider {
  readonly requestedModel: string;
  validateModel(): Promise<JevModelValidation>;
  decide(input: {
    state: Record<string, unknown>;
    questions: Record<string, JevQuestion>;
  }): Promise<JevDecisionResult>;
}

export type JevFetch = (url: string, init: RequestInit) => Promise<Response>;

export type ShadowRecommendation = 'merge' | 'review_or_split';

export type NoteJudgmentState = {
  kind: string;
  text: string;
  evidence: string;
};

export type ShadowRetrievalSnapshot = {
  noteId: string;
  retrievedCandidateIds: string[];
  jevCandidateIds: string[];
};

/** Stored provenance a reviewer uses instead of a generated paraphrase. */
export type ShadowLabelProvenance = {
  id: string;
  sourceItemId: string;
  creatorId: string | null;
  creatorName: string | null;
  kind: string;
  contentRole: string | null;
  statementRole: 'creator' | 'quoted_speaker' | 'reported' | 'unknown' | null;
  attribution: string | null;
  quotedSpeaker: string | null;
  text: string;
  sourceQuote: string | null;
  sourceExcerpt: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  sourceSegmentIndexes: number[];
};

/**
 * Wider neighboring transcript text for attribution review.
 * Null when the original segments cannot be recovered. Not a substitute for sourceExcerpt.
 * `discourseContextSource` names the stored artifact that supplied the window.
 * `discourseContextFailureReason` is set whenever `discourseContext` is null.
 */
export type ShadowDiscourseContext = {
  discourseContext: string | null;
  discourseStartSeconds: number | null;
  discourseEndSeconds: number | null;
  discourseSegmentIndexes: number[] | null;
  discourseContextSource: string | null;
  discourseContextFailureReason: string | null;
};

/** One human quality judgment per Atomic Note, plus the stored provenance used to make it. */
export type ShadowNoteReview = ShadowLabelProvenance &
  ShadowDiscourseContext & {
    status: JevUpstreamNoteStatus | null;
    reviewReason: string | null;
    speechMode: JevSpeechMode | null;
    representedSpeaker: string | null;
    attributionReviewReason: string | null;
  };

export type ShadowLabelRow = {
  noteId: string;
  candidateId: string;
  relation: JevEventIdentityRelation | null;
  /**
   * Every candidate that should anchor this query to the same Event Thread.
   * Empty means the correct candidate choice is `new_event`.
   * Legacy `correctCandidateId` is still accepted when this array is absent.
   */
  correctCandidateIds: string[];
  /** Human-correct candidate, including one retrieval never proposed. */
  correctCandidateId: string | null;
  v1SameThread: boolean;
  overlapScore: number;
  retrievedRank: number | null;
  inJevSet: boolean;
};

export type AtomicNoteQualityFinding = {
  noteId: string;
  status: AtomicNoteQualityStatus;
};

export type ShadowLabelFile = {
  sourceItemIds: string[];
  /** Atomic Note quality, keyed once by note id. */
  notes: Record<string, ShadowNoteReview>;
  retrieval: ShadowRetrievalSnapshot[];
  rows: ShadowLabelRow[];
};

export type AtomicNoteQualityCounts = {
  usable: number;
  misattributed: number;
  unsupported: number;
  non_editorial: number;
  unclear: number;
};

export type SpeechModeCounts = {
  creator_assertion: number;
  creator_inference: number;
  quoted_other: number;
  paraphrased_other: number;
  hypothetical_or_sarcastic_other: number;
  unclear: number;
};

/** First JSONL line of a shadow run. Ties later scoring to the catalog release seen that day. */
export type ShadowRunMetadata = JevModelCatalogSnapshot & {
  recordType: 'run';
  evaluationRunId: string;
  returnedModels: string[];
  unexpectedReturnedModels: string[];
  /** Present on runs that apply usable-note eligibility. Absent on earlier logs. */
  semanticEligibility?: string;
};

export type ShadowEvaluationResult = {
  metadata: ShadowRunMetadata | null;
  records: ShadowDecisionRecord[];
  providerCalls: number;
  evaluatedQueryNoteIds: string[];
};

export type ShadowDecisionKind = 'pair' | 'candidate_choice';

export type ShadowDecisionRecord = {
  evaluationRunId: string;
  decisionId: string;
  requestedModel: string;
  returnedModel: string;
  vendorRequestId: string | null;
  noteId: string;
  candidateId: string | null;
  decisionKind: ShadowDecisionKind;
  retrievedCandidateIds: string[];
  jevCandidateIds: string[];
  questions: Record<string, JevQuestion>;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
  pairChoice: string | null;
  pairChoiceConfidence: number | null;
  sameEventNoul: number | null;
  candidateChoice: string | null;
  candidateChoiceConfidence: number | null;
  recommendations: Record<string, ShadowRecommendation>;
};

export type ShadowThresholdScore = {
  noul: number;
  falseMerges: number;
  falseSplits: number;
  policyMerges: number;
  /** Shown labeled pairs whose candidate Choice is an acceptable Event Thread anchor. */
  candidateChoiceAcceptable: number;
  /** Shown labeled pairs whose relationship Choice is same_event. */
  relationshipSameEvent: number;
  /** Shown labeled pairs whose Noul clears this threshold. */
  noulCleared: number;
};

export type ShadowQueryCandidateRecall = {
  /** Usable queries that have one or more acceptable same-event candidates. */
  queries: number;
  /** Queries where any acceptable candidate is in the raw top 10. */
  rawTop10: number;
  /** Queries where any acceptable candidate is in the raw top 5. */
  rawTop5: number;
};

export type ShadowCount = {
  correct: number;
  total: number;
};

export type ShadowReport = {
  labelRows: number;
  jevScoredRows: number;
  /** Query-level retrieval. A hit is any acceptable candidate, not a pair count. */
  queryCandidateRecall: ShadowQueryCandidateRecall;
  /** Queries with acceptable candidates that are absent from the raw top 5. */
  retrievalMisses: number;
  unlabeledShownPairIds: Array<{ noteId: string; candidateId: string }>;
  /** One judgment per evaluated query. Either any acceptable id, or new_event when none exist. */
  candidateChoiceAccuracy: ShadowCount;
  /** Human-labeled usable pairs actually shown to Jev. */
  pairRelationshipAccuracy: ShadowCount;
  v1FalseMerges: number;
  unlabeledShownPairs: number;
  atomicNoteQuality: {
    /** Unique notes in the review map. */
    notes: number;
    counts: AtomicNoteQualityCounts;
    speechMode: SpeechModeCounts;
    /** Usable notes whose proposition is quoted, paraphrased, or hypothetical other speech. */
    usableNonCreatorSpeech: number;
    /** creator_analysis notes later labeled as quoted, paraphrased, or hypothetical other speech. */
    creatorAnalysisLabeledAsOther: number;
    /** Notes whose speechMode is unclear: ownership could not be determined. */
    unclearOwnership: number;
    /** Notes whose neighboring transcript could not be recovered. */
    missingDiscourseContext: number;
    /** Pair rows left out of Jev accuracy because a side is not usable. */
    excludedRows: number;
    findings: AtomicNoteQualityFinding[];
  };
  thresholds: ShadowThresholdScore[];
};
