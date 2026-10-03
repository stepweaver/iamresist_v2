import { resolveJevApiKey } from '@/lib/headlineTimeline/jev/client';
import { classifyHeadlinePair } from '@/lib/headlineTimeline/jev/classifyPair';
import { prefilterHeadlinePair } from '@/lib/headlineTimeline/jev/prefilter';
import { decideJevPairPolicy } from '@/lib/headlineTimeline/jev/policy';
import { selectSkippedSamples, type SkippedPairDraft } from '@/lib/headlineTimeline/jev/sampleSkipped';
import { isSameSourcePair, jevPairSourceBucket } from '@/lib/headlineTimeline/jev/sourcePriority';
import type { JevCallOptions, JevEvalPairRecord, PairPrefilterDecision, SkippedPairSample } from '@/lib/headlineTimeline/jev/types';
import { compareTitles, timeMs } from '@/lib/headlineTimeline/similarity';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';
import { HEADLINE_TIMELINE_WINDOW_HOURS } from '@/lib/headlineTimeline/constants';

export type JevEvaluation = {
  candidateCount: number;
  possiblePairs: number;
  deterministicMatches: number;
  skippedPairs: number;
  askJevPairs: number;
  jevEvaluated: number;
  jevNotSent: number;
  joins: number;
  /** Policy count of same_story pairs. Not an event join. */
  storyLinks: number;
  sameEvent: number;
  sameStory: number;
  relatedContext: number;
  different: number;
  /** Unclear choices plus failed Jev calls. */
  unclearOrReview: number;
  /** Unclear choices only. Failures stay in failures and unclearOrReview. */
  unclear: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  usageMissing: number;
  apiKeyPresent: boolean;
  skipReasons: Record<string, number>;
  pairs: JevEvalPairRecord[];
  /** ask_jev pairs whose sources differ. The full queue, not only the calls sent. */
  crossSourceJevCandidates: number;
  /** ask_jev pairs from one source. Kept in the queue and ordered last. */
  sameSourceJevCandidates: number;
  nearMissSamples: number;
  baselineSamples: number;
  skippedSamples: SkippedPairSample[];
};

type AskQueued = {
  a: HeadlineCandidate;
  b: HeadlineCandidate;
  decision: Extract<PairPrefilterDecision, { action: 'ask_jev' }>;
  order: number;
};

function orderedCandidates(candidates: HeadlineCandidate[]): HeadlineCandidate[] {
  return candidates.slice().sort((a, b) => {
    const left = timeMs(a.publishedAt) ?? Number.NEGATIVE_INFINITY;
    const right = timeMs(b.publishedAt) ?? Number.NEGATIVE_INFINITY;
    if (left !== right) return right - left;
    return a.id.localeCompare(b.id);
  });
}

function bump(counts: Record<string, number>, reason: string) {
  counts[reason] = (counts[reason] || 0) + 1;
}

/**
 * Shadow evaluation. Reads candidates, classifies ask_jev pairs, and returns a report.
 * It does not write clusters, ranks, notes, or database rows.
 */
export async function evaluateHeadlinePairs(
  candidates: HeadlineCandidate[],
  options: JevCallOptions & {
    limit?: number;
    /** Prefilter skips to print for review. Default 0. Never calls Jev. */
    sampleSkipped?: number;
    windowHours?: number;
    onClassified?: (record: JevEvalPairRecord, index: number) => void;
  } = {},
): Promise<JevEvaluation> {
  const windowHours = options.windowHours ?? HEADLINE_TIMELINE_WINDOW_HOURS;
  const limit = options.limit == null ? Number.POSITIVE_INFINITY : options.limit;
  const sampleSkipped = options.sampleSkipped ?? 0;
  if (!Number.isInteger(sampleSkipped) || sampleSkipped < 0) {
    throw new Error('sampleSkipped must be a non-negative integer');
  }
  const items = orderedCandidates(candidates);
  const skipReasons: Record<string, number> = {};
  const askQueue: AskQueued[] = [];
  const skipQueue: SkippedPairDraft[] = [];
  let deterministicMatches = 0;
  let skippedPairs = 0;

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const decision = prefilterHeadlinePair(items[i], items[j], windowHours);
      if (decision.action === 'skip') {
        skippedPairs += 1;
        bump(skipReasons, decision.reason);
        if (sampleSkipped > 0) {
          const similarity = compareTitles(items[i].title, items[j].title, {
            a: items[i].publishedAt,
            b: items[j].publishedAt,
            windowHours,
          });
          skipQueue.push({
            a: items[i],
            b: items[j],
            similarity: similarity.score,
            lexicalCluster: similarity.cluster,
            reason: decision.reason,
            order: skipQueue.length,
          });
        }
        continue;
      }
      if (decision.action === 'deterministic_match') {
        deterministicMatches += 1;
        continue;
      }
      askQueue.push({
        a: items[i],
        b: items[j],
        decision,
        order: askQueue.length,
      });
    }
  }

  // Cross-source pairs spend the eval budget first. Same-source pairs stay, last.
  // Encounter order is preserved inside each bucket. This does not cluster /brief.
  const rankedAsks = askQueue.slice().sort((left, right) => {
    const bucket = jevPairSourceBucket(left.a, left.b) - jevPairSourceBucket(right.a, right.b);
    if (bucket !== 0) return bucket;
    return left.order - right.order;
  });
  let crossSourceJevCandidates = 0;
  let sameSourceJevCandidates = 0;
  for (const queued of rankedAsks) {
    if (isSameSourcePair(queued.a, queued.b)) sameSourceJevCandidates += 1;
    else crossSourceJevCandidates += 1;
  }

  const pairs: JevEvalPairRecord[] = [];
  const sendCount = Number.isFinite(limit) ? Math.min(limit, rankedAsks.length) : rankedAsks.length;
  for (let index = 0; index < sendCount; index += 1) {
    const queued = rankedAsks[index];
    const similarity = compareTitles(queued.a.title, queued.b.title, {
      a: queued.a.publishedAt,
      b: queued.b.publishedAt,
      windowHours,
    });
    const jev = await classifyHeadlinePair(queued.a, queued.b, options);
    const policy = decideJevPairPolicy(jev);
    const record: JevEvalPairRecord = {
      a: queued.a,
      b: queued.b,
      similarity: similarity.score,
      lexicalCluster: similarity.cluster,
      prefilter: queued.decision,
      jev,
      policy,
    };
    pairs.push(record);
    options.onClassified?.(record, pairs.length);
  }

  const skippedSamples = selectSkippedSamples(skipQueue, sampleSkipped);
  const nearMissSamples = skippedSamples.filter((sample) => sample.sampleKind === 'near_miss').length;
  const baselineSamples = skippedSamples.filter((sample) => sample.sampleKind === 'baseline').length;

  let joins = 0;
  let storyLinks = 0;
  let sameEvent = 0;
  let sameStory = 0;
  let relatedContext = 0;
  let different = 0;
  let unclear = 0;
  let unclearOrReview = 0;
  let failures = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let usageMissing = 0;

  for (const pair of pairs) {
    if (!pair.jev.ok) {
      failures += 1;
      unclearOrReview += 1;
      continue;
    }
    if (pair.jev.usage) {
      inputTokens += pair.jev.usage.inputTokens;
      outputTokens += pair.jev.usage.outputTokens;
    } else {
      usageMissing += 1;
    }
    if (pair.policy.action === 'join') joins += 1;
    if (pair.policy.action === 'story_link') storyLinks += 1;
    switch (pair.jev.relation) {
      case 'same_event':
        sameEvent += 1;
        break;
      case 'same_story':
        sameStory += 1;
        break;
      case 'related_context':
        relatedContext += 1;
        break;
      case 'different':
        different += 1;
        break;
      case 'unclear':
        unclear += 1;
        unclearOrReview += 1;
        break;
      default: {
        const unexpected: never = pair.jev.relation;
        throw new Error(`unexpected relation ${String(unexpected)}`);
      }
    }
  }

  const possiblePairs = items.length < 2 ? 0 : (items.length * (items.length - 1)) / 2;
  const apiKey = resolveJevApiKey(options.apiKey);

  return {
    candidateCount: items.length,
    possiblePairs,
    deterministicMatches,
    skippedPairs,
    askJevPairs: rankedAsks.length,
    jevEvaluated: pairs.length,
    jevNotSent: Math.max(0, rankedAsks.length - pairs.length),
    joins,
    storyLinks,
    sameEvent,
    sameStory,
    relatedContext,
    different,
    unclearOrReview,
    unclear,
    failures,
    inputTokens,
    outputTokens,
    usageMissing,
    apiKeyPresent: Boolean(apiKey),
    skipReasons,
    pairs,
    crossSourceJevCandidates,
    sameSourceJevCandidates,
    nearMissSamples,
    baselineSamples,
    skippedSamples,
  };
}
