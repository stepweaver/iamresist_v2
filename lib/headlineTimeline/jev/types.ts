import type { HeadlineCandidate, HeadlineSourceKind } from '@/lib/headlineTimeline/types';

/**
 * Relation schema 2.
 * Schema 1 used `same_broader_topic` in place of `same_story` and `related_context`.
 * Do not remap that retired label onto either new label.
 */
export type HeadlineRelation =
  | 'same_event'
  | 'same_story'
  | 'related_context'
  | 'different'
  | 'unclear';

export const HEADLINE_RELATIONS: readonly HeadlineRelation[] = [
  'same_event',
  'same_story',
  'related_context',
  'different',
  'unclear',
];

/** Retired schema-1 choice. Kept only so callers can reject it instead of remapping it. */
export const RETIRED_HEADLINE_RELATION = 'same_broader_topic';

export type PairPrefilterDecision =
  | { action: 'deterministic_match'; reason: string }
  | { action: 'ask_jev'; reason: string }
  | { action: 'skip'; reason: string };

export type JevPairPolicyDecision =
  | { action: 'join'; reason: string }
  /** Evaluation report only. Not an event-cluster join and not a persisted story edge. */
  | { action: 'story_link'; reason: string }
  | { action: 'do_not_join'; reason: string }
  | { action: 'review'; reason: string };

/** Fields sent to Jev. Ids, URLs, and ranking metadata stay out. */
export type HeadlineJevStateItem = {
  title: string;
  description: string | null;
  publishedAt: string | null;
  sourceType: HeadlineSourceKind;
};

export type JevTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type JevClassificationSuccess = {
  ok: true;
  relation: HeadlineRelation;
  probabilities: Record<HeadlineRelation, number>;
  confidence: number;
  model: string;
  usage: JevTokenUsage | null;
  elapsedMs: number | null;
};

export type JevClassificationFailure = {
  ok: false;
  error: string;
  elapsedMs: number | null;
};

export type JevClassificationResult = JevClassificationSuccess | JevClassificationFailure;

export type JevCallOptions = {
  fetchImpl?: typeof fetch;
  /** Pass null to force a missing key even when TYPESAFE_API_KEY is set. */
  apiKey?: string | null;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
};

export type JevEvalPairRecord = {
  a: HeadlineCandidate;
  b: HeadlineCandidate;
  similarity: number;
  lexicalCluster: boolean;
  prefilter: PairPrefilterDecision;
  jev: JevClassificationResult;
  policy: JevPairPolicyDecision;
};

export type SkippedSampleKind = 'near_miss' | 'baseline';

/** A prefilter skip chosen for human review. It is not sent to Jev. */
export type SkippedPairSample = {
  a: HeadlineCandidate;
  b: HeadlineCandidate;
  similarity: number;
  lexicalCluster: boolean;
  prefilter: { action: 'skip'; reason: string };
  sampleKind: SkippedSampleKind;
};
