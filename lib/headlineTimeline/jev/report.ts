import { HEADLINE_JEV_RELATION_SCHEMA_VERSION } from '@/lib/headlineTimeline/jev/constants';
import type { JevEvaluation } from '@/lib/headlineTimeline/jev/evaluate';
import { HEADLINE_RELATIONS, type JevEvalPairRecord, type SkippedPairSample } from '@/lib/headlineTimeline/jev/types';
import type { HeadlineCandidate } from '@/lib/headlineTimeline/types';

function metric(label: string, value: string): string {
  return `${label.padEnd(20)}${value}`;
}

function summaryLine(value: string | null): string {
  const text = value?.trim();
  return text || '(no summary)';
}

function policyLabel(action: JevEvalPairRecord['policy']['action']): string {
  if (action === 'join') return 'JOIN';
  if (action === 'story_link') return 'STORY LINK';
  if (action === 'do_not_join') return 'DO NOT JOIN';
  return 'REVIEW';
}

function side(label: 'A' | 'B', item: HeadlineCandidate): string {
  return [
    `${label} — ${item.sourceName}`,
    item.title,
    summaryLine(item.summary),
  ].join('\n');
}

function skippedSide(label: 'A' | 'B', item: HeadlineCandidate): string {
  const lines = [`${label} — ${item.sourceName}`, item.title];
  const summary = item.summary?.trim();
  if (summary) lines.push(summary);
  return lines.join('\n');
}

function sampleKindLabel(kind: SkippedPairSample['sampleKind']): string {
  return kind === 'near_miss' ? 'near-miss' : 'baseline';
}

export function formatSkippedSample(sample: SkippedPairSample, index: number): string {
  const lines = [
    `SKIPPED SAMPLE ${index} — ${sampleKindLabel(sample.sampleKind)}`,
    '',
    skippedSide('A', sample.a),
    '',
    skippedSide('B', sample.b),
    '',
    'DETERMINISTIC',
    metric('similarity:', sample.similarity.toFixed(2)),
    metric('cluster:', String(sample.lexicalCluster)),
    '',
    'PREFILTER',
    'SKIP',
    `reason: ${sample.prefilter.reason}`,
    '',
  ];
  return lines.join('\n');
}

export function formatJevPair(record: JevEvalPairRecord, index: number): string {
  const lines = [
    `PAIR ${index}`,
    '',
    side('A', record.a),
    '',
    side('B', record.b),
    '',
    'DETERMINISTIC',
    metric('similarity:', record.similarity.toFixed(2)),
    metric('cluster:', String(record.lexicalCluster)),
    '',
    'JEV',
  ];

  if (!record.jev.ok) {
    lines.push(`unavailable: ${record.jev.error}`);
  } else {
    for (const relation of HEADLINE_RELATIONS) {
      lines.push(metric(relation, record.jev.probabilities[relation].toFixed(2)));
    }
    lines.push(metric('confidence', record.jev.confidence.toFixed(2)));
    const usage = record.jev.usage
      ? `${record.jev.usage.inputTokens} in / ${record.jev.usage.outputTokens} out`
      : 'not returned';
    const elapsed = record.jev.elapsedMs == null ? 'n/a' : `${record.jev.elapsedMs}ms`;
    lines.push(metric('model:', record.jev.model));
    lines.push(metric('tokens:', usage));
    lines.push(metric('elapsed:', elapsed));
  }

  lines.push('', 'POLICY', policyLabel(record.policy.action), '');
  return lines.join('\n');
}

export type HeadlineJevCorpusNote = {
  mode: 'live' | 'snapshot';
  /** Snapshot path read with --input, or the file just written by --save-candidates. */
  snapshot: string | null;
};

export function formatJevEvaluationReport(evaluation: JevEvaluation, opts?: {
  warnings?: string[];
  limit?: number;
  corpus?: HeadlineJevCorpusNote;
}): string {
  const header = [
    'Headline Jev evaluation (shadow)',
    'Read only. No headline, note, thread, theme, or ranking rows are written.',
    `relation schema: ${HEADLINE_JEV_RELATION_SCHEMA_VERSION}`,
  ];
  if (opts?.corpus?.mode === 'snapshot' && opts.corpus.snapshot) {
    header.push(`corpus: snapshot ${opts.corpus.snapshot}`);
  } else if (opts?.corpus?.mode === 'live' && opts.corpus.snapshot) {
    header.push(`corpus: live; candidates saved to ${opts.corpus.snapshot}`);
  } else if (opts?.corpus?.mode === 'live') {
    header.push('corpus: live');
  }
  if (!evaluation.apiKeyPresent) {
    header.push('TYPESAFE_API_KEY is not set. Jev was not called.');
  }
  if (opts?.warnings?.length) {
    header.push('Warnings:');
    for (const warning of opts.warnings) header.push(`- ${warning}`);
  }
  const body = evaluation.pairs.map((pair, index) => formatJevPair(pair, index + 1));
  const skippedBody = evaluation.skippedSamples.map((sample, index) => formatSkippedSample(sample, index + 1));
  const totals = [
    'TOTALS',
    `candidates loaded: ${evaluation.candidateCount}`,
    `possible pairs: ${evaluation.possiblePairs}`,
    `deterministic matches: ${evaluation.deterministicMatches}`,
    `skipped pairs: ${evaluation.skippedPairs}`,
    `skipped pool: ${evaluation.skippedPairs}`,
    `skipped samples: ${evaluation.skippedSamples.length}`,
    `near-miss samples: ${evaluation.nearMissSamples}`,
    `baseline samples: ${evaluation.baselineSamples}`,
    `jev-evaluated pairs: ${evaluation.jevEvaluated}`,
    `cross-source jev candidates: ${evaluation.crossSourceJevCandidates}`,
    `same-source jev candidates: ${evaluation.sameSourceJevCandidates}`,
    ...(opts?.limit != null ? [`jev call limit: ${opts.limit}`] : []),
    `jev not sent (limit): ${evaluation.jevNotSent}`,
    `jev proposed joins: ${evaluation.joins}`,
    `same event: ${evaluation.sameEvent}`,
    `same story: ${evaluation.sameStory}`,
    `story links: ${evaluation.storyLinks}`,
    `related context: ${evaluation.relatedContext}`,
    `different: ${evaluation.different}`,
    `unclear/review: ${evaluation.unclearOrReview}`,
    `api input tokens: ${evaluation.inputTokens}`,
    `api output tokens: ${evaluation.outputTokens}`,
    `usage missing: ${evaluation.usageMissing}`,
    `failures: ${evaluation.failures}`,
  ];
  return [...header, '', ...body, ...skippedBody, totals.join('\n'), ''].join('\n');
}

function skippedCandidateFields(item: HeadlineCandidate) {
  return {
    id: item.id,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    sourceKind: item.sourceKind,
    title: item.title,
    summary: item.summary,
    publishedAt: item.publishedAt,
  };
}

export function jevEvaluationArtifact(evaluation: JevEvaluation, opts?: {
  generatedAt?: string;
  windowHours?: number;
  limit?: number | null;
  sampleSkipped?: number | null;
  warnings?: string[];
  corpus?: HeadlineJevCorpusNote;
}) {
  return {
    milestone: 1 as const,
    shadow: true as const,
    schemaVersion: HEADLINE_JEV_RELATION_SCHEMA_VERSION,
    generatedAt: opts?.generatedAt ?? new Date().toISOString(),
    windowHours: opts?.windowHours ?? null,
    limit: opts?.limit ?? null,
    sampleSkipped: opts?.sampleSkipped ?? null,
    corpus: opts?.corpus ?? null,
    apiKeyPresent: evaluation.apiKeyPresent,
    warnings: opts?.warnings ?? [],
    totals: {
      candidatesLoaded: evaluation.candidateCount,
      possiblePairs: evaluation.possiblePairs,
      deterministicMatches: evaluation.deterministicMatches,
      skippedPairs: evaluation.skippedPairs,
      skippedPool: evaluation.skippedPairs,
      skippedSamples: evaluation.skippedSamples.length,
      nearMissSamples: evaluation.nearMissSamples,
      baselineSamples: evaluation.baselineSamples,
      askJevPairs: evaluation.askJevPairs,
      crossSourceJevCandidates: evaluation.crossSourceJevCandidates,
      sameSourceJevCandidates: evaluation.sameSourceJevCandidates,
      jevEvaluated: evaluation.jevEvaluated,
      jevNotSent: evaluation.jevNotSent,
      jevProposedJoins: evaluation.joins,
      storyLinks: evaluation.storyLinks,
      sameEvent: evaluation.sameEvent,
      sameStory: evaluation.sameStory,
      relatedContext: evaluation.relatedContext,
      different: evaluation.different,
      unclearOrReview: evaluation.unclearOrReview,
      relations: {
        same_event: evaluation.sameEvent,
        same_story: evaluation.sameStory,
        related_context: evaluation.relatedContext,
        different: evaluation.different,
        unclear: evaluation.unclear,
      },
      inputTokens: evaluation.inputTokens,
      outputTokens: evaluation.outputTokens,
      usageMissing: evaluation.usageMissing,
      failures: evaluation.failures,
    },
    skipReasons: evaluation.skipReasons,
    pairs: evaluation.pairs.map((pair, index) => ({
      index: index + 1,
      a: {
        id: pair.a.id,
        sourceName: pair.a.sourceName,
        sourceKind: pair.a.sourceKind,
        title: pair.a.title,
        summary: pair.a.summary,
        url: pair.a.url,
        publishedAt: pair.a.publishedAt,
      },
      b: {
        id: pair.b.id,
        sourceName: pair.b.sourceName,
        sourceKind: pair.b.sourceKind,
        title: pair.b.title,
        summary: pair.b.summary,
        url: pair.b.url,
        publishedAt: pair.b.publishedAt,
      },
      deterministic: {
        similarity: pair.similarity,
        cluster: pair.lexicalCluster,
        action: pair.prefilter.action,
        reason: pair.prefilter.reason,
      },
      jev: pair.jev,
      policy: pair.policy,
    })),
    skippedSamples: evaluation.skippedSamples.map((sample) => ({
      a: skippedCandidateFields(sample.a),
      b: skippedCandidateFields(sample.b),
      deterministic: {
        similarity: sample.similarity,
        cluster: sample.lexicalCluster,
      },
      prefilter: {
        action: 'skip' as const,
        reason: sample.prefilter.reason,
      },
      sampleKind: sample.sampleKind,
    })),
  };
}
