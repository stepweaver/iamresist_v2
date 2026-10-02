import { randomUUID } from 'node:crypto';

import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import {
  BEST_CANDIDATE_QUESTION_KEY,
  EVENT_IDENTITY_QUESTION_KEY,
  SAME_EVENT_QUESTION_KEY,
  candidateChoiceQuestion,
  candidateChoiceState,
  noteJudgmentState,
  pairDecisionState,
  pairQuestions,
} from '@/lib/jev/questions';
import { JEV_SEMANTIC_ELIGIBILITY, missingSemanticRelations, planJevShadowEvaluation } from '@/lib/jev/eligibility';
import { JevShadowError } from '@/lib/jev/errors';
import { recommendationsAtThresholds } from '@/lib/jev/policy';
import { classifyReturnedJevModel } from '@/lib/jev/provider';
import { prepareCorpus, type PreparedShadowNote } from '@/lib/jev/retrieve';
import type {
  JevChoiceAnswer,
  JevDecisionProvider,
  JevModelCatalogSnapshot,
  JevNoulAnswer,
  ShadowDecisionRecord,
  ShadowEvaluationResult,
  ShadowLabelFile,
  ShadowRunMetadata,
} from '@/lib/jev/types';

function asChoice(answer: { type: string } | undefined): JevChoiceAnswer | null {
  if (!answer || answer.type !== 'choice') return null;
  return answer as JevChoiceAnswer;
}

function asNoul(answer: { type: string } | undefined): JevNoulAnswer | null {
  if (!answer || answer.type !== 'noul') return null;
  return answer as JevNoulAnswer;
}

export function buildShadowRunMetadata(
  evaluationRunId: string,
  catalog: JevModelCatalogSnapshot,
  records: readonly Pick<ShadowDecisionRecord, 'returnedModel'>[],
): ShadowRunMetadata {
  const returnedModels: string[] = [];
  const unexpectedReturnedModels: string[] = [];
  for (const record of records) {
    if (!returnedModels.includes(record.returnedModel)) returnedModels.push(record.returnedModel);
    const alignment = classifyReturnedJevModel({
      requestedModel: catalog.requestedModel,
      modelCatalogName: catalog.modelCatalogName,
      returnedModel: record.returnedModel,
    });
    if (alignment === 'unexpected' && !unexpectedReturnedModels.includes(record.returnedModel)) {
      unexpectedReturnedModels.push(record.returnedModel);
    }
  }
  return {
    recordType: 'run',
    evaluationRunId,
    requestedModel: catalog.requestedModel,
    modelCatalogName: catalog.modelCatalogName,
    modelCatalogReleaseDate: catalog.modelCatalogReleaseDate,
    modelCatalogDescription: catalog.modelCatalogDescription,
    returnedModels,
    unexpectedReturnedModels,
    semanticEligibility: JEV_SEMANTIC_ELIGIBILITY,
  };
}

export async function runJevShadowEvaluation(input: {
  groups: Array<{ sourceItemId: string; notes: readonly CreatorAtomicNote[] }>;
  labels: ShadowLabelFile;
  provider: JevDecisionProvider;
  evaluationRunId?: string;
  id?: () => string;
  prepared?: PreparedShadowNote[];
}): Promise<ShadowEvaluationResult> {
  const prepared = input.prepared || prepareCorpus(input.groups);
  const plan = planJevShadowEvaluation(input.labels, prepared);
  const missingRelations = missingSemanticRelations(input.labels, plan);
  if (missingRelations.length) {
    const listed = missingRelations
      .slice(0, 8)
      .map((pair) => `${pair.noteId} -> ${pair.candidateId}`)
      .join('; ');
    const suffix = missingRelations.length > 8 ? `; and ${missingRelations.length - 8} more` : '';
    throw new JevShadowError(
      `Refusing to call Jev. ${missingRelations.length} usable candidate pair(s) have no human relation: ${listed}${suffix}`,
      'labels_unlabeled_pair',
    );
  }
  const evaluationRunId = input.evaluationRunId || randomUUID();
  const nextId = input.id || randomUUID;
  const eligible = plan.queries.filter((query) => query.semanticCandidates.length > 0);
  if (!eligible.length) {
    return {
      metadata: null,
      records: [],
      providerCalls: 0,
      evaluatedQueryNoteIds: [],
    };
  }

  const validation = await input.provider.validateModel();
  const records: ShadowDecisionRecord[] = [];
  const evaluatedQueryNoteIds: string[] = [];
  let providerCalls = 0;

  for (const queryPlan of eligible) {
    const noteId = queryPlan.noteId;
    const query = prepared.find((item) => item.note.id === noteId);
    if (!query) continue;
    const retrievedCandidateIds = queryPlan.rawRetrievedIds;
    const semanticCandidates = queryPlan.semanticCandidates;
    const jevCandidateIds = semanticCandidates.map((candidate) => candidate.id);
    evaluatedQueryNoteIds.push(noteId);

    const noteState = noteJudgmentState(query.note);
    const candidateStates = semanticCandidates.map((candidate) => ({
      id: candidate.id,
      ...noteJudgmentState(candidate.note),
    }));
    const choiceQuestions = {
      [BEST_CANDIDATE_QUESTION_KEY]: candidateChoiceQuestion(jevCandidateIds),
    };
    providerCalls += 1;
    const choiceResult = await input.provider.decide({
      state: candidateChoiceState(noteState, candidateStates),
      questions: choiceQuestions,
    });
    const best = asChoice(choiceResult.answers[BEST_CANDIDATE_QUESTION_KEY]);
    records.push({
      evaluationRunId,
      decisionId: nextId(),
      requestedModel: validation.requestedModel,
      returnedModel: choiceResult.returnedModel,
      vendorRequestId: choiceResult.vendorRequestId,
      noteId,
      candidateId: null,
      decisionKind: 'candidate_choice',
      retrievedCandidateIds,
      jevCandidateIds,
      questions: choiceQuestions,
      answers: choiceResult.answers,
      usage: choiceResult.usage,
      pairChoice: null,
      pairChoiceConfidence: null,
      sameEventNoul: null,
      candidateChoice: best?.choice || null,
      candidateChoiceConfidence: best?.confidence ?? null,
      recommendations: {},
    });

    for (const candidate of semanticCandidates) {
      const questions = pairQuestions();
      providerCalls += 1;
      const result = await input.provider.decide({
        state: pairDecisionState(noteState, noteJudgmentState(candidate.note)),
        questions,
      });
      const pairChoice = asChoice(result.answers[EVENT_IDENTITY_QUESTION_KEY]);
      const noul = asNoul(result.answers[SAME_EVENT_QUESTION_KEY]);
      const candidateChoice = best?.choice || null;
      records.push({
        evaluationRunId,
        decisionId: nextId(),
        requestedModel: validation.requestedModel,
        returnedModel: result.returnedModel,
        vendorRequestId: result.vendorRequestId,
        noteId,
        candidateId: candidate.id,
        decisionKind: 'pair',
        retrievedCandidateIds,
        jevCandidateIds,
        questions,
        answers: result.answers,
        usage: result.usage,
        pairChoice: pairChoice?.choice || null,
        pairChoiceConfidence: pairChoice?.confidence ?? null,
        sameEventNoul: noul?.noul ?? null,
        candidateChoice,
        candidateChoiceConfidence: best?.confidence ?? null,
        recommendations: recommendationsAtThresholds({
          candidateChoice,
          candidateId: candidate.id,
          pairChoice: pairChoice?.choice || null,
          noul: noul?.noul ?? null,
        }),
      });
    }
  }

  return {
    metadata: buildShadowRunMetadata(evaluationRunId, validation, records),
    records,
    providerCalls,
    evaluatedQueryNoteIds,
  };
}
