import { JevShadowError } from '@/lib/jev/errors';

export type JevShadowArgs = {
  exportLabels: boolean;
  eval: boolean;
  report: boolean;
  sourceItemIds: string[];
  labelsPath: string | null;
  decisionsPath: string | null;
  outPath: string | null;
};

function argValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === name) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new JevShadowError(`Missing value for ${name}`, 'args_invalid');
      values.push(next);
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    }
  }
  return values;
}

function argValue(argv: string[], name: string): string | null {
  const values = argValues(argv, name);
  return values.length ? values[values.length - 1] : null;
}

export function parseJevShadowArgs(argv: string[]): JevShadowArgs {
  const exportLabels = argv.includes('--export-labels');
  const evaluate = argv.includes('--eval');
  const report = argv.includes('--report');
  const selected = [exportLabels, evaluate, report].filter(Boolean).length;
  if (selected !== 1) {
    throw new JevShadowError('Choose one of --export-labels, --eval, or --report', 'args_invalid');
  }
  return {
    exportLabels,
    eval: evaluate,
    report,
    sourceItemIds: argValues(argv, '--source-item'),
    labelsPath: argValue(argv, '--labels'),
    decisionsPath: argValue(argv, '--decisions'),
    outPath: argValue(argv, '--out'),
  };
}
