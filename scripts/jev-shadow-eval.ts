import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { createSupabaseAtomicNotesReader } from '@/lib/eventThreads/db';
import { parseJevShadowArgs } from '@/lib/jev/args';
import { JevShadowError } from '@/lib/jev/errors';
import { cachedTranscriptsForSources } from '@/lib/jev/discourse';
import { creatorNamesFromVoices, exportShadowLabelSheet, parseShadowLabelFile, type CreatorNameById } from '@/lib/jev/labels';
import { formatJevEvalEligibility, planJevShadowEvaluation } from '@/lib/jev/eligibility';
import { parseShadowDecisionJsonl, parseShadowRunMetadata, shadowLogPath, writeShadowEvaluationLog, writeShadowLabelFile } from '@/lib/jev/log';
import { createTypeSafeJevProvider } from '@/lib/jev/provider';
import { formatShadowReport, scoreShadowEvaluation } from '@/lib/jev/report';
import { prepareCorpus } from '@/lib/jev/retrieve';
import { runJevShadowEvaluation } from '@/lib/jev/shadow';
import type { ShadowLabelFile } from '@/lib/jev/types';

function readLabelFile(path: string): ShadowLabelFile {
  return parseShadowLabelFile(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

async function loadGroups(sourceItemIds: string[]) {
  if (!sourceItemIds.length) {
    throw new JevShadowError('Missing --source-item <id>', 'args_invalid');
  }
  const reader = createSupabaseAtomicNotesReader();
  const groups = [];
  for (const sourceItemId of sourceItemIds) {
    console.error(`loading source=${sourceItemId}`);
    const notes = await reader.loadNotesBySourceItemId(sourceItemId);
    groups.push({ sourceItemId, notes });
  }
  return groups;
}

async function creatorNamesFor(
  groups: Array<{ notes: readonly CreatorAtomicNote[] }>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      groups.flatMap((group) => group.notes.map((note) => note.creatorId).filter((id): id is string => Boolean(id))),
    ),
  ];
  if (!ids.length) return new Map();
  try {
    const { getEnabledVoices } = await import('@/lib/notion/voices.repo');
    const voices = await getEnabledVoices();
    if (!voices.length) {
      console.error('creator names unavailable: voice catalog returned no enabled voices');
      return new Map();
    }
    const names = creatorNamesFromVoices(voices, ids);
    const missing = ids.filter((id) => !names.has(id));
    if (missing.length) console.error(`creator names missing: ${missing.join(', ')}`);
    console.error(`creator names resolved=${names.size}`);
    return names;
  } catch (error) {
    console.error(`creator names unavailable: ${error instanceof Error ? error.message : error}`);
    return new Map();
  }
}

async function main() {
  const args = parseJevShadowArgs(process.argv.slice(2));

  if (args.exportLabels) {
    const groups = await loadGroups(args.sourceItemIds);
    const creatorNames: CreatorNameById = await creatorNamesFor(groups);
    const stored = cachedTranscriptsForSources(groups);
    console.error(`transcripts recovered=${stored.transcripts.size} unmapped=${stored.failures.size}`);
    const sheet = exportShadowLabelSheet(groups, console.error, creatorNames, stored.transcripts, stored.failures);
    const json = `${JSON.stringify(sheet, null, 2)}\n`;
    if (args.outPath) writeShadowLabelFile(args.outPath, json);
    else console.log(json);
    return;
  }

  if (!args.labelsPath) {
    throw new JevShadowError('Missing --labels <file>', 'args_invalid');
  }
  const labels = readLabelFile(args.labelsPath);

  if (args.eval) {
    const groups = await loadGroups(labels.sourceItemIds);
    const prepared = prepareCorpus(groups);
    const plan = planJevShadowEvaluation(labels, prepared);
    console.log(formatJevEvalEligibility(plan));
    if (!plan.expectedJevQueryIds.length) {
      console.log('providerCalls=0');
      console.log('decisions=0');
      console.log('evaluatedQueryNoteIds=');
      return;
    }
    const evaluationRunId = randomUUID();
    const provider = createTypeSafeJevProvider();
    const { metadata, records, providerCalls, evaluatedQueryNoteIds } = await runJevShadowEvaluation({
      groups,
      labels,
      provider,
      evaluationRunId,
      prepared,
    });
    if (!metadata) {
      console.log(`providerCalls=${providerCalls}`);
      console.log(`decisions=${records.length}`);
      console.log(`evaluatedQueryNoteIds=${evaluatedQueryNoteIds.join(',')}`);
      return;
    }
    const path = args.outPath || shadowLogPath(evaluationRunId);
    writeShadowEvaluationLog(path, metadata, records);
    console.log(`evaluationRunId=${evaluationRunId}`);
    console.log(`requestedModel=${metadata.requestedModel}`);
    console.log(`modelCatalogName=${metadata.modelCatalogName}`);
    console.log(`modelCatalogReleaseDate=${metadata.modelCatalogReleaseDate}`);
    if (metadata.modelCatalogDescription) {
      console.log(`modelCatalogDescription=${metadata.modelCatalogDescription}`);
    }
    if (metadata.returnedModels.length) {
      console.log(`returnedModels=${metadata.returnedModels.join(',')}`);
    }
    if (metadata.unexpectedReturnedModels.length) {
      const warning = `unexpected returned model: ${metadata.unexpectedReturnedModels.join(', ')} does not match requested ${metadata.requestedModel}`;
      console.error(warning);
      console.log(`unexpectedReturnedModels=${metadata.unexpectedReturnedModels.join(',')}`);
    }
    console.log(`providerCalls=${providerCalls}`);
    console.log(`decisions=${records.length}`);
    console.log(`evaluatedQueryNoteIds=${evaluatedQueryNoteIds.join(',')}`);
    console.log(`log=${path}`);
    return;
  }

  const decisionsPath = args.decisionsPath || args.outPath;
  if (!decisionsPath) {
    throw new JevShadowError('Missing --decisions <file>', 'args_invalid');
  }
  const decisionText = readFileSync(decisionsPath, 'utf8');
  const decisions = parseShadowDecisionJsonl(decisionText);
  const metadata = parseShadowRunMetadata(decisionText);
  const report = scoreShadowEvaluation(labels, decisions);
  console.log(formatShadowReport(report, metadata));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
