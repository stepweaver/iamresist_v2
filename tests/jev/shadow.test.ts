import { describe, expect, it } from 'vitest';

import { JEV_DECISION_CANDIDATE_LIMIT, JEV_PINNED_MODEL, JEV_SHADOW_LABEL_CAP } from '@/lib/jev/constants';
import { JEV_SEMANTIC_ELIGIBILITY, formatJevEvalEligibility, planJevShadowEvaluation, takeUsableCandidates } from '@/lib/jev/eligibility';
import { buildLabelSheet } from '@/lib/jev/labels';
import { NEW_EVENT_CHOICE } from '@/lib/jev/questions';
import { candidateSetsForNote, type PreparedShadowNote } from '@/lib/jev/retrieve';
import { runJevShadowEvaluation } from '@/lib/jev/shadow';
import type {
  JevDecisionProvider,
  JevDecisionResult,
  JevUpstreamNoteStatus,
  ShadowLabelFile,
  ShadowNoteReview,
} from '@/lib/jev/types';
import type { ResolvedThreadEntry } from '@/lib/eventThreads/types';
import { makeNote } from '../eventThreads/helpers';

function shadowReview(id: string, text: string, status: JevUpstreamNoteStatus | null = 'usable'): ShadowNoteReview {
  return {
    id,
    sourceItemId: 'source-item-1',
    creatorId: null,
    creatorName: null,
    kind: 'event',
    contentRole: 'editorial',
    statementRole: null,
    attribution: null,
    quotedSpeaker: null,
    text,
    sourceQuote: text,
    sourceExcerpt: text,
    startSeconds: null,
    endSeconds: null,
    sourceSegmentIndexes: [],
    discourseContext: null,
    discourseStartSeconds: null,
    discourseEndSeconds: null,
    discourseSegmentIndexes: null,
    discourseContextSource: 'unavailable',
    discourseContextFailureReason: 'transcript_cache_missing',
    status,
    reviewReason: null,
    speechMode: null,
    representedSpeaker: null,
    attributionReviewReason: null,
  };
}

function prepared(id: string, terms: string[]): PreparedShadowNote {
  const note = makeNote({
    id,
    kind: 'event',
    text: `Atomic note ${terms.join(' ')}`,
    exactQuote: `Atomic note ${terms.join(' ')}`,
    sourceExcerpt: 'transcript window that should not be copied wholesale into every candidate',
  });
  return {
    note,
    entry: {
      id,
      atomicNoteId: id,
      entryKind: 'event',
      resolvedText: note.text,
      resolutionType: 'literal',
      occurredAt: null,
      timeProvenance: 'unknown',
      sortOrder: 0,
      creatorName: null,
      sourceUrl: null,
      listenAnchorSeconds: null,
      confidence: 'high',
      identityTerms: terms,
      identityPhrases: [],
      identityAnchors: {
        actors: [],
        actions: [],
        objects: [],
        institutions: [],
        locations: [],
        documents: [],
      },
    } as ResolvedThreadEntry,
    identity: {
      terms,
      phrases: [],
      generic: [],
      actors: [],
      actions: [],
      objects: [],
      institutions: [],
      locations: [],
      documents: [],
    },
  };
}

describe('Jev shadow runner', () => {
  it('validates the model first and sends only the best five candidates', async () => {
    const queryId = '00000000-0000-4000-8000-000000000100';
    const shared = Array.from({ length: 10 }, (_, index) =>
      prepared(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, ['estonia']),
    );
    const missed = prepared('00000000-0000-4000-8000-000000000099', ['zzzznotashared']);
    const query = prepared(queryId, ['estonia', 'tallinn']);
    const corpus = [query, ...shared, missed];
    const sets = candidateSetsForNote(corpus, queryId);
    const labels: ShadowLabelFile = {
      sourceItemIds: ['source-item-1'],
      notes: {
        [queryId]: shadowReview(queryId, query.note.text),
        ...Object.fromEntries(sets.jev.map((candidate) => [candidate.id, shadowReview(candidate.id, candidate.note.text)])),
      },
      retrieval: [
        {
          noteId: queryId,
          retrievedCandidateIds: sets.retrieved.map((candidate) => candidate.id),
          jevCandidateIds: sets.jev.map((candidate) => candidate.id),
        },
      ],
      rows: sets.jev.map((candidate, index) => ({
        noteId: queryId,
        candidateId: candidate.id,
        relation: 'unrelated' as const,
        correctCandidateIds: index === 0 ? [missed.note.id] : [],
        correctCandidateId: index === 0 ? missed.note.id : null,
        v1SameThread: false,
        overlapScore: candidate.score,
        retrievedRank: candidate.rank,
        inJevSet: true,
      })),
    };

    const calls: Array<{ state: Record<string, unknown>; questions: Record<string, { type: string }> }> = [];
    let validated = false;
    const provider: JevDecisionProvider = {
      requestedModel: JEV_PINNED_MODEL,
      async validateModel() {
        validated = true;
        return {
          requestedModel: JEV_PINNED_MODEL,
          listedModels: [JEV_PINNED_MODEL, 'jev-preview'],
          modelCatalogName: JEV_PINNED_MODEL,
          modelCatalogReleaseDate: '2026-09-10T18:38:01.391457+00:00',
          modelCatalogDescription: "The latest iteration of TypeSafe's System One Model: Jev",
        };
      },
      async decide(input): Promise<JevDecisionResult> {
        expect(validated).toBe(true);
        calls.push(input);
        if ('best_candidate' in input.questions) {
          const choice = sets.jev[0]!.id;
          return {
            requestedModel: JEV_PINNED_MODEL,
            returnedModel: JEV_PINNED_MODEL,
            vendorRequestId: null,
            answers: {
              best_candidate: {
                type: 'choice',
                choice,
                confidence: 0.4,
                probabilities: { [choice]: 0.4, new_event: 0.6 },
              },
            },
            usage: { inputTokens: 30, outputTokens: 5 },
          };
        }
        return {
          requestedModel: JEV_PINNED_MODEL,
          returnedModel: JEV_PINNED_MODEL,
          vendorRequestId: null,
          answers: {
            same_event: { type: 'noul', noul: 0.2 },
            event_identity: {
              type: 'choice',
              choice: 'unrelated',
              confidence: 0.6,
              probabilities: { same_event: 0.1, related_but_distinct: 0.1, unrelated: 0.7, uncertain: 0.1 },
            },
          },
          usage: { inputTokens: 18, outputTokens: 4 },
        };
      },
    };

    const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
    const { records, metadata } = await runJevShadowEvaluation({
      groups: [{ sourceItemId: 'source-item-1', notes: corpus.map((item) => item.note) }],
      labels,
      provider,
      prepared: corpus,
      evaluationRunId: 'eval-1',
      id: () => ids.shift() || 'extra',
    });

    expect(calls).toHaveLength(1 + JEV_DECISION_CANDIDATE_LIMIT);
    expect(calls[0]?.questions.best_candidate?.type).toBe('choice');
    const choiceState = calls[0]?.state as { candidates: Array<{ id: string }> };
    expect(choiceState.candidates.map((candidate) => candidate.id)).toEqual(sets.jev.map((candidate) => candidate.id));
    expect(choiceState.candidates.map((candidate) => candidate.id)).not.toContain(missed.note.id);
    for (const call of calls.slice(1)) {
      expect(Object.keys(call.questions).sort()).toEqual(['event_identity', 'same_event']);
      expect(Object.keys(call.state)).toEqual(['note', 'candidate']);
      const state = call.state as { note: { kind: string; text: string; evidence: string }; candidate: { kind: string; text: string } };
      expect(Object.keys(state.note)).toEqual(['kind', 'text', 'evidence']);
      expect(state.note.kind).toBe('event');
      expect(state.candidate.kind).toBe('event');
      expect(JSON.stringify(call.state)).not.toContain('transcript window');
      expect(JSON.stringify(call.state)).not.toContain(missed.note.id);
    }
    expect(records.every((record) => record.evaluationRunId === 'eval-1')).toBe(true);
    expect(new Set(records.map((record) => record.decisionId)).size).toBe(records.length);
    expect(records.every((record) => record.requestedModel === JEV_PINNED_MODEL)).toBe(true);
    expect(records.every((record) => record.returnedModel === JEV_PINNED_MODEL)).toBe(true);
    expect(metadata).toMatchObject({
      recordType: 'run',
      evaluationRunId: 'eval-1',
      requestedModel: 'jev-latest',
      modelCatalogName: 'jev-latest',
      modelCatalogReleaseDate: '2026-09-10T18:38:01.391457+00:00',
      returnedModels: ['jev-latest'],
      unexpectedReturnedModels: [],
      semanticEligibility: JEV_SEMANTIC_ELIGIBILITY,
    });
    expect(records.filter((record) => record.decisionKind === 'pair').every((record) => record.recommendations['0.8'] === 'review_or_split')).toBe(true);
  });
});

const INVALID_QUERY_STATUSES = ['misattributed', 'unsupported', 'non_editorial', 'unclear'] as const;

function closedProvider(): JevDecisionProvider {
  return {
    requestedModel: JEV_PINNED_MODEL,
    async validateModel() {
      throw new Error('Jev provider should not be called');
    },
    async decide() {
      throw new Error('Jev provider should not be called');
    },
  };
}

function eligibilityLabels(
  query: PreparedShadowNote,
  candidates: readonly PreparedShadowNote[],
  queryStatus: JevUpstreamNoteStatus,
  candidateStatus: (id: string) => JevUpstreamNoteStatus,
): ShadowLabelFile {
  const notes: Record<string, ShadowNoteReview> = {
    [query.note.id]: shadowReview(query.note.id, query.note.text, queryStatus),
  };
  for (const candidate of candidates) {
    notes[candidate.note.id] = shadowReview(
      candidate.note.id,
      candidate.note.text,
      candidateStatus(candidate.note.id),
    );
  }
  return {
    sourceItemIds: ['source-item-1'],
    notes,
    retrieval: [],
    rows: candidates.map((candidate, index) => ({
      noteId: query.note.id,
      candidateId: candidate.note.id,
      relation: 'unrelated' as const,
      correctCandidateIds: [],
      correctCandidateId: null,
      v1SameThread: false,
      overlapScore: 1,
      retrievedRank: index + 1,
      inJevSet: index < JEV_DECISION_CANDIDATE_LIMIT,
    })),
  };
}

describe('Jev eval eligibility', () => {
  it.each(INVALID_QUERY_STATUSES)('makes zero Jev calls for a %s query note', async (status) => {
    const queryId = '00000000-0000-4000-8000-000000000210';
    const query = prepared(queryId, ['estonia', 'tallinn']);
    const candidates = [
      prepared('00000000-0000-4000-8000-000000000211', ['estonia']),
      prepared('00000000-0000-4000-8000-000000000212', ['estonia', 'tallinn']),
    ];
    const corpus = [query, ...candidates];
    const labels = eligibilityLabels(query, candidates, status, () => 'usable');
    const plan = planJevShadowEvaluation(labels, corpus);

    expect(plan.usableQueryNotes).toEqual([]);
    expect(plan.expectedJevQueryIds).toEqual([]);
    expect(plan.queryNotesSkippedByStatus.find((group) => group.status === status)?.noteIds).toEqual([queryId]);

    const result = await runJevShadowEvaluation({
      groups: [{ sourceItemId: 'source-item-1', notes: corpus.map((item) => item.note) }],
      labels,
      provider: closedProvider(),
      prepared: corpus,
    });
    expect(result.providerCalls).toBe(0);
    expect(result.records).toEqual([]);
    expect(result.evaluatedQueryNoteIds).toEqual([]);
    expect(result.metadata).toBeNull();
  });

  it('makes zero Jev calls when a usable query has no usable candidates', async () => {
    const query = prepared('00000000-0000-4000-8000-000000000220', ['estonia']);
    const candidates = [prepared('00000000-0000-4000-8000-000000000221', ['estonia'])];
    const corpus = [query, ...candidates];
    const labels = eligibilityLabels(query, candidates, 'usable', () => 'unsupported');
    const plan = planJevShadowEvaluation(labels, corpus);
    expect(plan.usableQueryNotes).toEqual([query.note.id]);
    expect(plan.expectedJevQueryIds).toEqual([]);
    expect(plan.candidatesSkippedByStatus.find((group) => group.status === 'unsupported')?.count).toBe(1);

    const result = await runJevShadowEvaluation({
      groups: [{ sourceItemId: 'source-item-1', notes: corpus.map((item) => item.note) }],
      labels,
      provider: closedProvider(),
      prepared: corpus,
    });
    expect(result.providerCalls).toBe(0);
    expect(result.records).toEqual([]);
  });

  it('sends only usable candidates, keeps retrieval rank, and still offers new_event', async () => {
    const queryId = '00000000-0000-4000-8000-000000000230';
    const blockedQueryId = '00000000-0000-4000-8000-000000000231';
    const query = prepared(queryId, ['estonia', 'tallinn']);
    const blockedQuery = prepared(blockedQueryId, ['zzzznotshared']);
    const shared = Array.from({ length: 8 }, (_, index) =>
      prepared(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, ['estonia']),
    );
    const corpus = [query, blockedQuery, ...shared];
    const sets = candidateSetsForNote(corpus, queryId);
    expect(sets.jev).toHaveLength(JEV_DECISION_CANDIDATE_LIMIT);
    const candidateStatus = new Map<string, JevUpstreamNoteStatus>([
      [sets.jev[0]!.id, 'misattributed'],
      [sets.jev[1]!.id, 'usable'],
      [sets.jev[2]!.id, 'unsupported'],
      [sets.jev[3]!.id, 'usable'],
      [sets.jev[4]!.id, 'unclear'],
    ]);
    const labels = eligibilityLabels(query, [...shared, blockedQuery], 'usable', (id) => {
      if (id === blockedQueryId) return 'misattributed';
      return candidateStatus.get(id) || 'non_editorial';
    });
    labels.notes[blockedQueryId] = shadowReview(blockedQueryId, blockedQuery.note.text, 'misattributed');
    labels.rows.push({
      noteId: blockedQueryId,
      candidateId: shared[0]!.note.id,
      relation: null,
      correctCandidateIds: [],
      correctCandidateId: null,
      v1SameThread: false,
      overlapScore: 1,
      retrievedRank: 1,
      inJevSet: true,
    });

    const semantic = takeUsableCandidates(sets.jev, labels);
    expect(semantic.map((candidate) => candidate.id)).toEqual([sets.jev[1]!.id, sets.jev[3]!.id]);
    expect(semantic.map((candidate) => candidate.rank)).toEqual([sets.jev[1]!.rank, sets.jev[3]!.rank]);
    expect(semantic.map((candidate) => candidate.rank)).not.toEqual([1, 2]);

    const plan = planJevShadowEvaluation(labels, corpus);
    const printed = formatJevEvalEligibility(plan);
    expect(printed).toMatch(/total query notes considered: 2/);
    expect(printed).toMatch(/usable query notes: 1/);
    expect(printed).toMatch(/query notes skipped by status:/);
    expect(printed).toMatch(new RegExp(`misattributed: 1 \\(${blockedQueryId}\\)`));
    expect(printed).toMatch(/raw retrieved candidates: /);
    expect(printed).toMatch(/raw top 5 candidates: /);
    expect(printed).toMatch(/usable candidates sent to Jev: 2/);
    expect(printed).toMatch(/candidates skipped by status:/);
    expect(printed).toMatch(/expected Jev query count: 1/);
    expect(plan.queries[0]?.rawRetrievedIds).toEqual(sets.retrieved.map((candidate) => candidate.id));
    expect(plan.queries[0]?.rawJevIds).toContain(sets.jev[0]!.id);

    const calls: Array<{ state: Record<string, unknown>; questions: Record<string, { type: string; criteria?: Record<string, string> }> }> = [];
    const provider: JevDecisionProvider = {
      requestedModel: JEV_PINNED_MODEL,
      async validateModel() {
        return {
          requestedModel: JEV_PINNED_MODEL,
          listedModels: [JEV_PINNED_MODEL],
          modelCatalogName: JEV_PINNED_MODEL,
          modelCatalogReleaseDate: '2026-09-10T18:38:01.391457+00:00',
          modelCatalogDescription: null,
        };
      },
      async decide(input): Promise<JevDecisionResult> {
        calls.push(input);
        if ('best_candidate' in input.questions) {
          return {
            requestedModel: JEV_PINNED_MODEL,
            returnedModel: JEV_PINNED_MODEL,
            vendorRequestId: null,
            answers: {
              best_candidate: {
                type: 'choice',
                choice: NEW_EVENT_CHOICE,
                confidence: 0.7,
                probabilities: { [NEW_EVENT_CHOICE]: 0.7 },
              },
            },
            usage: { inputTokens: 4, outputTokens: 2 },
          };
        }
        return {
          requestedModel: JEV_PINNED_MODEL,
          returnedModel: JEV_PINNED_MODEL,
          vendorRequestId: null,
          answers: {
            same_event: { type: 'noul', noul: 0.2 },
            event_identity: {
              type: 'choice',
              choice: 'unrelated',
              confidence: 0.6,
              probabilities: { unrelated: 0.6 },
            },
          },
          usage: { inputTokens: 4, outputTokens: 2 },
        };
      },
    };

    const result = await runJevShadowEvaluation({
      groups: [{ sourceItemId: 'source-item-1', notes: corpus.map((item) => item.note) }],
      labels,
      provider,
      prepared: corpus,
      evaluationRunId: 'eval-eligible',
    });

    expect(result.providerCalls).toBe(1 + semantic.length);
    expect(result.records).toHaveLength(1 + semantic.length);
    expect(result.evaluatedQueryNoteIds).toEqual([queryId]);
    expect(result.metadata?.semanticEligibility).toBe(JEV_SEMANTIC_ELIGIBILITY);
    const choice = calls[0];
    const sentIds = (choice?.state as { candidates: Array<{ id: string }> }).candidates.map((candidate) => candidate.id);
    expect(sentIds).toEqual(semantic.map((candidate) => candidate.id));
    expect(sentIds).not.toContain(sets.jev[0]!.id);
    expect(Object.keys(choice?.questions.best_candidate?.criteria || {})).toEqual([...sentIds, NEW_EVENT_CHOICE]);
    expect(result.records[0]?.retrievedCandidateIds).toEqual(sets.retrieved.map((candidate) => candidate.id));
    expect(result.records[0]?.retrievedCandidateIds).toContain(sets.jev[0]!.id);
    expect(result.records[0]?.jevCandidateIds).toEqual(sentIds);
    expect(result.records[0]?.jevCandidateIds).not.toContain(sets.jev[2]!.id);
  });

  it('refuses to call Jev when a usable shown pair has no human relation', async () => {
    const query = prepared('00000000-0000-4000-8000-000000000240', ['estonia', 'tallinn']);
    const candidate = prepared('00000000-0000-4000-8000-000000000241', ['estonia', 'tallinn']);
    const corpus = [query, candidate];
    const labels = eligibilityLabels(query, [candidate], 'usable', () => 'usable');
    labels.rows[0]!.relation = null;
    let providerCalls = 0;
    const provider: JevDecisionProvider = {
      requestedModel: JEV_PINNED_MODEL,
      async validateModel() {
        providerCalls += 1;
        throw new Error('Jev provider should not be called');
      },
      async decide() {
        providerCalls += 1;
        throw new Error('Jev provider should not be called');
      },
    };

    await expect(
      runJevShadowEvaluation({
        groups: [{ sourceItemId: 'source-item-1', notes: corpus.map((item) => item.note) }],
        labels,
        provider,
        prepared: corpus,
      }),
    ).rejects.toThrow(/no human relation/);
    expect(providerCalls).toBe(0);
  });
});

describe('label sheet', () => {
  it('puts V1 merges first, caps the sheet, and leaves the correct candidate for a human', () => {
    const notes = Array.from({ length: 12 }, (_, index) =>
      makeNote({
        kind: 'event',
        text: `Estonia reported a missile strike on the port of Tallinn, account ${index + 1}.`,
        sourceExcerpt: `Estonia reported a missile strike on the port of Tallinn, account ${index + 1}.`,
        startSeconds: index * 20,
      }),
    );
    const sheet = buildLabelSheet({
      groups: [{ sourceItemId: notes[0]!.sourceItemId, notes }],
    });
    const jevRows = sheet.rows.filter((row) => row.inJevSet);
    expect(jevRows.length).toBeGreaterThan(JEV_SHADOW_LABEL_CAP);
    for (const snapshot of sheet.retrieval) {
      for (const candidateId of snapshot.jevCandidateIds) {
        expect(
          sheet.rows.some((row) => row.noteId === snapshot.noteId && row.candidateId === candidateId && row.inJevSet),
        ).toBe(true);
      }
    }
    expect(sheet.rows.every((row) => row.relation == null && row.correctCandidateId == null && row.correctCandidateIds.length === 0)).toBe(true);
    expect(Object.values(sheet.notes).every((note) => note.status == null && note.reviewReason == null)).toBe(true);
    expect(sheet.rows.every((row) => sheet.notes[row.noteId]?.id === row.noteId && sheet.notes[row.candidateId]?.id === row.candidateId)).toBe(true);
    const pairedIds = sheet.rows.flatMap((row) => [row.noteId, row.candidateId]);
    expect(pairedIds.length).toBeGreaterThan(new Set(pairedIds).size);
    expect(new Set(pairedIds).size).toBe(Object.keys(sheet.notes).length);
    const firstOther = jevRows.findIndex((row) => !row.v1SameThread);
    if (firstOther > 0) {
      expect(jevRows.slice(0, firstOther).every((row) => row.v1SameThread)).toBe(true);
    }
    expect(sheet.retrieval.every((entry) => entry.jevCandidateIds.length <= JEV_DECISION_CANDIDATE_LIMIT)).toBe(true);
    expect(sheet.retrieval.every((entry) => entry.retrievedCandidateIds.length <= 10)).toBe(true);
    expect(sheet.retrieval.every((entry) => entry.jevCandidateIds.every((id) => entry.retrievedCandidateIds.includes(id)))).toBe(true);
  });
});
