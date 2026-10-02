import { JEV_NON_CREATOR_SPEECH_MODES, JEV_NOUL_THRESHOLDS, JEV_SPEECH_MODES } from '@/lib/jev/constants';
import { JEV_SEMANTIC_ELIGIBILITY, isUsableAtomicNote, semanticCandidateIds } from '@/lib/jev/eligibility';
import { JevShadowError } from '@/lib/jev/errors';
import { acceptableCandidateIds, assertLabelsReady, labelRowCountsForJev } from '@/lib/jev/labels';
import { pairRecommendation, sameEventChoiceAndNoul } from '@/lib/jev/policy';
import { NEW_EVENT_CHOICE } from '@/lib/jev/questions';
import type {
  AtomicNoteQualityCounts,
  AtomicNoteQualityFinding,
  AtomicNoteQualityStatus,
  JevSpeechMode,
  ShadowDecisionRecord,
  ShadowLabelFile,
  ShadowLabelRow,
  ShadowNoteReview,
  ShadowReport,
  ShadowRunMetadata,
  ShadowThresholdScore,
  SpeechModeCounts,
} from '@/lib/jev/types';

function jevRows(file: ShadowLabelFile): ShadowLabelRow[] {
  return file.rows.filter((row) => labelRowCountsForJev(file, row));
}

function recallQueries(file: ShadowLabelFile): Array<{ noteId: string; acceptableIds: string[] }> {
  const queries: Array<{ noteId: string; acceptableIds: string[] }> = [];
  const seen = new Set<string>();
  for (const row of file.rows) {
    if (seen.has(row.noteId) || !isUsableAtomicNote(file, row.noteId)) continue;
    seen.add(row.noteId);
    const acceptableIds = acceptableCandidateIds(file, row.noteId);
    if (!acceptableIds.length) continue;
    queries.push({ noteId: row.noteId, acceptableIds });
  }
  return queries;
}

function choiceIsAcceptable(choice: string | null, acceptableIds: readonly string[]): boolean {
  if (!acceptableIds.length) return choice === NEW_EVENT_CHOICE;
  return choice != null && acceptableIds.includes(choice);
}

const EMPTY_QUALITY_COUNTS: AtomicNoteQualityCounts = {
  usable: 0,
  misattributed: 0,
  unsupported: 0,
  non_editorial: 0,
  unclear: 0,
};

const NON_CREATOR_SPEECH = new Set<string>(JEV_NON_CREATOR_SPEECH_MODES);

function emptySpeechModeCounts(): SpeechModeCounts {
  return {
    creator_assertion: 0,
    creator_inference: 0,
    quoted_other: 0,
    paraphrased_other: 0,
    hypothetical_or_sarcastic_other: 0,
    unclear: 0,
  };
}

function qualityFromNotes(notes: Readonly<Record<string, ShadowNoteReview>>): {
  notes: number;
  counts: AtomicNoteQualityCounts;
  speechMode: SpeechModeCounts;
  usableNonCreatorSpeech: number;
  creatorAnalysisLabeledAsOther: number;
  unclearOwnership: number;
  missingDiscourseContext: number;
  findings: AtomicNoteQualityFinding[];
} {
  const counts: AtomicNoteQualityCounts = { ...EMPTY_QUALITY_COUNTS };
  const speechMode = emptySpeechModeCounts();
  const findings: AtomicNoteQualityFinding[] = [];
  let usableNonCreatorSpeech = 0;
  let creatorAnalysisLabeledAsOther = 0;
  let unclearOwnership = 0;
  let missingDiscourseContext = 0;
  for (const note of Object.values(notes)) {
    if (!note.discourseContext) missingDiscourseContext += 1;
    if (note.speechMode) {
      speechMode[note.speechMode] += 1;
      if (note.speechMode === 'unclear') unclearOwnership += 1;
      if (NON_CREATOR_SPEECH.has(note.speechMode)) {
        if (note.status === 'usable') usableNonCreatorSpeech += 1;
        if (note.kind === 'creator_analysis') creatorAnalysisLabeledAsOther += 1;
      }
    }
    if (!note.status) continue;
    counts[note.status] += 1;
    if (note.status !== 'usable') {
      findings.push({ noteId: note.id, status: note.status as AtomicNoteQualityStatus });
    }
  }
  findings.sort((left, right) => left.status.localeCompare(right.status) || left.noteId.localeCompare(right.noteId));
  return {
    notes: Object.keys(notes).length,
    counts,
    speechMode,
    usableNonCreatorSpeech,
    creatorAnalysisLabeledAsOther,
    unclearOwnership,
    missingDiscourseContext,
    findings,
  };
}

function snapshotIds(file: ShadowLabelFile, noteId: string, which: 'retrieved' | 'jev'): string[] | null {
  const snapshot = file.retrieval.find((entry) => entry.noteId === noteId);
  if (!snapshot) return null;
  return which === 'retrieved' ? snapshot.retrievedCandidateIds : snapshot.jevCandidateIds;
}

function pairDecision(
  decisions: readonly ShadowDecisionRecord[],
  noteId: string,
  candidateId: string,
): ShadowDecisionRecord | null {
  return (
    decisions.find(
      (decision) =>
        decision.decisionKind === 'pair' && decision.noteId === noteId && decision.candidateId === candidateId,
    ) || null
  );
}

function shownToJev(file: ShadowLabelFile, noteId: string, candidateId: string): boolean {
  if (!isUsableAtomicNote(file, noteId) || !isUsableAtomicNote(file, candidateId)) return false;
  const rawJevIds = snapshotIds(file, noteId, 'jev');
  if (rawJevIds) return semanticCandidateIds(rawJevIds, file).includes(candidateId);
  return file.rows.some((row) => row.noteId === noteId && row.candidateId === candidateId && row.inJevSet);
}

export function scoreShadowEvaluation(
  file: ShadowLabelFile,
  decisions: readonly ShadowDecisionRecord[],
): ShadowReport {
  assertLabelsReady(file);
  if (!decisions.length) {
    throw new JevShadowError('No Jev decisions to score', 'decisions_missing');
  }

  const scored = jevRows(file);
  const quality = qualityFromNotes(file.notes);
  const queries = recallQueries(file);
  let rawTop10 = 0;
  let rawTop5 = 0;
  for (const query of queries) {
    const retrieved = snapshotIds(file, query.noteId, 'retrieved');
    const top5 = snapshotIds(file, query.noteId, 'jev');
    if (!retrieved || !top5) {
      throw new JevShadowError(`Label file has no retrieval snapshot for ${query.noteId}`, 'labels_invalid');
    }
    if (query.acceptableIds.some((id) => retrieved.includes(id))) rawTop10 += 1;
    if (query.acceptableIds.some((id) => top5.includes(id))) rawTop5 += 1;
  }

  const unlabeledShownPairIds: Array<{ noteId: string; candidateId: string }> = [];
  for (const decision of decisions) {
    if (decision.decisionKind !== 'pair' || !decision.candidateId) continue;
    if (!isUsableAtomicNote(file, decision.noteId) || !isUsableAtomicNote(file, decision.candidateId)) continue;
    const row = file.rows.find((entry) => entry.noteId === decision.noteId && entry.candidateId === decision.candidateId);
    if (row && !labelRowCountsForJev(file, row)) continue;
    if (!row || row.relation == null) unlabeledShownPairIds.push({ noteId: decision.noteId, candidateId: decision.candidateId });
  }

  const v1FalseMerges = scored.filter((row) => row.v1SameThread && row.relation !== 'same_event').length;
  const shownRows = scored.filter((row) => row.relation != null && shownToJev(file, row.noteId, row.candidateId));

  let pairShown = 0;
  let pairCorrect = 0;
  for (const row of shownRows) {
    const decision = pairDecision(decisions, row.noteId, row.candidateId);
    if (!decision) continue;
    pairShown += 1;
    if (decision.pairChoice === row.relation) pairCorrect += 1;
  }

  const choiceQueries = new Map<string, string | null>();
  for (const decision of decisions) {
    if (decision.decisionKind === 'candidate_choice') choiceQueries.set(decision.noteId, decision.candidateChoice);
  }
  for (const decision of decisions) {
    if (decision.decisionKind !== 'pair' || choiceQueries.has(decision.noteId)) continue;
    choiceQueries.set(decision.noteId, decision.candidateChoice);
  }
  let choiceTotal = 0;
  let choiceCorrect = 0;
  for (const [noteId, choice] of choiceQueries) {
    if (!isUsableAtomicNote(file, noteId)) continue;
    const acceptableIds = acceptableCandidateIds(file, noteId);
    const options = semanticCandidateIds(snapshotIds(file, noteId, 'jev') || [], file);
    if (acceptableIds.length && !acceptableIds.some((id) => options.includes(id))) continue;
    choiceTotal += 1;
    if (choiceIsAcceptable(choice, acceptableIds)) choiceCorrect += 1;
  }

  const thresholds: ShadowThresholdScore[] = JEV_NOUL_THRESHOLDS.map((noul) => {
    let falseMerges = 0;
    let falseSplits = 0;
    let policyMerges = 0;
    let candidateChoiceAcceptable = 0;
    let relationshipSameEvent = 0;
    let noulCleared = 0;

    for (const row of shownRows) {
      const decision = pairDecision(decisions, row.noteId, row.candidateId);
      if (!decision) continue;
      const acceptableIds = acceptableCandidateIds(file, row.noteId);
      if (choiceIsAcceptable(decision.candidateChoice, acceptableIds)) candidateChoiceAcceptable += 1;
      if (decision.pairChoice === 'same_event') relationshipSameEvent += 1;
      if (decision.sameEventNoul != null && decision.sameEventNoul >= noul) noulCleared += 1;
      const recommendation = pairRecommendation({
        candidateChoice: decision.candidateChoice,
        candidateId: row.candidateId,
        pairChoice: decision.pairChoice,
        noul: decision.sameEventNoul,
        noulThreshold: noul,
      });
      if (recommendation === 'merge') {
        policyMerges += 1;
        if (row.relation !== 'same_event') falseMerges += 1;
      }
      if (row.relation === 'same_event') {
        const accepted = sameEventChoiceAndNoul({
          pairChoice: decision.pairChoice,
          noul: decision.sameEventNoul,
          noulThreshold: noul,
        });
        if (!accepted) falseSplits += 1;
      }
    }

    return {
      noul,
      falseMerges,
      falseSplits,
      policyMerges,
      candidateChoiceAcceptable,
      relationshipSameEvent,
      noulCleared,
    };
  });

  return {
    labelRows: file.rows.length,
    jevScoredRows: scored.length,
    queryCandidateRecall: {
      queries: queries.length,
      rawTop10,
      rawTop5,
    },
    retrievalMisses: queries.length - rawTop5,
    candidateChoiceAccuracy: { correct: choiceCorrect, total: choiceTotal },
    pairRelationshipAccuracy: { correct: pairCorrect, total: pairShown },
    v1FalseMerges,
    unlabeledShownPairs: unlabeledShownPairIds.length,
    unlabeledShownPairIds,
    atomicNoteQuality: {
      notes: quality.notes,
      counts: quality.counts,
      speechMode: quality.speechMode,
      usableNonCreatorSpeech: quality.usableNonCreatorSpeech,
      creatorAnalysisLabeledAsOther: quality.creatorAnalysisLabeledAsOther,
      unclearOwnership: quality.unclearOwnership,
      missingDiscourseContext: quality.missingDiscourseContext,
      excludedRows: file.rows.length - scored.length,
      findings: quality.findings,
    },
    thresholds,
  };
}

function formatQualityFindings(report: ShadowReport): string[] {
  const quality = report.atomicNoteQuality;
  const lines = [
    `Atomic Notes reviewed: ${quality.notes}`,
    `Atomic Note quality findings: ${quality.findings.length}`,
    `Rows excluded from Jev accuracy: ${quality.excludedRows}`,
    `  usable: ${quality.counts.usable}`,
  ];
  const statuses: AtomicNoteQualityStatus[] = ['misattributed', 'unsupported', 'non_editorial', 'unclear'];
  for (const status of statuses) {
    const ids = quality.findings.filter((finding) => finding.status === status).map((finding) => finding.noteId);
    if (!ids.length) continue;
    lines.push(`  ${status}: ${ids.length} (${ids.join(', ')})`);
  }
  const modes: JevSpeechMode[] = [...JEV_SPEECH_MODES];
  for (const mode of modes) {
    lines.push(`  speechMode ${mode}: ${quality.speechMode[mode]}`);
  }
  lines.push(`Usable notes with non-creator speech: ${quality.usableNonCreatorSpeech}`);
  lines.push(`Creator-analysis notes labeled as other speech: ${quality.creatorAnalysisLabeledAsOther}`);
  lines.push(`Notes whose ownership could not be determined: ${quality.unclearOwnership}`);
  lines.push(`Notes without recoverable discourse context: ${quality.missingDiscourseContext}`);
  return lines;
}

function formatModelCatalog(metadata?: ShadowRunMetadata | null): string[] {
  if (!metadata) return [];
  const lines = [
    `Requested model: ${metadata.requestedModel}`,
    `Model catalog name: ${metadata.modelCatalogName}`,
    `Model catalog release date: ${metadata.modelCatalogReleaseDate}`,
  ];
  if (metadata.modelCatalogDescription) {
    lines.push(`Model catalog description: ${metadata.modelCatalogDescription}`);
  }
  if (metadata.returnedModels.length) {
    lines.push(`Returned models: ${metadata.returnedModels.join(', ')}`);
  }
  if (metadata.unexpectedReturnedModels.length) {
    lines.push(`Unexpected returned models: ${metadata.unexpectedReturnedModels.join(', ')}`);
  }
  return lines;
}

export function formatShadowReport(report: ShadowReport, metadata?: ShadowRunMetadata | null): string {
  const lines = [
    'Jev shadow evaluation',
    ...formatModelCatalog(metadata),
    metadata?.semanticEligibility || JEV_SEMANTIC_ELIGIBILITY,
    `Label rows: ${report.labelRows}`,
    `Jev-scored rows: ${report.jevScoredRows}`,
    ...formatQualityFindings(report),
    `Query-level raw candidate recall, top 10: ${report.queryCandidateRecall.rawTop10}/${report.queryCandidateRecall.queries}`,
    `Query-level raw candidate recall, top 5: ${report.queryCandidateRecall.rawTop5}/${report.queryCandidateRecall.queries}`,
    `Retrieval misses (not Jev semantic failures): ${report.retrievalMisses}`,
    `Candidate-choice accuracy: ${report.candidateChoiceAccuracy.correct}/${report.candidateChoiceAccuracy.total}`,
    `Pair relationship accuracy: ${report.pairRelationshipAccuracy.correct}/${report.pairRelationshipAccuracy.total}`,
    `V1 false merges on Jev-scored rows: ${report.v1FalseMerges}`,
    `Shown pairs without a human label: ${report.unlabeledShownPairs}`,
    ...report.unlabeledShownPairIds.map((pair) => `  unlabeled shown pair: ${pair.noteId} -> ${pair.candidateId}`),
    'False event merges are the primary metric. Counts below include only human-labeled pairs Jev was shown where both Atomic Notes were labeled usable. Unlabeled shown pairs are listed and left out of accuracy.',
  ];
  for (const score of report.thresholds) {
    lines.push(
      `noul>=${score.noul} falseMerges=${score.falseMerges} falseSplits=${score.falseSplits} policyMerges=${score.policyMerges} candidateChoiceAcceptable=${score.candidateChoiceAcceptable} relationshipSameEvent=${score.relationshipSameEvent} noulCleared=${score.noulCleared}`,
    );
  }
  return lines.join('\n');
}
