import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JEV_PINNED_MODEL } from '@/lib/jev/constants';
import { JevShadowError } from '@/lib/jev/errors';
import { parseShadowLabelFile } from '@/lib/jev/labels';
import { formatShadowReport, scoreShadowEvaluation } from '@/lib/jev/report';
import type {
  JevUpstreamNoteStatus,
  ShadowDecisionRecord,
  ShadowLabelFile,
  ShadowLabelProvenance,
  ShadowLabelRow,
  ShadowNoteReview,
} from '@/lib/jev/types';

const fixturePath = join(process.cwd(), 'tests/jev/fixtures/missed-pair-labels.json');

function pairDecision(partial: {
  noteId: string;
  candidateId: string;
  pairChoice: string;
  noul: number;
  candidateChoice: string;
  decisionId?: string;
}): ShadowDecisionRecord {
  return {
    evaluationRunId: 'run-1',
    decisionId: partial.decisionId || `dec-${partial.candidateId}`,
    requestedModel: JEV_PINNED_MODEL,
    returnedModel: JEV_PINNED_MODEL,
    vendorRequestId: null,
    noteId: partial.noteId,
    candidateId: partial.candidateId,
    decisionKind: 'pair',
    retrievedCandidateIds: [partial.candidateId],
    jevCandidateIds: [partial.candidateId],
    questions: {},
    answers: {},
    usage: { inputTokens: 12, outputTokens: 3 },
    pairChoice: partial.pairChoice,
    pairChoiceConfidence: 0.8,
    sameEventNoul: partial.noul,
    candidateChoice: partial.candidateChoice,
    candidateChoiceConfidence: 0.8,
    recommendations: {},
  };
}

function provenance(id: string, text: string): ShadowLabelProvenance {
  return {
    id,
    sourceItemId: 'source-item-1',
    creatorId: 'professor-jiang',
    creatorName: 'Professor Jiang',
    kind: 'event',
    contentRole: 'editorial',
    statementRole: 'creator',
    attribution: 'Professor Jiang',
    quotedSpeaker: null,
    text,
    sourceQuote: text,
    sourceExcerpt: `Full window: ${text}`,
    startSeconds: 1,
    endSeconds: 4,
    sourceSegmentIndexes: [0],
  };
}

function review(
  id: string,
  status: JevUpstreamNoteStatus | null,
  text = id,
  reviewReason: string | null = null,
  extra: Partial<ShadowNoteReview> = {},
): ShadowNoteReview {
  return {
    ...provenance(id, text),
    discourseContext: null,
    discourseStartSeconds: null,
    discourseEndSeconds: null,
    discourseSegmentIndexes: null,
    discourseContextSource: 'unavailable',
    discourseContextFailureReason: 'transcript_cache_missing',
    status,
    reviewReason,
    speechMode: null,
    representedSpeaker: null,
    attributionReviewReason: null,
    ...extra,
  };
}

function labelRow(partial: {
  noteId: string;
  candidateId: string;
  relation: ShadowLabelRow['relation'];
  correctCandidateIds?: string[];
  correctCandidateId?: string | null;
  v1SameThread?: boolean;
  inJevSet?: boolean;
}): ShadowLabelRow {
  return {
    noteId: partial.noteId,
    candidateId: partial.candidateId,
    relation: partial.relation,
    correctCandidateIds: partial.correctCandidateIds ?? [],
    correctCandidateId: partial.correctCandidateId ?? null,
    v1SameThread: partial.v1SameThread ?? false,
    overlapScore: 4,
    retrievedRank: 1,
    inJevSet: partial.inJevSet ?? true,
  };
}

function labelFile(input: {
  rows: ShadowLabelRow[];
  retrieval: ShadowLabelFile['retrieval'];
  notes: Record<string, ShadowNoteReview>;
}): ShadowLabelFile {
  return {
    sourceItemIds: ['source-item-1'],
    notes: input.notes,
    retrieval: input.retrieval,
    rows: input.rows,
  };
}

describe('Jev shadow report', () => {
  it('counts a retrieval miss separately from a Jev semantic failure', () => {
    const labels = parseShadowLabelFile(JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown);
    const shown = labels.rows[0];
    expect(shown?.correctCandidateIds).toEqual([]);
    expect(shown?.correctCandidateId).toBe('00000000-0000-4000-8000-0000000000c1');
    expect(labels.notes[shown!.noteId]?.status).toBe('usable');
    expect(labels.notes[shown!.noteId]?.reviewReason).toBe('speaker is named in the excerpt');
    expect(labels.notes[shown!.candidateId]?.reviewReason).toBeNull();
    expect(shown).not.toHaveProperty('noteStatus');
    expect(shown).not.toHaveProperty('candidateStatus');
    expect(shown).not.toHaveProperty('note');
    const report = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId: shown!.noteId,
        candidateId: shown!.candidateId,
        pairChoice: 'unrelated',
        noul: 0.05,
        candidateChoice: 'new_event',
      }),
    ]);
    expect(report.queryCandidateRecall).toEqual({ queries: 1, rawTop10: 0, rawTop5: 0 });
    expect(report.candidateChoiceAccuracy).toEqual({ correct: 0, total: 0 });
    expect(report.retrievalMisses).toBe(1);
    expect(report.thresholds.every((score) => score.falseSplits === 0)).toBe(true);
    expect(report.thresholds.every((score) => score.falseMerges === 0)).toBe(true);
    expect(formatShadowReport(report)).toMatch(/primary metric/i);
    expect(formatShadowReport(report)).not.toMatch(/Model catalog/);
    const withCatalog = formatShadowReport(report, {
      recordType: 'run',
      evaluationRunId: 'run-1',
      requestedModel: JEV_PINNED_MODEL,
      modelCatalogName: JEV_PINNED_MODEL,
      modelCatalogReleaseDate: '2026-09-10T18:38:01.391457+00:00',
      modelCatalogDescription: "The latest iteration of TypeSafe's System One Model: Jev",
      returnedModels: ['jev-1.13.0'],
      unexpectedReturnedModels: ['jev-preview'],
    });
    expect(withCatalog).toMatch(/Requested model: jev-latest/);
    expect(withCatalog).toMatch(/Model catalog release date: 2026-09-10T18:38:01\.391457\+00:00/);
    expect(withCatalog).toMatch(/Unexpected returned models: jev-preview/);
  });

  it('counts a false merge only when Jev was shown the pair', () => {
    const noteId = '00000000-0000-4000-8000-0000000000a1';
    const candidateId = '00000000-0000-4000-8000-0000000000b1';
    const labels = labelFile({
      retrieval: [{ noteId, retrievedCandidateIds: [candidateId], jevCandidateIds: [candidateId] }],
      notes: {
        [noteId]: review(noteId, 'usable', 'Note'),
        [candidateId]: review(candidateId, 'usable', 'Other'),
      },
      rows: [
        labelRow({
          noteId,
          candidateId,
          relation: 'unrelated',
          v1SameThread: true,
        }),
      ],
    });
    const report = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId,
        candidateId,
        pairChoice: 'same_event',
        noul: 0.93,
        candidateChoice: candidateId,
      }),
    ]);
    expect(report.v1FalseMerges).toBe(1);
    const at80 = report.thresholds.find((score) => score.noul === 0.8);
    expect(at80?.falseMerges).toBe(1);
    const at95 = report.thresholds.find((score) => score.noul === 0.95);
    expect(at95?.falseMerges).toBe(0);
  });

  it('scores conditional accuracy and false splits only inside the Jev set', () => {
    const noteId = '00000000-0000-4000-8000-0000000000a1';
    const candidateId = '00000000-0000-4000-8000-0000000000b1';
    const labels = labelFile({
      retrieval: [{ noteId, retrievedCandidateIds: [candidateId], jevCandidateIds: [candidateId] }],
      notes: {
        [noteId]: review(noteId, 'usable', 'Note'),
        [candidateId]: review(candidateId, 'usable', 'Same event'),
      },
      rows: [
        labelRow({
          noteId,
          candidateId,
          relation: 'same_event',
        }),
      ],
    });
    const accepted = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId,
        candidateId,
        pairChoice: 'same_event',
        noul: 0.9,
        candidateChoice: 'new_event',
      }),
    ]);
    expect(accepted.queryCandidateRecall.rawTop5).toBe(1);
    expect(accepted.thresholds.find((score) => score.noul === 0.8)).toMatchObject({
      falseSplits: 0,
      falseMerges: 0,
      relationshipSameEvent: 1,
      policyMerges: 0,
    });

    const refused = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId,
        candidateId,
        pairChoice: 'related_but_distinct',
        noul: 0.99,
        candidateChoice: candidateId,
      }),
    ]);
    expect(refused.thresholds.find((score) => score.noul === 0.8)?.falseSplits).toBe(1);
    expect(refused.retrievalMisses).toBe(0);
  });

  it('fails empty, partial, and decision-less label files', () => {
    const empty: ShadowLabelFile = { sourceItemIds: ['s'], notes: {}, retrieval: [], rows: [] };
    expect(() => scoreShadowEvaluation(empty, [])).toThrow(/no rows/);
    const partial = labelFile({
      retrieval: [],
      notes: {
        n: review('n', null),
        c: review('c', null),
      },
      rows: [
        labelRow({
          noteId: 'n',
          candidateId: 'c',
          relation: null,
        }),
      ],
    });
    expect(() => scoreShadowEvaluation(partial, [{ decisionId: 'x' } as ShadowDecisionRecord])).toThrow(/unlabeled/);
    expect(() =>
      parseShadowLabelFile({
        sourceItemIds: ['s'],
        notes: {},
        retrieval: [],
        rows: [{ noteId: 'n', candidateId: 'c', relation: null }],
      }),
    ).toThrow(/missing from notes/);
    const ready = parseShadowLabelFile(JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown);
    expect(() => scoreShadowEvaluation(ready, [])).toThrow(JevShadowError);
  });

  it('counts Atomic Note quality once per note and scores only pairs whose notes are both usable', () => {
    const misattributedId = '00000000-0000-4000-8000-0000000000a1';
    const nonEditorialId = '00000000-0000-4000-8000-0000000000b1';
    const leftUsableId = '00000000-0000-4000-8000-0000000000c1';
    const rightUsableId = '00000000-0000-4000-8000-0000000000d1';
    const labels = labelFile({
      retrieval: [
        {
          noteId: misattributedId,
          retrievedCandidateIds: [nonEditorialId, leftUsableId, rightUsableId],
          jevCandidateIds: [nonEditorialId, leftUsableId, rightUsableId],
        },
        {
          noteId: leftUsableId,
          retrievedCandidateIds: [rightUsableId],
          jevCandidateIds: [rightUsableId],
        },
      ],
      notes: {
        [misattributedId]: review(misattributedId, 'misattributed', 'Misquoted'),
        [nonEditorialId]: review(nonEditorialId, 'non_editorial', 'Sponsor read'),
        [leftUsableId]: review(leftUsableId, 'usable', 'Usable left'),
        [rightUsableId]: review(rightUsableId, 'usable', 'Usable right'),
      },
      rows: [
        labelRow({
          noteId: misattributedId,
          candidateId: nonEditorialId,
          relation: null,
          correctCandidateId: '00000000-0000-4000-8000-0000000000e1',
          v1SameThread: true,
        }),
        labelRow({
          noteId: misattributedId,
          candidateId: leftUsableId,
          relation: 'same_event',
          v1SameThread: true,
        }),
        labelRow({
          noteId: misattributedId,
          candidateId: rightUsableId,
          relation: 'unrelated',
        }),
        labelRow({
          noteId: leftUsableId,
          candidateId: nonEditorialId,
          relation: null,
        }),
        labelRow({
          noteId: leftUsableId,
          candidateId: rightUsableId,
          relation: 'unrelated',
          v1SameThread: true,
        }),
      ],
    });
    const report = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId: misattributedId,
        candidateId: nonEditorialId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: nonEditorialId,
      }),
      pairDecision({
        noteId: misattributedId,
        candidateId: leftUsableId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: leftUsableId,
        decisionId: 'dec-excluded-target',
      }),
      pairDecision({
        noteId: leftUsableId,
        candidateId: rightUsableId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: rightUsableId,
        decisionId: 'dec-usable',
      }),
    ]);
    expect(report.jevScoredRows).toBe(1);
    expect(report.atomicNoteQuality.notes).toBe(4);
    expect(report.atomicNoteQuality.counts).toEqual({
      usable: 2,
      misattributed: 1,
      unsupported: 0,
      non_editorial: 1,
      unclear: 0,
    });
    expect(report.atomicNoteQuality.excludedRows).toBe(4);
    expect(report.atomicNoteQuality.findings).toEqual([
      { noteId: misattributedId, status: 'misattributed' },
      { noteId: nonEditorialId, status: 'non_editorial' },
    ]);
    expect(report.queryCandidateRecall.queries).toBe(0);
    expect(report.v1FalseMerges).toBe(1);
    expect(report.thresholds.every((score) => score.falseMerges === 1)).toBe(true);
    expect(report.thresholds.every((score) => score.falseSplits === 0)).toBe(true);
    expect(formatShadowReport(report)).toMatch(/Atomic Notes reviewed: 4/);
    expect(formatShadowReport(report)).toMatch(/Atomic Note quality findings: 2/);
    expect(formatShadowReport(report)).toMatch(/misattributed: 1/);
    expect(formatShadowReport(report)).toMatch(/usable: 2/);
    expect(() =>
      scoreShadowEvaluation(
        labelFile({
          retrieval: [
            {
              noteId: misattributedId,
              retrievedCandidateIds: [nonEditorialId],
              jevCandidateIds: [nonEditorialId],
            },
          ],
          notes: {
            [misattributedId]: review(misattributedId, 'unclear'),
            [nonEditorialId]: review(nonEditorialId, 'unsupported'),
          },
          rows: [
            labelRow({
              noteId: misattributedId,
              candidateId: nonEditorialId,
              relation: null,
            }),
          ],
        }),
        [
          pairDecision({
            noteId: misattributedId,
            candidateId: nonEditorialId,
            pairChoice: 'same_event',
            noul: 0.99,
            candidateChoice: nonEditorialId,
          }),
        ],
      ),
    ).not.toThrow();
  });

  it('counts speech mode once per note and leaves the usable-only Jev denominator unchanged', () => {
    const analysisId = '00000000-0000-4000-8000-0000000000a1';
    const quotedId = '00000000-0000-4000-8000-0000000000b1';
    const assertionId = '00000000-0000-4000-8000-0000000000c1';
    const unclearId = '00000000-0000-4000-8000-0000000000d1';
    const inferenceId = '00000000-0000-4000-8000-0000000000e1';
    const labels = labelFile({
      retrieval: [
        {
          noteId: quotedId,
          retrievedCandidateIds: [assertionId, inferenceId],
          jevCandidateIds: [assertionId, inferenceId],
        },
      ],
      notes: {
        [analysisId]: review(analysisId, 'misattributed', 'The creator argues diesel prices will rise.', null, {
          kind: 'creator_analysis',
          speechMode: 'hypothetical_or_sarcastic_other',
          representedSpeaker: 'Donald Trump',
        }),
        [quotedId]: review(quotedId, 'usable', 'Quoted claim', null, { speechMode: 'quoted_other' }),
        [assertionId]: review(assertionId, 'usable', 'Own claim', null, { speechMode: 'creator_assertion' }),
        [unclearId]: review(unclearId, 'unclear', 'Unclear claim', null, { speechMode: 'unclear' }),
        [inferenceId]: review(inferenceId, 'usable', 'Inferred claim', null, {
          speechMode: 'creator_inference',
          discourseContext: 'wider neighboring transcript',
          discourseStartSeconds: 1,
          discourseEndSeconds: 120,
          discourseSegmentIndexes: [0, 1, 2],
        }),
      },
      rows: [
        labelRow({ noteId: analysisId, candidateId: quotedId, relation: 'same_event', inJevSet: true }),
        labelRow({ noteId: analysisId, candidateId: assertionId, relation: 'same_event', inJevSet: true }),
        labelRow({ noteId: analysisId, candidateId: unclearId, relation: null, inJevSet: true }),
        labelRow({ noteId: quotedId, candidateId: assertionId, relation: 'unrelated', inJevSet: true }),
        labelRow({ noteId: quotedId, candidateId: inferenceId, relation: 'same_event', inJevSet: true }),
        labelRow({ noteId: assertionId, candidateId: inferenceId, relation: 'unrelated', inJevSet: true }),
      ],
    });
    const report = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId: quotedId,
        candidateId: assertionId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: assertionId,
      }),
      pairDecision({
        noteId: quotedId,
        candidateId: inferenceId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: inferenceId,
        decisionId: 'dec-inference',
      }),
      pairDecision({
        noteId: assertionId,
        candidateId: inferenceId,
        pairChoice: 'unrelated',
        noul: 0.1,
        candidateChoice: 'new_event',
        decisionId: 'dec-assertion',
      }),
    ]);
    expect(report.atomicNoteQuality.notes).toBe(5);
    expect(report.atomicNoteQuality.speechMode).toEqual({
      creator_assertion: 1,
      creator_inference: 1,
      quoted_other: 1,
      paraphrased_other: 0,
      hypothetical_or_sarcastic_other: 1,
      unclear: 1,
    });
    expect(report.atomicNoteQuality.usableNonCreatorSpeech).toBe(1);
    expect(report.atomicNoteQuality.creatorAnalysisLabeledAsOther).toBe(1);
    expect(report.atomicNoteQuality.unclearOwnership).toBe(1);
    expect(report.atomicNoteQuality.missingDiscourseContext).toBe(4);
    expect(report.jevScoredRows).toBe(3);
    expect(report.atomicNoteQuality.excludedRows).toBe(3);
    expect(report.thresholds.find((score) => score.noul === 0.8)?.falseMerges).toBe(1);
    expect(formatShadowReport(report)).toMatch(/speechMode hypothetical_or_sarcastic_other: 1/);
    expect(formatShadowReport(report)).toMatch(/Usable notes with non-creator speech: 1/);
    expect(formatShadowReport(report)).toMatch(/Creator-analysis notes labeled as other speech: 1/);
    expect(formatShadowReport(report)).toMatch(/Notes whose ownership could not be determined: 1/);
  });

  it('keeps filtered candidates in raw retrieval and out of semantic denominators', () => {
    const queryId = '00000000-0000-4000-8000-0000000000a1';
    const badId = '00000000-0000-4000-8000-0000000000b1';
    const goodId = '00000000-0000-4000-8000-0000000000c1';
    const sameId = '00000000-0000-4000-8000-0000000000d1';
    const labels = labelFile({
      retrieval: [
        {
          noteId: queryId,
          retrievedCandidateIds: [badId, goodId, sameId],
          jevCandidateIds: [badId, goodId, sameId],
        },
      ],
      notes: {
        [queryId]: review(queryId, 'usable', 'Query'),
        [badId]: review(badId, 'misattributed', 'Bad candidate'),
        [goodId]: review(goodId, 'usable', 'Different event'),
        [sameId]: review(sameId, 'usable', 'Same event'),
      },
      rows: [
        labelRow({
          noteId: queryId,
          candidateId: goodId,
          relation: 'unrelated',
          correctCandidateId: badId,
        }),
        labelRow({
          noteId: queryId,
          candidateId: sameId,
          relation: 'same_event',
        }),
        labelRow({
          noteId: queryId,
          candidateId: badId,
          relation: null,
        }),
      ],
    });
    const rawJevIds = labels.retrieval[0]?.jevCandidateIds.slice();
    const report = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId: queryId,
        candidateId: badId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: badId,
        decisionId: 'dec-invalid-candidate',
      }),
      pairDecision({
        noteId: queryId,
        candidateId: goodId,
        pairChoice: 'same_event',
        noul: 0.99,
        candidateChoice: goodId,
        decisionId: 'dec-false-merge',
      }),
      pairDecision({
        noteId: queryId,
        candidateId: sameId,
        pairChoice: 'unrelated',
        noul: 0.1,
        candidateChoice: 'new_event',
        decisionId: 'dec-false-split',
      }),
    ]);

    expect(labels.retrieval[0]?.jevCandidateIds).toEqual(rawJevIds);
    expect(rawJevIds).toContain(badId);
    expect(report.queryCandidateRecall).toEqual({ queries: 1, rawTop10: 1, rawTop5: 1 });
    expect(report.retrievalMisses).toBe(0);
    expect(report.jevScoredRows).toBe(2);
    expect(report.unlabeledShownPairs).toBe(0);
    expect(report.thresholds.every((score) => score.falseSplits === 1 && score.falseMerges === 1)).toBe(true);
    const printed = formatShadowReport(report);
    expect(printed).toMatch(/Semantic evaluation eligibility requires usable human Atomic Notes/);
    expect(printed).toMatch(/Query-level raw candidate recall, top 10: 1\/1/);
    expect(printed).toMatch(/Query-level raw candidate recall, top 5: 1\/1/);
    expect(printed).toMatch(/falseSplits=1/);
    expect(printed).not.toMatch(/Candidate recall, raw top/);
  });

  it('counts a query hit when any acceptable candidate is in the raw top 5 or top 10', () => {
    const noteId = '00000000-0000-4000-8000-0000000000a1';
    const missedId = '00000000-0000-4000-8000-0000000000b1';
    const foundId = '00000000-0000-4000-8000-0000000000c1';
    const labels = labelFile({
      retrieval: [{ noteId, retrievedCandidateIds: [foundId, 'other'], jevCandidateIds: ['other'] }],
      notes: {
        [noteId]: review(noteId, 'usable', 'Query'),
        [missedId]: review(missedId, 'usable', 'Also the same thread'),
        [foundId]: review(foundId, 'usable', 'Same thread, ranked sixth'),
        other: review('other', 'usable', 'Different'),
      },
      rows: [
        labelRow({
          noteId,
          candidateId: foundId,
          relation: 'same_event',
          correctCandidateIds: [missedId, foundId],
          inJevSet: false,
        }),
        labelRow({
          noteId,
          candidateId: 'other',
          relation: 'unrelated',
          inJevSet: true,
        }),
      ],
    });
    const report = scoreShadowEvaluation(labels, [
      pairDecision({
        noteId,
        candidateId: 'other',
        pairChoice: 'unrelated',
        noul: 0.1,
        candidateChoice: 'new_event',
      }),
    ]);
    expect(report.queryCandidateRecall).toEqual({ queries: 1, rawTop10: 1, rawTop5: 0 });
    expect(report.retrievalMisses).toBe(1);
    expect(report.candidateChoiceAccuracy).toEqual({ correct: 0, total: 0 });
  });

  it('accepts any human same-event candidate and new_event only when that set is empty', () => {
    const noteId = '00000000-0000-4000-8000-0000000000a1';
    const firstId = '00000000-0000-4000-8000-0000000000b1';
    const secondId = '00000000-0000-4000-8000-0000000000c1';
    const labels = labelFile({
      retrieval: [{ noteId, retrievedCandidateIds: [firstId, secondId], jevCandidateIds: [firstId, secondId] }],
      notes: {
        [noteId]: review(noteId, 'usable', 'RGC strike claim', null, { kind: 'new_development' }),
        [firstId]: review(firstId, 'usable', 'Aegis significance', null, { kind: 'why_it_matters' }),
        [secondId]: review(secondId, 'usable', 'Qasem-Basir analysis', null, { kind: 'creator_analysis' }),
      },
      rows: [
        labelRow({
          noteId,
          candidateId: firstId,
          relation: 'same_event',
          correctCandidateId: secondId,
        }),
        labelRow({
          noteId,
          candidateId: secondId,
          relation: 'same_event',
          correctCandidateId: secondId,
        }),
      ],
    });
    const scoreChoice = (candidateChoice: string) =>
      scoreShadowEvaluation(labels, [
        pairDecision({
          noteId,
          candidateId: firstId,
          pairChoice: 'same_event',
          noul: 0.9,
          candidateChoice,
        }),
        pairDecision({
          noteId,
          candidateId: secondId,
          pairChoice: 'same_event',
          noul: 0.9,
          candidateChoice,
          decisionId: 'dec-second',
        }),
      ]);
    expect(scoreChoice(firstId).candidateChoiceAccuracy).toEqual({ correct: 1, total: 1 });
    expect(scoreChoice(secondId).candidateChoiceAccuracy).toEqual({ correct: 1, total: 1 });
    expect(scoreChoice('new_event').candidateChoiceAccuracy).toEqual({ correct: 0, total: 1 });
    expect(scoreChoice(firstId).thresholds.find((score) => score.noul === 0.8)).toMatchObject({
      falseSplits: 0,
      falseMerges: 0,
      policyMerges: 1,
      candidateChoiceAcceptable: 2,
      relationshipSameEvent: 2,
    });

    const fresh = labelFile({
      retrieval: [{ noteId, retrievedCandidateIds: [firstId], jevCandidateIds: [firstId] }],
      notes: {
        [noteId]: review(noteId, 'usable', 'Carrier group'),
        [firstId]: review(firstId, 'usable', 'Iran economy'),
      },
      rows: [
        labelRow({
          noteId,
          candidateId: firstId,
          relation: 'related_but_distinct',
          correctCandidateIds: [],
          correctCandidateId: 'new_event',
        }),
      ],
    });
    const acceptedNew = scoreShadowEvaluation(fresh, [
      pairDecision({
        noteId,
        candidateId: firstId,
        pairChoice: 'related_but_distinct',
        noul: 0.2,
        candidateChoice: 'new_event',
      }),
    ]);
    expect(acceptedNew.queryCandidateRecall.queries).toBe(0);
    expect(acceptedNew.candidateChoiceAccuracy).toEqual({ correct: 1, total: 1 });
    expect(acceptedNew.pairRelationshipAccuracy).toEqual({ correct: 1, total: 1 });
    const rejectedNew = scoreShadowEvaluation(fresh, [
      pairDecision({
        noteId,
        candidateId: firstId,
        pairChoice: 'same_event',
        noul: 0.95,
        candidateChoice: firstId,
      }),
    ]);
    expect(rejectedNew.candidateChoiceAccuracy).toEqual({ correct: 0, total: 1 });
    expect(rejectedNew.thresholds.find((score) => score.noul === 0.8)?.falseMerges).toBe(1);
    expect(rejectedNew.pairRelationshipAccuracy).toEqual({ correct: 0, total: 1 });
  });
});
