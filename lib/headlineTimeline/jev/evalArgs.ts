import { headlineJevCandidateSnapshotPath } from '@/lib/headlineTimeline/jev/candidateSnapshot';

export type HeadlineJevEvalArgs = {
  limit: number;
  sampleSkipped: number;
  jsonPath: string | null;
  /** When set, candidates are read from this snapshot instead of live feeds. */
  inputPath: string | null;
  /** When set, the live load is written here before the eval runs. */
  saveCandidatesPath: string | null;
  help: boolean;
};

export function headlineJevEvalUsage(): string {
  return [
    'Usage: npm run brief:jev-eval -- [--limit <n>] [--sample-skipped <n>] [--json <path>] [--save-candidates [path]] [--input <snapshot.json>]',
    '',
    '--limit <n>            Jev calls to make. Default 25. 0 runs the prefilter and does not call Jev.',
    '                       On a frozen --input snapshot this is a stable prefix of the',
    '                       ask_jev queue: the same pairs, in the same order, on every replay.',
    '                       --limit 20 --input tmp/headline-jev-eval/candidates-20261002.json',
    '                       reruns that snapshot\'s first 20 Jev pairs. No separate --pair-limit.',
    '--sample-skipped <n>   Skipped pairs to print for false-negative review. Default 0. Does not call Jev.',
    '--json <path>          Write a local JSON artifact. Does not write to Supabase.',
    '--save-candidates [path]',
    '                       Freeze the live candidate load. Default path is',
    '                       tmp/headline-jev-eval/candidates-YYYYMMDD.json.',
    '                       Live feeds are still read. Use --limit 0 to skip Jev.',
    '--input <snapshot.json>',
    '                       Reuse a saved candidate file. Does not read live feeds.',
    '',
    'Live mode is the default: omit --input and the command loads current candidates.',
    'Snapshot mode (--input) keeps Jev, human review, and threshold tuning on one corpus.',
    '--save-candidates and --input cannot be combined.',
    '',
    'Examples:',
    '  npm run brief:jev-eval -- --limit 0 --save-candidates',
    '  npm run brief:jev-eval -- --limit 0 --sample-skipped 25 --input tmp/headline-jev-eval/candidates-20261002.json',
    '  npm run brief:jev-eval -- --limit 10 --sample-skipped 25 --json tmp/headline-jev-eval/run-02.json',
    '  npm run brief:jev-eval -- --limit 20 --input tmp/headline-jev-eval/candidates-20261002.json --json tmp/headline-jev-eval/run-03.json',
  ].join('\n');
}

function parseNonNegativeInt(raw: string | undefined, flag: string): number {
  if (raw == null || !/^\d+$/.test(raw)) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return value;
}

function looksLikeFlag(value: string | undefined): boolean {
  return value == null || value.startsWith('-');
}

export function parseHeadlineJevEvalArgs(argv: string[], now = new Date()): HeadlineJevEvalArgs {
  let limit = 25;
  let sampleSkipped = 0;
  let jsonPath: string | null = null;
  let inputPath: string | null = null;
  let saveCandidatesPath: string | null = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg === '--limit' ? argv[++index] : arg.slice('--limit='.length);
      const value = Number(raw);
      if (raw == null || raw === '' || !Number.isInteger(value) || value < 0) {
        throw new Error('--limit must be a non-negative integer');
      }
      limit = value;
      continue;
    }
    if (arg === '--sample-skipped' || arg.startsWith('--sample-skipped=')) {
      const raw = arg === '--sample-skipped' ? argv[++index] : arg.slice('--sample-skipped='.length);
      sampleSkipped = parseNonNegativeInt(raw, '--sample-skipped');
      continue;
    }
    if (arg === '--json' || arg.startsWith('--json=')) {
      const raw = arg === '--json' ? argv[++index] : arg.slice('--json='.length);
      if (!raw) throw new Error('--json requires a path');
      jsonPath = raw;
      continue;
    }
    if (arg === '--input' || arg.startsWith('--input=')) {
      const raw = arg === '--input' ? argv[++index] : arg.slice('--input='.length);
      if (!raw || looksLikeFlag(raw)) throw new Error('--input requires a snapshot path');
      inputPath = raw;
      continue;
    }
    if (arg === '--save-candidates' || arg.startsWith('--save-candidates=')) {
      const inline = arg.startsWith('--save-candidates=') ? arg.slice('--save-candidates='.length) : undefined;
      if (inline != null) {
        if (!inline) throw new Error('--save-candidates requires a path when using =');
        saveCandidatesPath = inline;
        continue;
      }
      const next = argv[index + 1];
      if (next != null && !looksLikeFlag(next)) {
        index += 1;
        saveCandidatesPath = next;
      } else {
        saveCandidatesPath = headlineJevCandidateSnapshotPath(now);
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${headlineJevEvalUsage()}`);
  }

  if (inputPath && saveCandidatesPath) {
    throw new Error('--save-candidates reads live feeds. Omit it when using --input.');
  }

  return { limit, sampleSkipped, jsonPath, inputPath, saveCandidatesPath, help };
}
