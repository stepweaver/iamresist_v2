import fs from 'node:fs';
import path from 'node:path';

import {
  buildHeadlineJevCandidateSnapshot,
  parseHeadlineJevCandidateSnapshot,
} from '@/lib/headlineTimeline/jev/candidateSnapshot';
import { headlineJevEvalUsage, parseHeadlineJevEvalArgs } from '@/lib/headlineTimeline/jev/evalArgs';
import { evaluateHeadlinePairs } from '@/lib/headlineTimeline/jev/evaluate';
import { formatJevEvaluationReport, jevEvaluationArtifact, type HeadlineJevCorpusNote } from '@/lib/headlineTimeline/jev/report';
import { loadHeadlineCandidates, type LoadedHeadlineCandidates } from '@/lib/headlineTimeline/load';

function writeJson(filePath: string, value: unknown) {
  const destination = path.resolve(filePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return destination;
}

function readSnapshot(filePath: string): LoadedHeadlineCandidates {
  const destination = path.resolve(filePath);
  let raw: string;
  try {
    raw = fs.readFileSync(destination, 'utf8');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'ENOENT') throw new Error(`Candidate snapshot not found: ${destination}`);
    throw error;
  }
  const snapshot = parseHeadlineJevCandidateSnapshot(raw);
  return {
    candidates: snapshot.candidates,
    warnings: snapshot.warnings,
    windowHours: snapshot.windowHours,
    generatedAt: snapshot.generatedAt,
    counts: snapshot.counts,
  };
}

async function main() {
  const options = parseHeadlineJevEvalArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${headlineJevEvalUsage()}\n`);
    return;
  }

  let loaded: LoadedHeadlineCandidates;
  if (options.inputPath) {
    loaded = readSnapshot(options.inputPath);
    process.stderr.write(`loaded ${loaded.candidates.length} candidates from ${path.resolve(options.inputPath)}\n`);
  } else {
    loaded = await loadHeadlineCandidates({ newswire: 'uncached' });
    if (options.saveCandidatesPath) {
      const destination = writeJson(
        options.saveCandidatesPath,
        buildHeadlineJevCandidateSnapshot(loaded),
      );
      process.stderr.write(`wrote candidates ${destination}\n`);
    }
  }

  const corpus: HeadlineJevCorpusNote = {
    mode: options.inputPath ? 'snapshot' : 'live',
    snapshot: options.inputPath ?? options.saveCandidatesPath,
  };

  const evaluation = await evaluateHeadlinePairs(loaded.candidates, {
    limit: options.limit,
    sampleSkipped: options.sampleSkipped,
    windowHours: loaded.windowHours,
    onClassified(_record, index) {
      process.stderr.write(`jev ${index}\n`);
    },
  });
  process.stdout.write(formatJevEvaluationReport(evaluation, {
    warnings: loaded.warnings,
    limit: options.limit,
    corpus,
  }));
  if (options.jsonPath) {
    const destination = writeJson(options.jsonPath, jevEvaluationArtifact(evaluation, {
      generatedAt: loaded.generatedAt,
      windowHours: loaded.windowHours,
      limit: options.limit,
      sampleSkipped: options.sampleSkipped,
      warnings: loaded.warnings,
      corpus,
    }));
    process.stderr.write(`wrote ${destination}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
