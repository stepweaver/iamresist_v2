import type { HeadlineCandidate, HeadlineChannel, HeadlineSourceKind } from '@/lib/headlineTimeline/types';

export const HEADLINE_JEV_CANDIDATE_SNAPSHOT_KIND = 'headline-jev-candidates';

export type HeadlineJevCandidateCounts = {
  intel: number;
  voices: number;
  newswire: number;
};

/** Frozen candidate corpus for Jev eval, human review, and threshold tuning. */
export type HeadlineJevCandidateSnapshot = {
  kind: typeof HEADLINE_JEV_CANDIDATE_SNAPSHOT_KIND;
  generatedAt: string;
  windowHours: number;
  warnings: string[];
  counts: HeadlineJevCandidateCounts;
  candidates: HeadlineCandidate[];
};

const SOURCE_KINDS = new Set<HeadlineSourceKind>(['creator', 'news']);
const CHANNELS = new Set<HeadlineChannel>(['voices', 'newswire', 'intel']);

function snapshotDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Default path for a live load that should be reused. Local calendar date. */
export function headlineJevCandidateSnapshotPath(now = new Date()): string {
  return `tmp/headline-jev-eval/candidates-${snapshotDate(now)}.json`;
}

export function buildHeadlineJevCandidateSnapshot(loaded: {
  candidates: HeadlineCandidate[];
  warnings: string[];
  windowHours: number;
  generatedAt: string;
  counts: HeadlineJevCandidateCounts;
}): HeadlineJevCandidateSnapshot {
  return {
    kind: HEADLINE_JEV_CANDIDATE_SNAPSHOT_KIND,
    generatedAt: loaded.generatedAt,
    windowHours: loaded.windowHours,
    warnings: loaded.warnings.slice(),
    counts: { ...loaded.counts },
    candidates: loaded.candidates.map((item) => ({ ...item })),
  };
}

function invalid(detail: string): Error {
  return new Error(`Invalid headline candidate snapshot: ${detail}`);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(`${label} must be a non-empty string`);
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw invalid(`${label} must be a string or null`);
  return value;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw invalid(`${label} must be a string`);
  return value;
}

function requireCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalid(`${label} must be a non-negative integer`);
  }
  return value;
}

function requireCandidate(value: unknown, index: number): HeadlineCandidate {
  if (value == null || typeof value !== 'object') throw invalid(`candidates[${index}] must be an object`);
  const row = value as Record<string, unknown>;
  const sourceKind = row.sourceKind;
  const channel = row.channel;
  if (typeof sourceKind !== 'string' || !SOURCE_KINDS.has(sourceKind as HeadlineSourceKind)) {
    throw invalid(`candidates[${index}].sourceKind must be creator or news`);
  }
  if (typeof channel !== 'string' || !CHANNELS.has(channel as HeadlineChannel)) {
    throw invalid(`candidates[${index}].channel must be voices, newswire, or intel`);
  }
  return {
    id: requireString(row.id, `candidates[${index}].id`),
    sourceId: requireString(row.sourceId, `candidates[${index}].sourceId`),
    sourceName: requireText(row.sourceName, `candidates[${index}].sourceName`),
    sourceKind: sourceKind as HeadlineSourceKind,
    channel: channel as HeadlineChannel,
    title: requireString(row.title, `candidates[${index}].title`),
    url: requireText(row.url, `candidates[${index}].url`),
    publishedAt: requireNullableString(row.publishedAt, `candidates[${index}].publishedAt`),
    summary: requireNullableString(row.summary, `candidates[${index}].summary`),
  };
}

/**
 * Read a snapshot written by the eval harness. Does not fetch feeds.
 * Rejects eval-result JSON and other files that are not this corpus format.
 */
export function parseHeadlineJevCandidateSnapshot(raw: string): HeadlineJevCandidateSnapshot {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid('malformed JSON');
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalid('expected an object');
  }
  const body = parsed as Record<string, unknown>;
  if (body.kind !== HEADLINE_JEV_CANDIDATE_SNAPSHOT_KIND) {
    throw invalid(`kind must be ${HEADLINE_JEV_CANDIDATE_SNAPSHOT_KIND}`);
  }
  if (!Array.isArray(body.candidates)) throw invalid('candidates must be an array');
  const counts = body.counts;
  if (counts == null || typeof counts !== 'object' || Array.isArray(counts)) {
    throw invalid('counts must be an object');
  }
  const countRow = counts as Record<string, unknown>;
  const windowHours = body.windowHours;
  if (typeof windowHours !== 'number' || !Number.isFinite(windowHours) || windowHours <= 0) {
    throw invalid('windowHours must be a positive number');
  }
  if (!Array.isArray(body.warnings) || body.warnings.some((warning) => typeof warning !== 'string')) {
    throw invalid('warnings must be an array of strings');
  }
  return {
    kind: HEADLINE_JEV_CANDIDATE_SNAPSHOT_KIND,
    generatedAt: requireString(body.generatedAt, 'generatedAt'),
    windowHours,
    warnings: body.warnings.slice(),
    counts: {
      intel: requireCount(countRow.intel, 'counts.intel'),
      voices: requireCount(countRow.voices, 'counts.voices'),
      newswire: requireCount(countRow.newswire, 'counts.newswire'),
    },
    candidates: body.candidates.map((row, index) => requireCandidate(row, index)),
  };
}
