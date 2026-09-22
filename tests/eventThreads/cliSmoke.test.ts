import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildEventThreads } from '@/lib/eventThreads/build';
import { parseEventThreadsBuildArgs } from '@/lib/eventThreads/format';
import { createMemoryAtomicNotesReader } from '@/lib/eventThreads/store';
import { totalWrites } from '@/lib/eventThreads/writes';
import { makeNote } from './helpers';

const CLI_PATH = join(process.cwd(), 'scripts/event-threads-build.ts');
const JIANG_SOURCE_ITEM = '6aaaebbe8a1508074d789adc';

function namedImportSpecifier(source: string, exportName: string): string {
  const blocks = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)];
  for (const [, names, specifier] of blocks) {
    const imported = names.split(',').map((part) => part.trim().split(/\s+as\s+/)[0]?.trim());
    if (imported.includes(exportName)) return specifier;
  }
  throw new Error(`Event Threads CLI does not import ${exportName}`);
}

describe('Event Threads CLI dry-run wiring', () => {
  it('resolves the real dry-run writer, reaches build, and performs zero writes', async () => {
    const args = parseEventThreadsBuildArgs(['--source-item', JIANG_SOURCE_ITEM, '--dry-run']);
    expect(args.dryRun).toBe(true);

    const cliSrc = readFileSync(CLI_PATH, 'utf8');
    expect(cliSrc).toMatch(/writer:\s*createDryRunEventThreadsWriter\(\)/);

    const specifier = namedImportSpecifier(cliSrc, 'createDryRunEventThreadsWriter');
    const mod = await import(specifier);
    expect(typeof mod.createDryRunEventThreadsWriter).toBe('function');

    const writer = mod.createDryRunEventThreadsWriter();
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone.',
        sourceItemId: args.sourceItemId,
        startSeconds: 10,
      }),
      makeNote({
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone after the navy warning.',
        sourceItemId: args.sourceItemId,
        startSeconds: 20,
      }),
    ];

    const result = await buildEventThreads({
      sourceItemId: args.sourceItemId,
      dryRun: args.dryRun,
      reader: createMemoryAtomicNotesReader(notes),
      writer,
      aiConfig: null,
    });

    expect(result.persistence.dryRun).toBe(true);
    expect(result.atomicNotesConsidered).toBe(notes.length);
    expect(result.threadsProposed).toBeGreaterThan(0);
    expect(totalWrites(result.writes)).toBe(0);
    expect(totalWrites(writer.writes)).toBe(0);
    await expect(writer.insertThreads([])).rejects.toThrow(/forbids writes/);
  });
});
