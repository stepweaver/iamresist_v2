import { JEV_DECISION_CANDIDATE_LIMIT, JEV_UPSTREAM_NOTE_STATUSES } from '@/lib/jev/constants';
import { candidateSetsForNote, type PreparedShadowNote, type RankedShadowCandidate } from '@/lib/jev/retrieve';
import type { JevUpstreamNoteStatus, ShadowLabelFile } from '@/lib/jev/types';

/** Recorded on each new run and printed by the report. */
export const JEV_SEMANTIC_ELIGIBILITY =
  'Semantic evaluation eligibility requires usable human Atomic Notes.';

const SKIPPED_STATUSES: readonly JevUpstreamNoteStatus[] = [
  'misattributed',
  'unsupported',
  'non_editorial',
  'unclear',
];

export type StatusGroup = {
  status: string;
  count: number;
  noteIds: string[];
};

export type JevQueryEligibility = {
  noteId: string;
  status: string;
  rawRetrievedIds: string[];
  rawJevIds: string[];
  /** Usable notes from the raw top 5, in retrieval order, original ranks kept. */
  semanticCandidates: RankedShadowCandidate[];
};

export type JevEvalEligibility = {
  queryNotesConsidered: string[];
  usableQueryNotes: string[];
  queryNotesSkippedByStatus: StatusGroup[];
  /** Raw top 10 slots for usable query notes. */
  rawRetrievedCandidates: number;
  /** Raw top 5 slots for usable query notes, before the usable-candidate filter. */
  rawTop5Candidates: number;
  usableCandidatesSent: number;
  candidatesSkippedByStatus: StatusGroup[];
  expectedJevQueryIds: string[];
  queries: JevQueryEligibility[];
};

export function isUsableAtomicNote(file: ShadowLabelFile, noteId: string): boolean {
  return file.notes[noteId]?.status === 'usable';
}

export function atomicNoteStatus(file: ShadowLabelFile, noteId: string): JevUpstreamNoteStatus | 'unlabeled' {
  const status = file.notes[noteId]?.status;
  if (status && (JEV_UPSTREAM_NOTE_STATUSES as readonly string[]).includes(status)) return status;
  return 'unlabeled';
}

/**
 * Drop candidates that are not human-usable.
 * Input order and each candidate's retrievedRank stay as retrieval assigned them.
 * The result is capped at the existing Jev candidate maximum.
 */
export function takeUsableCandidates<T extends { id: string }>(
  candidates: readonly T[],
  file: ShadowLabelFile,
): T[] {
  const kept: T[] = [];
  for (const candidate of candidates) {
    if (!isUsableAtomicNote(file, candidate.id)) continue;
    kept.push(candidate);
    if (kept.length >= JEV_DECISION_CANDIDATE_LIMIT) break;
  }
  return kept;
}

export function semanticCandidateIds(candidateIds: readonly string[], file: ShadowLabelFile): string[] {
  return takeUsableCandidates(
    candidateIds.map((id) => ({ id })),
    file,
  ).map((candidate) => candidate.id);
}

function queryIds(file: ShadowLabelFile, prepared: readonly PreparedShadowNote[]): string[] {
  const known = new Set(prepared.map((item) => item.note.id));
  const ids: string[] = [];
  for (const row of file.rows) {
    if (!known.has(row.noteId) || ids.includes(row.noteId)) continue;
    ids.push(row.noteId);
  }
  return ids;
}

function statusGroups(ids: readonly string[], statusOf: (id: string) => string): StatusGroup[] {
  const buckets = new Map<string, string[]>();
  for (const status of SKIPPED_STATUSES) buckets.set(status, []);
  for (const id of ids) {
    const status = statusOf(id);
    if (status === 'usable') continue;
    const existing = buckets.get(status);
    if (existing) existing.push(id);
    else buckets.set(status, [id]);
  }
  const groups: StatusGroup[] = [];
  for (const status of SKIPPED_STATUSES) {
    const noteIds = buckets.get(status) || [];
    groups.push({ status, count: noteIds.length, noteIds });
  }
  for (const [status, noteIds] of buckets) {
    if ((SKIPPED_STATUSES as readonly string[]).includes(status) || !noteIds.length) continue;
    groups.push({ status, count: noteIds.length, noteIds });
  }
  return groups;
}

/** Usable pairs the sanitized set would show without a human relation. */
export function missingSemanticRelations(
  file: ShadowLabelFile,
  plan: JevEvalEligibility,
): Array<{ noteId: string; candidateId: string }> {
  const missing: Array<{ noteId: string; candidateId: string }> = [];
  for (const query of plan.queries) {
    for (const candidate of query.semanticCandidates) {
      const row = file.rows.find((entry) => entry.noteId === query.noteId && entry.candidateId === candidate.id);
      if (!row || row.relation == null) missing.push({ noteId: query.noteId, candidateId: candidate.id });
    }
  }
  return missing;
}

export function planJevShadowEvaluation(
  file: ShadowLabelFile,
  prepared: readonly PreparedShadowNote[],
): JevEvalEligibility {
  const considered = queryIds(file, prepared);
  const usableQueryNotes = considered.filter((noteId) => isUsableAtomicNote(file, noteId));
  const queries: JevQueryEligibility[] = [];
  const skippedCandidateIds: string[] = [];
  let rawRetrievedCandidates = 0;
  let rawTop5Candidates = 0;
  let usableCandidatesSent = 0;

  for (const noteId of usableQueryNotes) {
    const sets = candidateSetsForNote(prepared, noteId);
    const semanticCandidates = takeUsableCandidates(sets.jev, file);
    rawRetrievedCandidates += sets.retrieved.length;
    rawTop5Candidates += sets.jev.length;
    usableCandidatesSent += semanticCandidates.length;
    for (const candidate of sets.jev) {
      if (!isUsableAtomicNote(file, candidate.id)) skippedCandidateIds.push(candidate.id);
    }
    queries.push({
      noteId,
      status: 'usable',
      rawRetrievedIds: sets.retrieved.map((candidate) => candidate.id),
      rawJevIds: sets.jev.map((candidate) => candidate.id),
      semanticCandidates,
    });
  }

  const expectedJevQueryIds = queries
    .filter((query) => query.semanticCandidates.length > 0)
    .map((query) => query.noteId);

  return {
    queryNotesConsidered: considered,
    usableQueryNotes,
    queryNotesSkippedByStatus: statusGroups(considered, (noteId) => atomicNoteStatus(file, noteId)),
    rawRetrievedCandidates,
    rawTop5Candidates,
    usableCandidatesSent,
    candidatesSkippedByStatus: statusGroups(skippedCandidateIds, (noteId) => atomicNoteStatus(file, noteId)),
    expectedJevQueryIds,
    queries,
  };
}

function formatGroup(group: StatusGroup): string {
  if (!group.noteIds.length) return `  ${group.status}: 0`;
  return `  ${group.status}: ${group.count} (${group.noteIds.join(', ')})`;
}

export function formatJevEvalEligibility(plan: JevEvalEligibility): string {
  return [
    `total query notes considered: ${plan.queryNotesConsidered.length}`,
    `usable query notes: ${plan.usableQueryNotes.length}`,
    'query notes skipped by status:',
    ...plan.queryNotesSkippedByStatus.map(formatGroup),
    `raw retrieved candidates: ${plan.rawRetrievedCandidates}`,
    `raw top 5 candidates: ${plan.rawTop5Candidates}`,
    `usable candidates sent to Jev: ${plan.usableCandidatesSent}`,
    'candidates skipped by status:',
    ...plan.candidatesSkippedByStatus.map(formatGroup),
    `expected Jev query count: ${plan.expectedJevQueryIds.length}`,
  ].join('\n');
}
